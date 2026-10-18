"""Wires the optional layers (prediction, contingency cache, fragility, LLM) into the orchestrator."""

from __future__ import annotations

import logging
import threading

from app.config import Settings
from app.fusion.schema import Plan
from app.fusion.world import WorldState
from app.planning.orchestrator import Planner
from app.precompute.cache import ContingencyCache, build_cache
from app.precompute.fragility import compute_fragility
from app.predict.model import predict_serviceability
from app.predict.weather import weather_impact

log = logging.getLogger("aeolus.service")


class AeolusPlanner(Planner):
    def reset(self) -> None:
        self._risk_memo: tuple[int, int, tuple] | None = None
        super().reset()
        self.cache = ContingencyCache()

    # ---------- predictive inputs ----------

    def risk_inputs(self, ws: WorldState) -> tuple[dict[str, float], dict]:
        key = (id(ws), ws.version)
        if self._risk_memo and self._risk_memo[:2] == key:
            return self._risk_memo[2]
        value = (predict_serviceability(ws), weather_impact(ws))
        self._risk_memo = (*key, value)
        return value

    # ---------- fragility ----------

    def fragility(self, ws: WorldState, plan: Plan) -> dict:
        svc, _ = self.risk_inputs(ws)
        return compute_fragility(ws, plan, svc)

    # ---------- contingency cache ----------

    def cache_lookup(self, signature: str, base_fp: str) -> Plan | None:
        return self.cache.lookup(signature, base_fp, self.ws, self.active)

    def after_publish(self) -> None:
        """Rebuild the contingency cache in the background for the plan just published."""
        self.cache.clear()
        self.cache.status = "building"
        self.cache.generation += 1
        gen = self.cache.generation
        ws_copy = self.ws.clone()
        active = self.active.model_copy(deep=True)
        opts = self.base_options(ws_copy)
        svc = opts.serviceability
        lam = self.stability_lambda
        self.notify("cache")

        def work() -> None:
            try:
                entries, ms = build_cache(ws_copy, active, opts, lam, svc, risk_fn=self.risk_inputs)
            except Exception as exc:  # noqa: BLE001
                log.warning("contingency build failed: %s", exc)
                entries, ms = {}, 0.0
            with self.lock:
                if gen != self.cache.generation:
                    return  # a newer publish started its own build
                self.cache.entries = entries
                self.cache.base_fp = ws_copy.fingerprint()
                self.cache.active_id = active.id
                self.cache.build_ms = ms
                self.cache.status = "ready"
            self.notify("cache")
            self.notify("plan")

        threading.Thread(target=work, name="aeolus-precompute", daemon=True).start()

    def cache_view(self) -> dict:
        with self.lock:
            return self.cache.view(self.ws.fingerprint(), self.active.id if self.active else None)

    def status_view(self) -> dict:
        view = super().status_view()
        view["cache"] = self.cache_view()
        return view


def build_planner(settings: Settings, store=None, notify=None) -> AeolusPlanner:
    return AeolusPlanner(settings, store, notify)

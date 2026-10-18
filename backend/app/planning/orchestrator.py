"""Orchestrator and plan state machine.

  no_plan --generate--> pending_approval --approve--> active --event/chat--> pending_approval ...
                              |                                                   |
                              +--reject (note -> condition, re-solve)-------------+
  active --end plan--> ended (KPI snapshot logged)

The solver produces plans, the validator checks every one, and only an explicit Approve publishes.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field

from app.config import Settings
from app.events.apply import apply_event
from app.events.classify import Classification, classify, combined_signature
from app.events.types import EventIn, describe, normalise
from app.fusion.feed import FeedSimulator
from app.fusion.schema import Plan
from app.fusion.world import WorldState, fmt_min, fuse, wall_now
from app.kpi.tracker import KpiTracker
from app.planning.explain import Change, build_diff, fill_unassigned_reasons, summarise
from app.solver.cpsat import SolveOptions, SolveResult, new_plan_id, solve
from app.solver.greedy import greedy
from app.solver.replan import replan
from app.solver.stability import match_sorties, stability_metrics
from app.validator import ValidationReport, validate_plan

log = logging.getLogger("aeolus.planner")


class PlannerError(Exception):
    pass


class Proposal(BaseModel):
    id: str
    plan: Plan
    previous_id: str | None
    trigger: dict[str, Any]
    validation: ValidationReport
    publishable: bool
    changes: list[Change] = Field(default_factory=list)
    stability: dict[str, Any] = Field(default_factory=dict)
    summary: str
    summary_llm: str | None = None
    timing: dict[str, Any] = Field(default_factory=dict)
    fragility: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class Planner:
    def __init__(self, settings: Settings, store=None, notify: Callable[[str], None] | None = None) -> None:
        self.settings = settings
        self.store = store
        self.notify = notify or (lambda kind: None)
        self.lock = threading.RLock()
        self.reset()

    # ---------- setup ----------

    def reset(self) -> None:
        with self.lock:
            self.ws: WorldState = fuse()
            self.feed = FeedSimulator(seed=self.ws.seed)
            self.active: Plan | None = None
            self.active_validation: ValidationReport | None = None
            self.active_fragility: dict[str, Any] = {}
            self.proposal: Proposal | None = None
            self.baseline: Plan | None = None
            self.baseline_validation: ValidationReport | None = None
            self.status = "no_plan"
            self.kpi = KpiTracker(manual_baseline_min=self.settings.manual_baseline_min)
            self.forbid: list = []
            self.pending_triggers: list[str] = []
            self.events: list[dict] = []
            self.history: list[dict] = []
            self.last_result: dict | None = None
            self.ended: dict | None = None
            self.paused = False
            self.stability_lambda = self.settings.stability_lambda
            self._event_seq = 0

    # ---------- hooks filled in by later modules ----------

    def risk_inputs(self, ws: WorldState) -> tuple[dict[str, float], dict]:
        """(serviceability per aircraft, weather impact per mission/base/type)."""
        return {}, {}

    def fragility(self, ws: WorldState, plan: Plan) -> dict[str, Any]:
        return {}

    def cache_lookup(self, signature: str, base_fp: str) -> Plan | None:
        return None

    def after_publish(self) -> None:
        pass

    def parse_note(self, text: str) -> tuple[list[EventIn], str]:
        return [], "none"

    def reword(self, proposal: Proposal) -> None:
        pass

    # ---------- helpers ----------

    def base_options(self, ws: WorldState | None = None) -> SolveOptions:
        ws = ws or self.ws
        svc, wx = self.risk_inputs(ws)
        return SolveOptions(time_limit_s=self.settings.solver_time_limit_s, serviceability=svc, weather_impact=wx)

    def earliest(self) -> float:
        return max(self.ws.rules.horizon_start, self.ws.now + self.ws.rules.freeze_min)

    def _proposal(self, res: SolveResult, previous: Plan | None, trigger: dict, path: str, t0: float,
                  feas=None) -> Proposal:
        ws = self.ws
        plan = res.plan
        feas = feas if feas is not None else res.feasibility
        if feas is not None:
            fill_unassigned_reasons(ws, plan, feas)
        validation = validate_plan(ws, plan, ws.now)
        plan.status = "pending_approval" if validation.ok else "invalid"
        svc, _ = self.risk_inputs(ws)
        stab = stability_metrics(previous, plan)
        label = trigger.get("label", "change")
        if previous is not None:
            changes = build_diff(ws, previous, plan, label, ws.now, feas, svc)
            summary = summarise(changes, stab, label, len(plan.unassigned))
        else:
            changes = []
            covered = len({s.mission_id for s in plan.sorties})
            summary = (f"Initial plan: {covered} of {len(ws.open_missions())} missions covered with "
                       f"{len(plan.sorties)} sorties. {len(plan.unassigned)} unassigned (reasons in the mission table).")
        total_ms = (time.perf_counter() - t0) * 1000
        prop = Proposal(
            id=plan.id, plan=plan, previous_id=previous.id if previous else None, trigger=trigger,
            validation=validation, publishable=validation.ok, changes=changes, stability=stab, summary=summary,
            timing={"total_ms": round(total_ms, 1), "solve_ms": round(res.wall_ms, 1), "path": path,
                    "solver_status": res.status},
            fragility=self.fragility(ws, plan), created_at=wall_now(),
        )
        if self.proposal is not None and self.proposal.id != prop.id:
            self._close_proposal("superseded")
        self.proposal = prop
        self.status = "pending_approval"
        self.kpi.record_changes(changes)
        self.last_result = {"plan_id": plan.id, "path": path, "total_ms": prop.timing["total_ms"],
                            "changed": stab["changed"], "added": stab["added"], "total": stab["total"],
                            "publishable": validation.ok, "label": label}
        if self.store:
            self.store.save_plan(plan.model_dump(), plan.status, label, validation.model_dump(), stab["stability_pct"])
        threading.Thread(target=self._reword_safe, args=(prop,), daemon=True).start()
        return prop

    def _reword_safe(self, prop: Proposal) -> None:
        try:
            self.reword(prop)
            if prop.summary_llm:
                self.notify("plan")
        except Exception as exc:  # noqa: BLE001
            log.info("summary reword skipped: %s", exc)

    def _close_proposal(self, status: str) -> None:
        if self.proposal is None:
            return
        self.proposal.plan.status = status
        if self.store:
            self.store.set_plan_status(self.proposal.id, status)
        self.history.append({"id": self.proposal.id, "status": status, "at": wall_now(),
                             "label": self.proposal.trigger.get("label")})
        self.proposal = None

    def _require_proposal(self, plan_id: str) -> Proposal:
        if self.proposal is None:
            raise PlannerError("There is no plan waiting for approval.")
        if plan_id and plan_id != self.proposal.id:
            raise PlannerError(f"Plan {plan_id} is not the one waiting for approval ({self.proposal.id}).")
        return self.proposal

    # ---------- lifecycle ----------

    def generate(self) -> Proposal:
        with self.lock:
            if self.active is not None:
                raise PlannerError("A plan is already active. Use events or chat to replan, or reset the scenario.")
            t0 = time.perf_counter()
            opts = self.base_options()
            opts.earliest = self.earliest()
            opts.forbid = list(self.forbid)
            res = solve(self.ws, opts)
            g = greedy(self.ws, self.earliest())
            fill_unassigned_reasons(self.ws, g.plan, g.feasibility)
            self.baseline = g.plan
            self.baseline_validation = validate_plan(self.ws, g.plan, self.ws.now)
            self.kpi.record_initial(res.wall_ms, g.wall_ms)
            if self.store:
                self.store.save_plan(g.plan.model_dump(), "baseline", "greedy baseline",
                                     self.baseline_validation.model_dump())
            prop = self._proposal(res, None, {"kind": "initial", "label": "initial plan"}, "initial", t0)
            self.notify("plan")
            return prop

    def approve(self, plan_id: str) -> Plan:
        with self.lock:
            prop = self._require_proposal(plan_id)
            if not prop.publishable:
                raise PlannerError("This plan has constraint violations and cannot be published.")
            rep = validate_plan(self.ws, prop.plan, self.ws.now)  # re-check against the picture right now
            if not rep.ok:
                raise PlannerError(f"The picture changed and this plan now breaks {len(rep.violations)} rule(s): "
                                   f"{rep.violations[0].message}. Replan first.")
            if self.active is not None:
                self.active.status = "superseded"
                if self.store:
                    self.store.set_plan_status(self.active.id, "superseded")
                self.history.append({"id": self.active.id, "status": "superseded", "at": wall_now()})
            plan = prop.plan
            plan.status = "active"
            self.active, self.active_validation = plan, rep
            self.active_fragility = prop.fragility or self.fragility(self.ws, plan)
            self.proposal = None
            self.status = "active"
            self.forbid = []
            self.pending_triggers = []
            self.kpi.approvals += 1
            self.history.append({"id": plan.id, "status": "active", "at": wall_now(),
                                 "label": prop.trigger.get("label")})
            if self.store:
                self.store.save_plan(plan.model_dump(), "active", prop.trigger.get("label"), rep.model_dump(),
                                     prop.stability.get("stability_pct"))
                self.store.save_decision(plan.id, "approved", None)
            self.after_publish()
            self.notify("plan")
            return plan

    def reject(self, plan_id: str, note: str) -> Proposal:
        with self.lock:
            prop = self._require_proposal(plan_id)
            note = (note or "").strip()
            t0 = time.perf_counter()
            if self.store:
                self.store.save_decision(prop.id, "rejected", note)
            self.kpi.rejections += 1
            previous = self.active
            # cut this exact alternative so the next solve has to return something different
            pairs = match_sorties(previous, prop.plan)
            added = [(p.new.mission_id, p.new.aircraft_id, p.new.crew_id) for p in pairs
                     if p.kind != "same" and p.new is not None]
            dropped = [(p.old.mission_id, p.old.aircraft_id, p.old.crew_id) for p in pairs
                       if p.kind != "same" and p.old is not None]
            if added or dropped:
                self.forbid.append((added, dropped))
            self._close_proposal("rejected")

            conditions, parser = self.parse_note(note) if note else ([], "none")
            applied = []
            for ev in conditions:
                ev = normalise(EventIn(type=ev.type, params=ev.params, origin="reject note"), self.ws)
                apply_event(ev, self.ws, self.active)
                applied.append(describe(ev, self.ws))
            label = f"planner rejected {prop.id}" + (f": {note}" if note else "")
            if applied:
                label += f" (new condition: {'; '.join(applied)})"
            self.pending_triggers.append(label)

            opts = self.base_options()
            opts.forbid = list(self.forbid)
            if previous is not None:
                res = replan(self.ws, previous, self.ws.now, opts, self.stability_lambda)
            else:
                opts.earliest = self.earliest()
                res = solve(self.ws, opts)
            trigger = {"kind": "reject", "label": label, "note": note, "conditions": applied, "parser": parser}
            new = self._proposal(res, previous, trigger, "reject loop", t0)
            self.notify("plan")
            if applied:
                self.notify("world")
            return new

    def inject(self, events: list[EventIn], kind: str = "event", text: str | None = None) -> dict:
        """Event path: classify, apply, cache check, replan (or load cached plan), validate, propose."""
        with self.lock:
            t0 = time.perf_counter()
            normalised = [normalise(e, self.ws) for e in events]
            base_fp = self.ws.fingerprint()
            classes: list[Classification] = [classify(e, self.ws, self.active) for e in normalised]
            sig = combined_signature(normalised)
            for e in normalised:
                apply_event(e, self.ws, self.active)
            labels = [describe(e, self.ws) for e in normalised]
            self.pending_triggers.append("; ".join(labels))
            label = " + ".join(self.pending_triggers)

            records = []
            for e, c in zip(normalised, classes, strict=True):
                self._event_seq += 1
                records.append({"id": f"E{self._event_seq:03d}-{int(time.time()) % 100000}", "type": e.type,
                                "origin": e.origin, "params": e.params, "sim_time": round(self.ws.now, 1),
                                "clock": fmt_min(self.ws.now), "classification": c.model_dump(),
                                "signature": c.signature, "description": describe(e, self.ws), "at": wall_now()})

            prop = None
            path = "no plan"
            if self.active is not None or self.proposal is not None:
                cached = self.cache_lookup(sig, base_fp) if self.active is not None else None
                if cached is not None:
                    path = "cache hit"
                    plan = cached.model_copy(deep=True)
                    plan.id, plan.source, plan.parent_id, plan.created_at = new_plan_id(), "cache", self.active.id, wall_now()
                    res = SolveResult(plan=plan, status="CACHED", objective=plan.objective or 0.0,
                                      wall_ms=(time.perf_counter() - t0) * 1000)
                    trial = validate_plan(self.ws, plan, self.ws.now)
                    if not trial.ok:
                        path, cached = "cache stale", None
                if cached is None:
                    if path != "cache stale":
                        path = "cache miss" if self.active is not None else "re-solve"
                    opts = self.base_options()
                    if self.active is not None:
                        res = replan(self.ws, self.active, self.ws.now, opts, self.stability_lambda)
                    else:
                        opts.earliest = self.earliest()
                        res = solve(self.ws, opts)
                trigger = {"kind": kind, "label": label, "events": [r["id"] for r in records],
                           "signature": sig, "text": text}
                prop = self._proposal(res, self.active, trigger, path, t0)
                if self.active is not None:
                    self.kpi.record_replan(prop.timing["total_ms"], path, prop.stability["stability_pct"])
            total_ms = round((time.perf_counter() - t0) * 1000, 1)
            for r in records:
                r.update(cache_hit=path == "cache hit", path=path, replan_ms=prop.timing["total_ms"] if prop else None,
                         proposal_id=prop.id if prop else None)
                self.events.insert(0, r)
                if self.store:
                    self.store.save_event(r)
            self.notify("world")
            self.notify("plan")
            return {"events": records, "proposal": prop, "path": path, "total_ms": total_ms}

    def end_plan(self, reason: str = "planner ended plan") -> dict:
        with self.lock:
            if self.active is None:
                raise PlannerError("No active plan to end.")
            kpis = self.compute_kpis()
            lines = [f"{k.label}: {k.display} ({k.detail})" for k in kpis]
            summary = (f"Plan {self.active.id} ended at {fmt_min(self.ws.now)} ({reason}). "
                       f"{self.kpi.approvals} approvals, {self.kpi.rejections} rejections, {len(self.events)} events.")
            self.ended = {"plan_id": self.active.id, "summary": summary, "lines": lines,
                          "kpis": [k.model_dump() for k in kpis], "at": wall_now(), "reason": reason}
            if self.store:
                self.store.save_kpis(self.ws.seed, reason, self.ended, summary)
                self.store.set_plan_status(self.active.id, "ended")
            self.active.status = "ended"
            self.status = "ended"
            if self.proposal is not None:
                self._close_proposal("superseded")
            self.notify("plan")
            return self.ended

    # ---------- clock + feed ----------

    def advance_clock(self, real_seconds: float) -> bool:
        """Move the scenario clock. Returns True when the minute display changed."""
        with self.lock:
            if self.paused or self.status == "ended":
                return False
            before = int(self.ws.now)
            self.ws.now = min(self.ws.rules.horizon_end, self.ws.now + self.settings.sim_speed * real_seconds / 60.0)
            if self.ws.now >= self.ws.rules.horizon_end and self.active is not None and self.status != "ended":
                self.end_plan("planning horizon reached")
            return int(self.ws.now) != before

    def feed_tick(self) -> list[dict]:
        with self.lock:
            if self.paused:
                return []
            return self.feed.tick(self.ws, self.active)

    # ---------- views ----------

    def compute_kpis(self):
        plan = self.active or (self.proposal.plan if self.proposal else None)
        if self.active is not None:
            self.active_validation = validate_plan(self.ws, self.active, self.ws.now)
            violations = len(self.active_validation.violations)
        elif self.proposal is not None:
            violations = len(self.proposal.validation.violations)
        else:
            violations = None
        bv = len(self.baseline_validation.violations) if self.baseline_validation else None
        return self.kpi.compute(self.ws, plan, self.baseline, violations, bv)

    def status_view(self) -> dict[str, Any]:
        with self.lock:
            kpis = self.compute_kpis()
            return {
                "status": self.status,
                "now": self.ws.now,
                "clock": fmt_min(self.ws.now),
                "paused": self.paused,
                "world_version": self.ws.version,
                "active": self.active.model_dump() if self.active else None,
                "active_validation": self.active_validation.model_dump() if self.active_validation else None,
                "active_fragility": self.active_fragility,
                "proposal": self.proposal.model_dump() if self.proposal else None,
                "baseline": self.baseline.model_dump() if self.baseline else None,
                "kpis": [k.model_dump() for k in kpis],
                "last_result": self.last_result,
                "events": self.events[:30],
                "history": self.history[-20:],
                "ended": self.ended,
                "stability_lambda": self.stability_lambda,
            }

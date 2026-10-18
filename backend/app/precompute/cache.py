"""Contingency cache: after each publish, pre-solve the likeliest events so a matching event
is answered instantly. An entry only hits when the event signature matches AND the world is
exactly as it was when the entry was built (same planning fingerprint, same active plan)."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.events.apply import apply_event
from app.events.classify import signature
from app.events.types import EventIn, describe, normalise
from app.fusion.schema import Plan
from app.fusion.world import WorldState, fmt_min
from app.planning.explain import fill_unassigned_reasons
from app.solver.cpsat import SolveOptions
from app.solver.replan import committed_sorties, replan
from app.solver.stability import stability_metrics
from app.validator import validate_plan


@dataclass
class CacheEntry:
    signature: str
    label: str
    why: str
    event: EventIn
    base_fp: str
    active_id: str
    plan: Plan
    solve_ms: float
    built_at: float  # scenario minute
    changed: int
    unassigned: int


@dataclass
class ContingencyCache:
    entries: dict[str, CacheEntry] = field(default_factory=dict)
    status: str = "empty"  # empty | building | ready
    base_fp: str | None = None
    active_id: str | None = None
    build_ms: float = 0.0
    generation: int = 0

    def clear(self) -> None:
        self.entries.clear()
        self.status, self.base_fp, self.active_id = "empty", None, None

    def lookup(self, sig: str, fp: str, ws: WorldState, active: Plan | None) -> Plan | None:
        e = self.entries.get(sig)
        if e is None or active is None or e.base_fp != fp or e.active_id != active.id:
            return None
        # committed sorties must still be untouched in the cached plan
        cached = {(s.mission_id, s.aircraft_id, s.crew_id, s.takeoff) for s in e.plan.sorties}
        for s in committed_sorties(ws, active, ws.now):
            if (s.mission_id, s.aircraft_id, s.crew_id, s.takeoff) not in cached:
                return None
        old = {(s.mission_id, s.aircraft_id, s.crew_id, s.takeoff) for s in active.sorties}
        cutoff = ws.now + ws.rules.freeze_min
        if any(s.takeoff < cutoff for s in e.plan.sorties if (s.mission_id, s.aircraft_id, s.crew_id, s.takeoff) not in old):
            return None
        return e.plan

    def view(self, current_fp: str, active_id: str | None) -> dict:
        valid = self.base_fp == current_fp and self.active_id == active_id and self.status == "ready"
        return {
            "status": self.status if self.status != "ready" else ("ready" if valid else "stale"),
            "build_ms": round(self.build_ms, 1),
            "entries": [{"signature": e.signature, "label": e.label, "why": e.why, "event": e.event.model_dump(),
                         "solve_ms": round(e.solve_ms, 1), "changed": e.changed, "unassigned": e.unassigned,
                         "valid": valid} for e in self.entries.values()],
        }


def likely_events(ws: WorldState, active: Plan, svc: dict[str, float]) -> list[tuple[EventIn, str]]:
    """The 3-5 likeliest disruptions for the active plan, from predictions and the forecast."""
    future = [s for s in active.sorties if s.takeoff >= ws.now + ws.rules.freeze_min]
    out: list[tuple[EventIn, str]] = []
    seen: set[str] = set()

    tasked = sorted({s.aircraft_id for s in future}, key=lambda a: (svc.get(a, 0.9), a))
    for aid in tasked[:2]:
        out.append((EventIn(type="aircraft_down", params={"aircraft_id": aid}, origin="contingency"),
                    f"lowest predicted serviceability ({round(svc.get(aid, 0.9) * 100)}%)"))
        seen.add(aid)
    counts: dict[str, int] = {}
    for s in future:
        counts[s.aircraft_id] = counts.get(s.aircraft_id, 0) + 1
    busiest = sorted(counts, key=lambda a: (-counts[a], a))
    for aid in busiest:
        if aid not in seen:
            out.append((EventIn(type="aircraft_down", params={"aircraft_id": aid}, origin="contingency"),
                        f"busiest airframe ({counts[aid]} sorties left)"))
            break

    # weather: the base whose forecast sits closest to the minimums of the types flying from it
    best = None
    for b in sorted(ws.bases):
        types = {ws.aircraft[s.aircraft_id].type_id for s in future if ws.aircraft[s.aircraft_id].base_id == b}
        if not types:
            continue
        need = max(ws.aircraft_types[t].min_ceiling_ft for t in types)
        segs = sorted((w for w in ws.weather if w.location_id == b and w.kind == "forecast"
                       and w.end > ws.now and w.ceiling_ft < need * 1.5), key=lambda w: w.start)
        if not segs:
            continue
        start, end = segs[0].start, segs[0].end
        for w in segs[1:]:
            if w.start == end:
                end = w.end
        ratio = min(w.ceiling_ft for w in segs) / need
        if best is None or ratio < best[0]:
            best = (ratio, b, start, end)
    if best:
        _, b, start, end = best
        out.append((EventIn(type="weather_closure", params={"location_id": b, "start": start, "end": end},
                            origin="contingency"),
                    f"forecast near minimums at {b} {fmt_min(start)}-{fmt_min(end)}"))

    # threat: the most threatened zone with sorties still to fly
    zones = sorted({ws.missions[s.mission_id].zone_id for s in future if s.mission_id in ws.missions})
    if zones:
        lvl = {z: max((t.level for t in ws.threats if t.zone_id == z), default=0) for z in zones}
        z = sorted(zones, key=lambda z: (-lvl[z], z))[0]
        if lvl[z] < 3:
            out.append((EventIn(type="threat_zone", params={"zone_id": z, "level": min(3, lvl[z] + 1)},
                                origin="contingency"),
                        f"highest current threat among tasked zones (level {lvl[z]})"))
    return out[:5]


def build_cache(ws: WorldState, active: Plan, opts: SolveOptions, lam: int, svc: dict[str, float],
                risk_fn=None) -> tuple[dict[str, CacheEntry], float]:
    """Pre-solve each likely event on a copy of the world. `ws` must already be a private copy."""
    t0 = time.perf_counter()
    base_fp = ws.fingerprint()
    entries: dict[str, CacheEntry] = {}
    for ev, why in likely_events(ws, active, svc):
        try:
            hypo = ws.clone()
            n = normalise(ev, hypo)
            sig = signature(n)
            apply_event(n, hypo, active)
            o = opts
            if risk_fn is not None:
                s2, w2 = risk_fn(hypo)
                o = SolveOptions(time_limit_s=opts.time_limit_s, workers=4, serviceability=s2, weather_impact=w2)
            res = replan(hypo, active, hypo.now, o, lam)
            fill_unassigned_reasons(hypo, res.plan, res.feasibility)
            if not validate_plan(hypo, res.plan, hypo.now).ok:
                continue
            st = stability_metrics(active, res.plan)
            entries[sig] = CacheEntry(signature=sig, label=describe(n, hypo), why=why, event=n, base_fp=base_fp,
                                      active_id=active.id, plan=res.plan, solve_ms=res.wall_ms, built_at=ws.now,
                                      changed=st["changed"], unassigned=len(res.plan.unassigned))
        except Exception:  # noqa: BLE001 - a failed contingency must never break the live plan
            continue
    return entries, (time.perf_counter() - t0) * 1000

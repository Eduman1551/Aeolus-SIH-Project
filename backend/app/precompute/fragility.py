"""Fragility per sortie: how many free backup aircraft and crews could step in if this one fails."""

from __future__ import annotations

from collections import defaultdict

from app.fusion.schema import Plan, Sortie
from app.fusion.world import WorldState
from app.solver.feasibility import build_feasibility


def _free(busy: list[tuple[int, int]], t0: int, t1: int) -> bool:
    return all(not (t0 < b1 and b0 < t1) for b0, b1 in busy)


def compute_fragility(ws: WorldState, plan: Plan, svc: dict[str, float] | None = None) -> dict[str, dict]:
    svc = svc or {}
    r = ws.rules
    feas = build_feasibility(ws, ws.rules.horizon_start)
    a_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)
    c_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)
    c_duty: dict[str, int] = defaultdict(int)
    for s in plan.sorties:
        ta = ws.aircraft_types[ws.aircraft[s.aircraft_id].type_id].turnaround_min
        a_busy[s.aircraft_id].append((s.takeoff, s.landing + ta))
        c_busy[s.crew_id].append((s.takeoff - r.brief_min, s.landing + r.debrief_min))
        c_duty[s.crew_id] += s.landing - s.takeoff + r.brief_min + r.debrief_min

    out: dict[str, dict] = {}
    for s in plan.sorties:
        m = ws.missions.get(s.mission_id)
        if m is None:
            continue
        in_mission = {x.aircraft_id for x in plan.sorties if x.mission_id == s.mission_id}
        crews_in_mission = {x.crew_id for x in plan.sorties if x.mission_id == s.mission_id}
        backup_a: set[str] = set()
        backup_c: set[str] = set()
        size = r.brief_min + m.duration_min + r.debrief_min
        for c in feas.candidates.get(s.mission_id, []):
            if s.takeoff not in c.starts:
                continue
            ta = ws.aircraft_types[ws.aircraft[c.aircraft_id].type_id].turnaround_min
            if c.aircraft_id not in in_mission and _free(a_busy[c.aircraft_id], s.takeoff, s.landing + ta):
                backup_a.add(c.aircraft_id)
            if (c.aircraft_id == s.aircraft_id and c.crew_id not in crews_in_mission
                    and _free(c_busy[c.crew_id], s.takeoff - r.brief_min, s.landing + r.debrief_min)
                    and c_duty[c.crew_id] + size <= ws.crews[c.crew_id].max_duty_min):
                backup_c.add(c.crew_id)
        backups = min(len(backup_a), len(backup_c))
        level = 2 if backups == 0 else 1 if backups == 1 else 0
        p = svc.get(s.aircraft_id)
        risky = p is not None and p < 0.7
        if risky:
            level = min(2, level + 1)
        score = min(100, round(100 / (1 + backups) * (1.0 + (1 - (p if p is not None else 0.9)))))
        notes = [f"{len(backup_a)} backup aircraft", f"{len(backup_c)} backup crews"]
        if risky:
            notes.append(f"{s.aircraft_id} serviceability {round(p * 100)}%")
        out[key(s)] = {"level": ["low", "medium", "high"][level], "score": score,
                       "backup_aircraft": sorted(backup_a)[:5], "backup_crews": sorted(backup_c)[:5],
                       "note": ", ".join(notes)}
    return out


def key(s: Sortie) -> str:
    return f"{s.mission_id}/{s.aircraft_id}"

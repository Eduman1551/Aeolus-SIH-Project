"""Greedy baseline planner: highest priority first, earliest feasible time, first free aircraft and crew.

It mimics a quick manual allocation. Used only for comparison against CP-SAT.
"""

from __future__ import annotations

import time
from collections import defaultdict

from app.fusion.schema import Plan, Sortie, Unassigned
from app.fusion.world import WorldState, wall_now
from app.solver.cpsat import SolveResult, new_plan_id
from app.solver.feasibility import build_feasibility


def greedy(ws: WorldState, earliest: float | None = None) -> SolveResult:
    t_start = time.perf_counter()
    earliest = earliest if earliest is not None else ws.rules.horizon_start
    feas = build_feasibility(ws, earliest)
    r = ws.rules

    aircraft_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)  # incl. turnaround
    crew_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)  # incl. brief/debrief
    crew_duty: dict[str, int] = defaultdict(int)
    stock_left = {(st.base_id, st.weapon_id): st.qty for st in ws.stock}
    sorties: list[Sortie] = []

    def free(busy: list[tuple[int, int]], t0: int, t1: int) -> bool:
        return all(not (t0 < b1 and b0 < t1) for b0, b1 in busy)

    missions = sorted(ws.open_missions(), key=lambda m: (m.priority, m.window_start, m.id))
    for m in missions:
        cands = sorted(feas.candidates.get(m.id, []), key=lambda c: (c.aircraft_id, c.crew_id))
        mt = ws.mission_types[m.type_id]
        for t in sorted({t for c in cands for t in c.starts}):
            pick = []
            used_a: set[str] = set()
            used_c: set[str] = set()
            need: dict[tuple[str, str], int] = defaultdict(int)
            for c in cands:
                if len(pick) == m.aircraft_required:
                    break
                if t not in c.starts or c.aircraft_id in used_a or c.crew_id in used_c:
                    continue
                a = ws.aircraft[c.aircraft_id]
                ta = ws.aircraft_types[a.type_id].turnaround_min
                if not free(aircraft_busy[a.id], t, t + m.duration_min + ta):
                    continue
                size = r.brief_min + m.duration_min + r.debrief_min
                if not free(crew_busy[c.crew_id], t - r.brief_min, t + m.duration_min + r.debrief_min):
                    continue
                if crew_duty[c.crew_id] + size > ws.crews[c.crew_id].max_duty_min:
                    continue
                load = mt.loadouts.get(a.type_id, {})
                if any(stock_left.get((a.base_id, w), 0) < need[(a.base_id, w)] + q for w, q in load.items()):
                    continue
                for w, q in load.items():
                    need[(a.base_id, w)] += q
                pick.append(c)
                used_a.add(c.aircraft_id)
                used_c.add(c.crew_id)
            if len(pick) == m.aircraft_required:
                for c in pick:
                    a = ws.aircraft[c.aircraft_id]
                    ta = ws.aircraft_types[a.type_id].turnaround_min
                    aircraft_busy[a.id].append((t, t + m.duration_min + ta))
                    crew_busy[c.crew_id].append((t - r.brief_min, t + m.duration_min + r.debrief_min))
                    crew_duty[c.crew_id] += r.brief_min + m.duration_min + r.debrief_min
                    load = dict(mt.loadouts.get(a.type_id, {}))
                    for w, q in load.items():
                        stock_left[(a.base_id, w)] -= q
                    sorties.append(Sortie(mission_id=m.id, aircraft_id=a.id, crew_id=c.crew_id, takeoff=t,
                                          landing=t + m.duration_min, loadout=load))
                break

    wall_ms = (time.perf_counter() - t_start) * 1000
    sorties.sort(key=lambda z: (z.takeoff, z.mission_id, z.aircraft_id))
    covered = {z.mission_id for z in sorties}
    plan = Plan(id=new_plan_id("G"), created_at=wall_now(), source="greedy", sorties=sorties,
                unassigned=[Unassigned(mission_id=m.id, reason="") for m in missions if m.id not in covered],
                solve_ms=round(wall_ms, 1), solver_status="HEURISTIC", world_version=ws.version)
    plan.unassigned.sort(key=lambda u: u.mission_id)
    return SolveResult(plan=plan, status="HEURISTIC", objective=0.0, wall_ms=wall_ms, feasibility=feas)

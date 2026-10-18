"""CP-SAT assignment and scheduling engine.

Decision variables
  p[m,a,c]  aircraft a flown by crew c on mission m
  s[m]      take-off time of mission m (5-minute grid, inside its window)
  assigned[m]

Hard constraints: type/range/serviceability/weather/airspace/threat (through the candidate set and
allowed take-off times), no double booking + turnaround (aircraft NoOverlap), crew NoOverlap with
brief/debrief, crew duty hours, weapon stock per base, exact aircraft count per mission.

Objective (maximise): priority-weighted coverage - risk penalties (threat, serviceability, weather)
- a small late-take-off penalty.
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from app.fusion.schema import Plan, Sortie, Unassigned
from app.fusion.world import WorldState, wall_now
from app.solver.feasibility import Feasibility, build_feasibility

PRIORITY_WEIGHT = {1: 10000, 2: 4000, 3: 1500, 4: 600}
SCALE = 10  # objective scale so the late-take-off tie-breaker stays an order of magnitude smaller


@dataclass
class SolveOptions:
    time_limit_s: float = 8.0
    workers: int = 8
    earliest: float | None = None  # no new take-off before this minute
    serviceability: dict[str, float] = field(default_factory=dict)  # aircraft -> P(serviceable)
    weather_impact: dict[tuple[str, str, str], float] = field(default_factory=dict)  # (mission, base, type) -> 0..1
    # replanning
    previous: Plan | None = None  # warm start + stability reference
    stability_lambda: int = 0  # penalty per changed / dropped previous sortie
    frozen: list[Sortie] = field(default_factory=list)  # sorties already committed, kept as they are
    # rejected alternatives: each entry is (sorties the rejected plan added, previous sorties it dropped)
    forbid: list[tuple[list[tuple[str, str, str]], list[tuple[str, str, str]]]] = field(default_factory=list)


@dataclass
class SolveResult:
    plan: Plan
    status: str
    objective: float
    wall_ms: float
    stats: dict = field(default_factory=dict)
    feasibility: Feasibility | None = None


def threat_level(ws: WorldState, zone_id: str, t0: float, t1: float) -> int:
    return max((t.level for t in ws.threats if t.zone_id == zone_id and t.start < t1 and t0 < t.end), default=0)


def risk_penalty(ws: WorldState, mission_id: str, aircraft_id: str, opts: SolveOptions) -> dict[str, int]:
    m = ws.missions[mission_id]
    a = ws.aircraft[aircraft_id]
    at = ws.aircraft_types[a.type_id]
    lvl = threat_level(ws, m.zone_id, m.window_start, m.window_end + m.duration_min)
    p_ok = opts.serviceability.get(aircraft_id, 0.9)
    wx = opts.weather_impact.get((mission_id, a.base_id, a.type_id), 0.0)
    return {
        "threat": int(lvl * at.vulnerability * 25),
        "serviceability": int(round((1.0 - p_ok) * 500)),
        "weather": int(round(wx * 60 * (1 + at.weather_sensitivity))),
    }


def new_plan_id(prefix: str = "P") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"


def solve(ws: WorldState, opts: SolveOptions | None = None) -> SolveResult:
    opts = opts or SolveOptions()
    t_start = time.perf_counter()
    earliest = opts.earliest if opts.earliest is not None else ws.rules.horizon_start
    feas = build_feasibility(ws, earliest, opts.frozen)
    r = ws.rules

    model = cp_model.CpModel()
    missions = ws.open_missions()
    s: dict[str, cp_model.IntVar] = {}
    assigned: dict[str, cp_model.IntVar] = {}
    p: dict[tuple[str, str, str], cp_model.IntVar] = {}
    x_terms: dict[tuple[str, str], list] = defaultdict(list)
    y_terms: dict[tuple[str, str], list] = defaultdict(list)

    for m in missions:
        cands = feas.candidates.get(m.id, [])
        all_starts = sorted({t for c in cands for t in c.starts}) or [m.window_start]
        s[m.id] = model.new_int_var_from_domain(cp_model.Domain.FromValues(all_starts), f"s_{m.id}")
        assigned[m.id] = model.new_bool_var(f"assigned_{m.id}")
        for c in cands:
            v = model.new_bool_var(f"p_{m.id}_{c.aircraft_id}_{c.crew_id}")
            p[(m.id, c.aircraft_id, c.crew_id)] = v
            if len(c.starts) < len(all_starts):
                model.add_linear_expression_in_domain(s[m.id], cp_model.Domain.FromValues(c.starts)).only_enforce_if(v)
            x_terms[(m.id, c.aircraft_id)].append(v)
            y_terms[(m.id, c.crew_id)].append(v)

    x: dict[tuple[str, str], cp_model.IntVar] = {}
    for key, vs in x_terms.items():
        x[key] = model.new_bool_var(f"x_{key[0]}_{key[1]}")
        model.add(sum(vs) == x[key])
    y: dict[tuple[str, str], cp_model.IntVar] = {}
    for key, vs in y_terms.items():
        y[key] = model.new_bool_var(f"y_{key[0]}_{key[1]}")
        model.add(sum(vs) == y[key])

    # exact aircraft count (all aircraft of a mission share the take-off time s[m])
    for m in missions:
        xs = [v for (mid, _), v in x.items() if mid == m.id]
        if xs:
            model.add(sum(xs) == m.aircraft_required * assigned[m.id])
        else:
            model.add(assigned[m.id] == 0)

    # aircraft: no double booking, turnaround included in the interval
    by_aircraft: dict[str, list] = defaultdict(list)
    for (mid, aid), xv in x.items():
        m = ws.missions[mid]
        ta = ws.aircraft_types[ws.aircraft[aid].type_id].turnaround_min
        by_aircraft[aid].append(model.new_optional_fixed_size_interval_var(s[mid], m.duration_min + ta, xv,
                                                                           f"ia_{mid}_{aid}"))
    for ivs in by_aircraft.values():
        if len(ivs) > 1:
            model.add_no_overlap(ivs)

    # crews: no double booking incl. brief/debrief, duty-hour limit
    by_crew: dict[str, list] = defaultdict(list)
    duty: dict[str, list] = defaultdict(list)
    for (mid, cid), yv in y.items():
        m = ws.missions[mid]
        size = r.brief_min + m.duration_min + r.debrief_min
        by_crew[cid].append(model.new_optional_fixed_size_interval_var(s[mid] - r.brief_min, size, yv,
                                                                       f"ic_{mid}_{cid}"))
        duty[cid].append(size * yv)
    for cid, ivs in by_crew.items():
        if len(ivs) > 1:
            model.add_no_overlap(ivs)
        model.add(sum(duty[cid]) <= ws.crews[cid].max_duty_min)

    # weapon stock per launching base
    usage: dict[tuple[str, str], list] = defaultdict(list)
    for (mid, aid), xv in x.items():
        a = ws.aircraft[aid]
        load = ws.mission_types[ws.missions[mid].type_id].loadouts.get(a.type_id, {})
        for wid, q in load.items():
            usage[(a.base_id, wid)].append(q * xv)
    for (base, wid), terms in usage.items():
        model.add(sum(terms) <= ws.stock_of(base, wid))

    # objective
    obj = []
    for m in missions:
        obj.append(PRIORITY_WEIGHT[m.priority] * SCALE * assigned[m.id])
        obj.append(-(s[m.id] - m.window_start))  # mild preference for the earliest feasible take-off
    penalties = {}
    for (mid, aid), xv in x.items():
        pen = risk_penalty(ws, mid, aid, opts)
        penalties[(mid, aid)] = pen
        obj.append(-sum(pen.values()) * SCALE * xv)

    # committed sorties stay exactly as they are
    for fz in opts.frozen:
        v = p.get((fz.mission_id, fz.aircraft_id, fz.crew_id))
        if v is not None:
            model.add(v == 1)

    # stability: lambda x (previous sorties changed or dropped), plus warm start hints
    if opts.previous is not None:
        lam = opts.stability_lambda * SCALE
        for mid, olds in opts.previous.by_mission().items():
            if mid not in s:
                continue
            for o in olds:
                v = p.get((mid, o.aircraft_id, o.crew_id))
                if v is not None and lam:
                    obj.append(lam * v)  # = -lam * (1 - v) up to a constant
            t_old = olds[0].takeoff
            if lam:
                moved = model.new_bool_var(f"moved_{mid}")
                model.add(s[mid] == t_old).only_enforce_if([moved.Not(), assigned[mid]])
                obj.append(-lam * len(olds) * moved)
            model.add_hint(s[mid], t_old)
        prev_keys = {(o.mission_id, o.aircraft_id, o.crew_id) for o in opts.previous.sorties}
        for key, v in p.items():
            model.add_hint(v, 1 if key in prev_keys else 0)

    # rejected alternatives must not come back exactly
    for added, dropped in opts.forbid:
        if any(k not in p for k in added):
            continue  # that combination is impossible now anyway
        lhs = [p[k] for k in added] + [1 - p[k] if k in p else 1 for k in dropped]
        if lhs:
            model.add(sum(lhs) <= len(lhs) - 1)

    model.maximize(sum(obj))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = opts.time_limit_s
    solver.parameters.num_workers = opts.workers
    solver.parameters.random_seed = 7
    code = solver.solve(model)
    status = solver.status_name(code)
    wall_ms = (time.perf_counter() - t_start) * 1000

    plan = Plan(id=new_plan_id(), created_at=wall_now(), source="cpsat", solver_status=status,
                solve_ms=round(wall_ms, 1), world_version=ws.version)
    objective = 0.0
    if code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        objective = solver.objective_value / SCALE
        for (mid, aid, cid), v in p.items():
            if solver.value(v):
                m = ws.missions[mid]
                t = solver.value(s[mid])
                at = ws.aircraft[aid].type_id
                plan.sorties.append(Sortie(mission_id=mid, aircraft_id=aid, crew_id=cid, takeoff=t,
                                           landing=t + m.duration_min,
                                           loadout=dict(ws.mission_types[m.type_id].loadouts.get(at, {}))))
    plan.sorties.sort(key=lambda z: (z.takeoff, z.mission_id, z.aircraft_id))
    covered = {z.mission_id for z in plan.sorties}
    plan.unassigned = [Unassigned(mission_id=m.id, reason="") for m in missions if m.id not in covered]
    plan.objective = round(objective, 1)
    stats = {
        "candidates": len(p),
        "missions": len(missions),
        "bound": round(solver.best_objective_bound / SCALE, 1) if code in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "branches": solver.num_branches,
        "penalties": {f"{k[0]}|{k[1]}": v for k, v in penalties.items()},
    }
    return SolveResult(plan=plan, status=status, objective=plan.objective, wall_ms=wall_ms, stats=stats,
                       feasibility=feas)

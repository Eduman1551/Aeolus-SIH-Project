"""Independent plan validator.

Re-checks a plan rule by rule straight from the raw WorldState records. It deliberately does
not import anything from app.solver, so a bug in the constraint model cannot hide itself here.

Sorties that already took off (takeoff < now) are history: environmental rules (serviceability,
weather, airspace, threat, crew availability) are not re-checked for them, but they still count
for resource rules (double booking, turnaround, duty hours, weapon stock).
"""

from __future__ import annotations

import math
from collections import defaultdict

from pydantic import BaseModel, Field

from app.fusion.schema import Plan, Sortie
from app.fusion.world import WorldState, fmt_min

RULES: list[tuple[str, str]] = [
    ("mission_open", "Sortie belongs to an open mission"),
    ("aircraft_count", "Mission gets exactly the aircraft it needs"),
    ("takeoff_window", "Take-off inside mission window, landing inside horizon"),
    ("aircraft_serviceable", "Aircraft serviceable for the whole sortie"),
    ("aircraft_type", "Aircraft type suits the mission"),
    ("aircraft_range", "Target inside aircraft combat radius"),
    ("aircraft_double_booking", "No aircraft double-booked"),
    ("turnaround", "Turnaround time between sorties"),
    ("crew_qualified", "Crew qualified on the aircraft type"),
    ("crew_availability", "Crew on duty, available and at the same base"),
    ("crew_double_booking", "No crew double-booked"),
    ("crew_duty", "Crew duty-hour limit"),
    ("weapon_compatibility", "Weapon load fits aircraft and mission"),
    ("weapon_stock", "Weapon stock at the launching base"),
    ("weather_base", "Weather minimums at base for take-off and landing"),
    ("weather_target", "Weather minimums at the target"),
    ("restricted_zone", "No mission inside a restricted airspace window"),
    ("threat_tolerance", "Zone threat level within aircraft limits"),
]
RULE_LABELS = dict(RULES)


class Violation(BaseModel):
    rule: str
    message: str
    mission_id: str | None = None
    aircraft_id: str | None = None
    crew_id: str | None = None


class RuleResult(BaseModel):
    id: str
    label: str
    passed: bool
    count: int


class ValidationReport(BaseModel):
    ok: bool
    violations: list[Violation] = Field(default_factory=list)
    rules: list[RuleResult] = Field(default_factory=list)
    checked_sorties: int = 0
    committed_sorties: int = 0


# ---------- raw-data helpers (own implementations, not shared with the solver) ----------


def _overlaps(a0: float, a1: float, b0: float, b1: float) -> bool:
    return a0 < b1 and b0 < a1


def _segments_at(ws: WorldState, loc: str, t: float):
    t = min(t, ws.rules.horizon_end - 1)
    return [w for w in ws.weather if w.location_id == loc and w.start <= t < w.end]


def _segments_during(ws: WorldState, loc: str, t0: float, t1: float):
    return [w for w in ws.weather if w.location_id == loc and _overlaps(t0, t1, w.start, w.end)]


def _dist(ws: WorldState, base_id: str, zone_id: str) -> float:
    b, z = ws.bases[base_id], ws.zones[zone_id]
    return math.sqrt((b.x_km - z.x_km) ** 2 + (b.y_km - z.y_km) ** 2)


# ---------- single-sortie rules ----------


def check_sortie(ws: WorldState, s: Sortie, now: float | None = None) -> list[Violation]:
    """Rules that can be judged from one sortie alone."""
    out: list[Violation] = []

    def v(rule: str, msg: str) -> None:
        out.append(Violation(rule=rule, message=msg, mission_id=s.mission_id, aircraft_id=s.aircraft_id,
                             crew_id=s.crew_id))

    m = ws.missions.get(s.mission_id)
    if m is None or m.status != "open":
        v("mission_open", f"{s.mission_id} is not an open mission")
        return out
    a = ws.aircraft.get(s.aircraft_id)
    c = ws.crews.get(s.crew_id)
    if a is None:
        v("aircraft_serviceable", f"unknown aircraft {s.aircraft_id}")
        return out
    if c is None:
        v("crew_availability", f"unknown crew {s.crew_id}")
        return out
    at = ws.aircraft_types[a.type_id]
    mt = ws.mission_types[m.type_id]
    committed = now is not None and s.takeoff < now
    r = ws.rules

    if not (m.window_start <= s.takeoff <= m.window_end):
        v("takeoff_window", f"take-off {fmt_min(s.takeoff)} outside window "
                            f"{fmt_min(m.window_start)}-{fmt_min(m.window_end)}")
    if s.landing != s.takeoff + m.duration_min or s.landing > r.horizon_end:
        v("takeoff_window", f"landing {fmt_min(s.landing)} does not match duration or passes the horizon")

    if a.type_id not in mt.eligible_types:
        v("aircraft_type", f"{at.name} cannot fly {mt.name} missions")
    d = _dist(ws, a.base_id, m.zone_id)
    if d > at.radius_km:
        v("aircraft_range", f"{m.zone_id} is {d:.0f} km from {a.base_id}, {at.name} radius is {at.radius_km:.0f} km")
    if a.type_id not in c.qualified_types:
        v("crew_qualified", f"crew {c.id} is not qualified on {at.name}")

    expected = mt.loadouts.get(a.type_id)
    if expected is not None and s.loadout != expected:
        v("weapon_compatibility", f"load {s.loadout or 'none'} differs from the {mt.name} load for {at.name} {expected}")
    for wid in s.loadout:
        wt = ws.weapon_types.get(wid)
        if wt is None or a.type_id not in wt.compatible_types:
            v("weapon_compatibility", f"{wid} cannot be carried by {at.name}")

    if committed:
        return out

    if a.status != "serviceable":
        v("aircraft_serviceable", f"{a.id} is unserviceable")
    for w in a.unavailable:
        if _overlaps(s.takeoff, s.landing, w.start, w.end):
            v("aircraft_serviceable", f"{a.id} unavailable {fmt_min(w.start)}-{fmt_min(w.end)} ({w.reason})")

    brief0, brief1 = s.takeoff - r.brief_min, s.landing + r.debrief_min
    if c.status != "available":
        v("crew_availability", f"crew {c.id} is unavailable")
    if c.base_id != a.base_id:
        v("crew_availability", f"crew {c.id} is at {c.base_id}, aircraft at {a.base_id}")
    if brief0 < c.duty_start or brief1 > c.duty_end:
        v("crew_availability", f"crew {c.id} on duty {fmt_min(c.duty_start)}-{fmt_min(c.duty_end)}, "
                               f"sortie needs {fmt_min(brief0)}-{fmt_min(brief1)}")
    for w in c.unavailable:
        if _overlaps(brief0, brief1, w.start, w.end):
            v("crew_availability", f"crew {c.id} unavailable {fmt_min(w.start)}-{fmt_min(w.end)} ({w.reason})")

    for label, t in (("take-off", s.takeoff), ("landing", s.landing)):
        for w in _segments_at(ws, a.base_id, t):
            if w.ceiling_ft < at.min_ceiling_ft or w.vis_km < at.min_vis_km:
                what = "closed" if w.kind == "closure" else f"ceiling {w.ceiling_ft} ft / vis {w.vis_km} km"
                v("weather_base", f"{a.base_id} {what} at {label} {fmt_min(t)} "
                                  f"({at.name} needs {at.min_ceiling_ft} ft / {at.min_vis_km} km)")
    for w in _segments_during(ws, m.zone_id, s.takeoff, s.landing):
        if w.ceiling_ft < mt.target_min_ceiling_ft or w.vis_km < mt.target_min_vis_km or w.kind == "closure":
            what = "closed" if w.kind == "closure" else f"ceiling {w.ceiling_ft} ft / vis {w.vis_km} km"
            v("weather_target", f"{m.zone_id} {what} {fmt_min(w.start)}-{fmt_min(w.end)} "
                                f"({mt.name} needs {mt.target_min_ceiling_ft} ft / {mt.target_min_vis_km} km)")

    for rz in ws.restrictions:
        if rz.zone_id == m.zone_id and _overlaps(s.takeoff, s.landing, rz.start, rz.end):
            v("restricted_zone", f"{m.zone_id} restricted {fmt_min(rz.start)}-{fmt_min(rz.end)} ({rz.reason})")
    for t in ws.threats:
        if t.zone_id == m.zone_id and t.level > at.max_threat and _overlaps(s.takeoff, s.landing, t.start, t.end):
            v("threat_tolerance", f"{m.zone_id} threat level {t.level}, {at.name} limit is {at.max_threat}")
    return out


# ---------- whole-plan validation ----------


def validate_plan(ws: WorldState, plan: Plan, now: float | None = None) -> ValidationReport:
    violations: list[Violation] = []
    r = ws.rules
    committed = 0
    for s in plan.sorties:
        violations.extend(check_sortie(ws, s, now))
        if now is not None and s.takeoff < now:
            committed += 1

    # aircraft count per mission
    per_mission: dict[str, list[Sortie]] = defaultdict(list)
    for s in plan.sorties:
        per_mission[s.mission_id].append(s)
    for mid, ss in per_mission.items():
        m = ws.missions.get(mid)
        if m is None:
            continue
        if len(ss) != m.aircraft_required:
            violations.append(Violation(rule="aircraft_count", mission_id=mid,
                                        message=f"{mid} needs {m.aircraft_required} aircraft, plan has {len(ss)}"))
        if len({s.takeoff for s in ss}) > 1:
            violations.append(Violation(rule="aircraft_count", mission_id=mid,
                                        message=f"{mid} aircraft take off at different times"))

    # aircraft double booking + turnaround
    by_aircraft: dict[str, list[Sortie]] = defaultdict(list)
    for s in plan.sorties:
        by_aircraft[s.aircraft_id].append(s)
    for aid, ss in by_aircraft.items():
        a = ws.aircraft.get(aid)
        if a is None:
            continue
        ta = ws.aircraft_types[a.type_id].turnaround_min
        ss = sorted(ss, key=lambda x: x.takeoff)
        for prev, nxt in zip(ss, ss[1:], strict=False):
            if nxt.takeoff < prev.landing:
                violations.append(Violation(rule="aircraft_double_booking", aircraft_id=aid, mission_id=nxt.mission_id,
                                            message=f"{aid} on {prev.mission_id} and {nxt.mission_id} at the same time"))
            elif nxt.takeoff < prev.landing + ta:
                violations.append(Violation(rule="turnaround", aircraft_id=aid, mission_id=nxt.mission_id,
                                            message=f"{aid} has {nxt.takeoff - prev.landing} min between "
                                                    f"{prev.mission_id} and {nxt.mission_id}, needs {ta}"))

    # crew double booking + duty hours
    by_crew: dict[str, list[Sortie]] = defaultdict(list)
    for s in plan.sorties:
        by_crew[s.crew_id].append(s)
    for cid, ss in by_crew.items():
        c = ws.crews.get(cid)
        if c is None:
            continue
        ss = sorted(ss, key=lambda x: x.takeoff)
        for prev, nxt in zip(ss, ss[1:], strict=False):
            if nxt.takeoff - r.brief_min < prev.landing + r.debrief_min:
                violations.append(Violation(rule="crew_double_booking", crew_id=cid, mission_id=nxt.mission_id,
                                            message=f"crew {cid} on {prev.mission_id} and {nxt.mission_id} "
                                                    f"with overlapping duty (incl. brief/debrief)"))
        duty = sum(s.landing - s.takeoff + r.brief_min + r.debrief_min for s in ss)
        if duty > c.max_duty_min:
            violations.append(Violation(rule="crew_duty", crew_id=cid,
                                        message=f"crew {cid} duty {duty} min exceeds {c.max_duty_min} min"))

    # weapon stock per launching base
    used: dict[tuple[str, str], int] = defaultdict(int)
    for s in plan.sorties:
        a = ws.aircraft.get(s.aircraft_id)
        if a is None:
            continue
        for wid, q in s.loadout.items():
            used[(a.base_id, wid)] += q
    for (base, wid), q in sorted(used.items()):
        have = sum(st.qty for st in ws.stock if st.base_id == base and st.weapon_id == wid)
        if q > have:
            violations.append(Violation(rule="weapon_stock",
                                        message=f"{base} needs {q} x {wid}, only {have} in stock"))

    counts: dict[str, int] = defaultdict(int)
    for v in violations:
        counts[v.rule] += 1
    rules = [RuleResult(id=rid, label=label, passed=counts[rid] == 0, count=counts[rid]) for rid, label in RULES]
    return ValidationReport(ok=not violations, violations=violations, rules=rules,
                            checked_sorties=len(plan.sorties), committed_sorties=committed)

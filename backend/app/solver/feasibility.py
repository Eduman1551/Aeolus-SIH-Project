"""Static feasibility used by the solver and the greedy baseline: which (mission, aircraft, crew)
triples are possible at all, and at which take-off times.

This is the solver's own reading of the rules. The validator has a separate implementation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.fusion.schema import Aircraft, Crew, Mission
from app.fusion.world import WorldState

STEP_MIN = 5  # take-off times are planned on a 5-minute grid


@dataclass
class Candidate:
    mission_id: str
    aircraft_id: str
    crew_id: str
    starts: list[int]
    frozen: bool = False


@dataclass
class Feasibility:
    candidates: dict[str, list[Candidate]] = field(default_factory=dict)  # mission -> candidates
    blockers: dict[str, dict[str, int]] = field(default_factory=dict)  # mission -> reason -> count


def _overlap(a0: float, a1: float, b0: float, b1: float) -> bool:
    return a0 < b1 and b0 < a1


class WeatherIndex:
    def __init__(self, ws: WorldState) -> None:
        self.by_loc: dict[str, list] = {}
        for w in ws.weather:
            self.by_loc.setdefault(w.location_id, []).append(w)
        self.horizon_end = ws.rules.horizon_end

    def point(self, loc: str, t: float) -> tuple[int, float]:
        t = min(t, self.horizon_end - 1)
        segs = [w for w in self.by_loc.get(loc, []) if w.start <= t < w.end]
        if not segs:
            return 99999, 99.0
        return min(w.ceiling_ft for w in segs), min(w.vis_km for w in segs)

    def span(self, loc: str, t0: float, t1: float) -> tuple[int, float, bool]:
        segs = [w for w in self.by_loc.get(loc, []) if _overlap(t0, t1, w.start, w.end)]
        if not segs:
            return 99999, 99.0, False
        return (min(w.ceiling_ft for w in segs), min(w.vis_km for w in segs),
                any(w.kind == "closure" for w in segs))


def start_grid(m: Mission, earliest: float) -> list[int]:
    lo = max(m.window_start, int(math.ceil(earliest / STEP_MIN) * STEP_MIN))
    grid = list(range(m.window_start, m.window_end + 1, STEP_MIN))
    if m.window_end not in grid:
        grid.append(m.window_end)
    return [t for t in grid if t >= lo]


def env_starts(ws: WorldState, wx: WeatherIndex, m: Mission, base_id: str, type_id: str,
               earliest: float, blockers: dict[str, int]) -> list[int]:
    """Take-off times that pass base weather, target weather, airspace and threat checks."""
    at = ws.aircraft_types[type_id]
    mt = ws.mission_types[m.type_id]
    ok = []
    grid = start_grid(m, earliest)
    if not grid:
        blockers["window passed"] = blockers.get("window passed", 0) + 1
    for t in grid:
        t1 = t + m.duration_min
        if t1 > ws.rules.horizon_end:
            blockers["horizon"] = blockers.get("horizon", 0) + 1
            continue
        bad = None
        for tt in (t, t1):
            c, v = wx.point(base_id, tt)
            if c < at.min_ceiling_ft or v < at.min_vis_km:
                bad = "base weather"
        if bad is None:
            c, v, closed = wx.span(m.zone_id, t, t1)
            if closed or c < mt.target_min_ceiling_ft or v < mt.target_min_vis_km:
                bad = "target weather"
        if bad is None and any(r.zone_id == m.zone_id and _overlap(t, t1, r.start, r.end) for r in ws.restrictions):
            bad = "restricted airspace"
        if bad is None and any(th.zone_id == m.zone_id and th.level > at.max_threat and _overlap(t, t1, th.start, th.end)
                               for th in ws.threats):
            bad = "threat level"
        if bad:
            blockers[bad] = blockers.get(bad, 0) + 1
        else:
            ok.append(t)
    return ok


def aircraft_free(a: Aircraft, t0: float, t1: float) -> bool:
    return a.status == "serviceable" and not any(_overlap(t0, t1, w.start, w.end) for w in a.unavailable)


def crew_free(ws: WorldState, c: Crew, t0: float, t1: float) -> bool:
    b0, b1 = t0 - ws.rules.brief_min, t1 + ws.rules.debrief_min
    return (c.status == "available" and c.duty_start <= b0 and b1 <= c.duty_end
            and not any(_overlap(b0, b1, w.start, w.end) for w in c.unavailable))


def build_feasibility(ws: WorldState, earliest: float, frozen: list | None = None) -> Feasibility:
    """All possible (mission, aircraft, crew, starts). `frozen` sorties are kept as-is, unchecked."""
    feas = Feasibility()
    wx = WeatherIndex(ws)
    frozen_missions = {s.mission_id for s in (frozen or [])}
    for m in ws.open_missions():
        cands: list[Candidate] = []
        blockers: dict[str, int] = {}
        feas.blockers[m.id] = blockers
        if m.id in frozen_missions:
            for s in frozen or []:
                if s.mission_id == m.id:
                    cands.append(Candidate(m.id, s.aircraft_id, s.crew_id, [s.takeoff], frozen=True))
            feas.candidates[m.id] = cands
            continue
        mt = ws.mission_types[m.type_id]
        env_cache: dict[tuple[str, str], list[int]] = {}
        for a in sorted(ws.aircraft.values(), key=lambda x: x.id):
            at = ws.aircraft_types[a.type_id]
            if a.type_id not in mt.eligible_types:
                continue
            if ws.distance_km(a.base_id, m.zone_id) > at.radius_km:
                blockers["out of range"] = blockers.get("out of range", 0) + 1
                continue
            if a.status != "serviceable":
                blockers["aircraft unserviceable"] = blockers.get("aircraft unserviceable", 0) + 1
                continue
            key = (a.base_id, a.type_id)
            if key not in env_cache:
                env_cache[key] = env_starts(ws, wx, m, a.base_id, a.type_id, earliest, blockers)
            a_starts = [t for t in env_cache[key] if aircraft_free(a, t, t + m.duration_min)]
            if not a_starts:
                if env_cache[key]:
                    blockers["aircraft unavailable"] = blockers.get("aircraft unavailable", 0) + 1
                continue
            for c in sorted(ws.crews.values(), key=lambda x: x.id):
                if c.base_id != a.base_id or a.type_id not in c.qualified_types:
                    continue
                starts = [t for t in a_starts if crew_free(ws, c, t, t + m.duration_min)]
                if starts:
                    cands.append(Candidate(m.id, a.id, c.id, starts))
                else:
                    blockers["no crew on duty"] = blockers.get("no crew on duty", 0) + 1
        feas.candidates[m.id] = cands
    return feas

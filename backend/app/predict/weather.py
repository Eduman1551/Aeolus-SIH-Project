"""Rule-based weather impact: how close the forecast sits to the minimums for a mission flown
from a base by an aircraft type. 0 = comfortable margin, 1 = right at the minimums."""

from __future__ import annotations

from app.fusion.world import WorldState

MARGIN = 1.5  # forecast at 1.5x the minimum or better counts as no impact


def _point(ws: WorldState, loc: str, t: float):
    t = min(t, ws.rules.horizon_end - 1)
    segs = [w for w in ws.weather if w.location_id == loc and w.start <= t < w.end]
    return (min((w.ceiling_ft for w in segs), default=99999), min((w.vis_km for w in segs), default=99.0))


def _span(ws: WorldState, loc: str, t0: float, t1: float):
    segs = [w for w in ws.weather if w.location_id == loc and w.start < t1 and t0 < w.end]
    return (min((w.ceiling_ft for w in segs), default=99999), min((w.vis_km for w in segs), default=99.0))


def _ratio(have: float, need: float) -> float:
    return 99.0 if need <= 0 else have / need


def weather_impact(ws: WorldState) -> dict[tuple[str, str, str], float]:
    out: dict[tuple[str, str, str], float] = {}
    for m in ws.open_missions():
        mt = ws.mission_types[m.type_id]
        starts = list(range(m.window_start, m.window_end + 1, 15)) or [m.window_start]
        for b in ws.bases:
            for t_id in mt.eligible_types:
                at = ws.aircraft_types[t_id]
                best = 0.0
                for t in starts:
                    t1 = t + m.duration_min
                    r = 99.0
                    for tt in (t, t1):
                        c, v = _point(ws, b, tt)
                        r = min(r, _ratio(c, at.min_ceiling_ft), _ratio(v, at.min_vis_km))
                    c, v = _span(ws, m.zone_id, t, t1)
                    r = min(r, _ratio(c, mt.target_min_ceiling_ft), _ratio(v, mt.target_min_vis_km))
                    best = max(best, r)
                if best < 1.0:
                    continue  # infeasible anyway; the solver excludes it
                impact = max(0.0, min(1.0, (MARGIN - best) / (MARGIN - 1.0)))
                if impact > 0:
                    out[(m.id, b, t_id)] = round(impact, 2)
    return out


def mission_weather_notes(ws: WorldState, impact: dict[tuple[str, str, str], float]) -> dict[str, float]:
    notes: dict[str, float] = {}
    for (mid, _, _), v in impact.items():
        notes[mid] = max(notes.get(mid, 0.0), v)
    return notes

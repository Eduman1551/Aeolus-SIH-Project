"""Apply an event to the WorldState (mutates it and bumps the version)."""

from __future__ import annotations

from app.events.types import EventIn, describe
from app.fusion.schema import Meta, Mission, Plan, Restriction, Threat, WeatherSegment, Window
from app.fusion.world import WorldState, fmt_min, wall_now

SOURCE = {
    "event panel": "planner event panel",
    "planner chat": "planner chat",
    "reject note": "planner reject note",
    "live feed": "live feed",
    "contingency": "contingency precompute",
}


def apply_event(ev: EventIn, ws: WorldState, active: Plan | None = None) -> dict:
    """Returns facts used later by the explanation engine."""
    p = ev.params
    meta = Meta(source=SOURCE.get(ev.origin, ev.origin), updated_at=wall_now())
    facts: dict = {"type": ev.type, "description": describe(ev, ws)}
    match ev.type:
        case "aircraft_down":
            a = ws.aircraft[p["aircraft_id"]]
            start = ws.now
            # an aircraft already airborne (or about to launch) finishes that sortie first
            if active:
                for s in active.sorties:
                    if s.aircraft_id == a.id and s.takeoff < ws.now + ws.rules.freeze_min and s.landing > start:
                        start = s.landing
            start = int(start)
            a.unavailable.append(Window(start=start, end=p["until"], reason=p["reason"]))
            a.meta = meta
            facts.update(aircraft_id=a.id, start=start, end=p["until"],
                         description=f"{a.id} unavailable {fmt_min(start)}-{fmt_min(p['until'])} ({p['reason']})")
        case "crew_unavailable":
            c = ws.crews[p["crew_id"]]
            c.unavailable.append(Window(start=p["start"], end=p["end"], reason=p.get("reason", "unavailable")))
            c.meta = meta
            facts.update(crew_id=c.id)
        case "new_mission":
            mid = ws.next_mission_id()
            mtype = ws.mission_types[p["mission_type"]]
            name = p.get("name") or f"{mtype.name} {ws.zones[p['zone_id']].name.split(' ', 2)[-1]}"
            ws.missions[mid] = Mission(
                id=mid, name=name, type_id=mtype.id, priority=p["priority"], zone_id=p["zone_id"],
                window_start=p["start"], window_end=min(p["start"] + p["window_min"], ws.rules.horizon_end),
                duration_min=p["duration_min"], aircraft_required=p["aircraft"], origin=ev.origin, meta=meta)
            facts.update(mission_id=mid)
        case "weather_closure":
            ws.weather.append(WeatherSegment(location_id=p["location_id"], start=p["start"], end=p["end"],
                                             ceiling_ft=0, vis_km=0.0, kind="closure", note="closed", meta=meta))
            facts.update(location_id=p["location_id"], start=p["start"], end=p["end"])
        case "zone_restriction":
            rid = f"R{len(ws.restrictions) + 1}"
            ws.restrictions.append(Restriction(id=rid, zone_id=p["zone_id"], start=p["start"], end=p["end"],
                                               reason=p.get("reason", "restricted by planner"), meta=meta))
            facts.update(zone_id=p["zone_id"])
        case "threat_zone":
            tid = f"T{len(ws.threats) + 1}"
            ws.threats.append(Threat(id=tid, zone_id=p["zone_id"], level=p["level"], start=p["start"], end=p["end"],
                                     note=p.get("note", "new threat report"), meta=meta))
            facts.update(zone_id=p["zone_id"], level=p["level"])
        case "risk_update":
            a = ws.aircraft[p["aircraft_id"]]
            for k in ("faults_30d", "hours_since_maint", "days_since_inspection"):
                if k in p:
                    setattr(a.risk, k, p[k])
            a.meta = meta
            facts.update(aircraft_id=a.id)
        case "cancel_mission":
            ws.missions[p["mission_id"]].status = "cancelled"
            facts.update(mission_id=p["mission_id"])
        case "set_priority":
            m = ws.missions[p["mission_id"]]
            facts.update(mission_id=m.id, old_priority=m.priority)
            m.priority = p["priority"]
    ws.touch()
    return facts

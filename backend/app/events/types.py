"""Event types. Planner chat conditions and reject notes are expressed with the same types,
so every change to the picture goes through one classify -> apply -> replan path."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.fusion.world import WorldState, fmt_min

EventType = Literal[
    "aircraft_down",
    "crew_unavailable",
    "new_mission",
    "weather_closure",
    "zone_restriction",
    "threat_zone",
    "risk_update",
    "cancel_mission",
    "set_priority",
]

DEFAULT_DURATION = {"STRIKE": 150, "SEAD": 120, "CAP": 180, "ISR": 240, "AIRLIFT": 180}
DEFAULT_AIRCRAFT = {"STRIKE": 2, "SEAD": 2, "CAP": 2, "ISR": 1, "AIRLIFT": 1}


class EventIn(BaseModel):
    type: EventType
    params: dict[str, Any] = Field(default_factory=dict)
    origin: str = "event panel"


class EventError(ValueError):
    pass


def _t(v: Any, name: str) -> int:
    """Accept minutes (int) or 'HH:MM'."""
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str) and ":" in v:
        h, m = v.strip().split(":")
        return int(h) * 60 + int(m)
    if isinstance(v, str) and v.strip().isdigit():
        return int(v.strip()) * 60 if int(v) <= 24 else int(v)
    raise EventError(f"{name}: expected a time like 14:00")


def normalise(ev: EventIn, ws: WorldState) -> EventIn:
    """Check ids, fill defaults, convert times to minutes. Raises EventError with a plain message."""
    p = dict(ev.params)
    t = ev.type
    end_of_day = ws.rules.horizon_end

    def need(key: str) -> Any:
        if p.get(key) in (None, ""):
            raise EventError(f"missing {key.replace('_', ' ')}")
        return p[key]

    if t in ("aircraft_down", "risk_update"):
        aid = str(need("aircraft_id")).upper()
        if aid not in ws.aircraft:
            raise EventError(f"unknown aircraft {aid}")
        p["aircraft_id"] = aid
        if t == "aircraft_down":
            p["until"] = _t(p.get("until", end_of_day), "until")
            p["reason"] = p.get("reason") or "reported unserviceable"
        else:
            for k in ("faults_30d", "hours_since_maint", "days_since_inspection"):
                if p.get(k) not in (None, ""):
                    p[k] = float(p[k]) if k == "hours_since_maint" else int(p[k])
                else:
                    p.pop(k, None)
            if not any(k in p for k in ("faults_30d", "hours_since_maint", "days_since_inspection")):
                raise EventError("give at least one maintenance value")
    elif t == "crew_unavailable":
        cid = str(need("crew_id")).upper()
        if cid not in ws.crews:
            raise EventError(f"unknown crew {cid}")
        p["crew_id"] = cid
        p["start"] = _t(p.get("start", 0), "start")
        p["end"] = _t(p.get("end", end_of_day), "end")
    elif t == "new_mission":
        mtype = str(need("mission_type")).upper()
        if mtype not in ws.mission_types:
            raise EventError(f"unknown mission type {mtype}")
        zone = str(need("zone_id")).upper()
        if zone not in ws.zones:
            raise EventError(f"unknown zone {zone}")
        p.update(mission_type=mtype, zone_id=zone)
        p["priority"] = int(p.get("priority", 2))
        if not 1 <= p["priority"] <= 4:
            raise EventError("priority must be 1 to 4")
        p["start"] = _t(need("start"), "start")
        p["window_min"] = int(p.get("window_min", 30))
        p["duration_min"] = int(p.get("duration_min") or DEFAULT_DURATION[mtype])
        p["aircraft"] = int(p.get("aircraft") or DEFAULT_AIRCRAFT[mtype])
    elif t in ("weather_closure", "zone_restriction"):
        key = "location_id" if t == "weather_closure" else "zone_id"
        loc = str(need(key)).upper()
        valid = (set(ws.bases) | set(ws.zones)) if t == "weather_closure" else set(ws.zones)
        if loc not in valid:
            raise EventError(f"unknown location {loc}")
        p[key] = loc
        p["start"] = _t(need("start"), "start")
        p["end"] = _t(need("end"), "end")
        if p["end"] <= p["start"]:
            raise EventError("end must be after start")
    elif t == "threat_zone":
        zone = str(need("zone_id")).upper()
        if zone not in ws.zones:
            raise EventError(f"unknown zone {zone}")
        p["zone_id"] = zone
        p["level"] = int(p.get("level", 3))
        if not 0 <= p["level"] <= 3:
            raise EventError("threat level must be 0 to 3")
        p["start"] = _t(p.get("start", 0), "start")
        p["end"] = _t(p.get("end", end_of_day), "end")
    elif t in ("cancel_mission", "set_priority"):
        mid = str(need("mission_id")).upper()
        if mid not in ws.missions:
            raise EventError(f"unknown mission {mid}")
        p["mission_id"] = mid
        if t == "set_priority":
            p["priority"] = int(need("priority"))
            if not 1 <= p["priority"] <= 4:
                raise EventError("priority must be 1 to 4")
    return EventIn(type=t, params=p, origin=ev.origin)


def describe(ev: EventIn, ws: WorldState | None = None) -> str:
    p = ev.params

    def name(loc: str) -> str:
        return ws.bases[loc].name if ws and loc in ws.bases else loc

    match ev.type:
        case "aircraft_down":
            until = "end of day" if p.get("until", 1440) >= 1440 else fmt_min(p["until"])
            return f"{p['aircraft_id']} down until {until} ({p.get('reason', 'unserviceable')})"
        case "crew_unavailable":
            return f"Crew {p['crew_id']} unavailable {fmt_min(p['start'])}-{fmt_min(p['end'])}"
        case "new_mission":
            return (f"New P{p['priority']} {p['mission_type'].lower()} on {p['zone_id']} at {fmt_min(p['start'])} "
                    f"({p['aircraft']} aircraft, {p['duration_min']} min)")
        case "weather_closure":
            return f"{name(p['location_id'])} closed by weather {fmt_min(p['start'])}-{fmt_min(p['end'])}"
        case "zone_restriction":
            return f"{p['zone_id']} airspace restricted {fmt_min(p['start'])}-{fmt_min(p['end'])}"
        case "threat_zone":
            return f"{p['zone_id']} threat raised to level {p['level']} {fmt_min(p['start'])}-{fmt_min(p['end'])}"
        case "risk_update":
            bits = [f"{k.replace('_', ' ')} {v}" for k, v in p.items() if k != "aircraft_id"]
            return f"{p['aircraft_id']} maintenance update: {', '.join(bits)}"
        case "cancel_mission":
            return f"Mission {p['mission_id']} cancelled"
        case "set_priority":
            return f"Mission {p['mission_id']} set to P{p['priority']}"
    return ev.type

"""Classify an event: category, severity, cache signature and which active sorties it touches."""

from __future__ import annotations

from pydantic import BaseModel

from app.events.types import EventIn, describe
from app.fusion.schema import Plan
from app.fusion.world import WorldState

CATEGORY = {
    "aircraft_down": "Resource loss",
    "crew_unavailable": "Resource loss",
    "new_mission": "New tasking",
    "cancel_mission": "Tasking change",
    "set_priority": "Tasking change",
    "weather_closure": "Weather",
    "zone_restriction": "Airspace",
    "threat_zone": "Threat",
    "risk_update": "Maintenance risk",
}


class Classification(BaseModel):
    category: str
    severity: str  # low | medium | high
    signature: str
    affected: list[str]  # "mission/aircraft" keys of active sorties touched
    summary: str


def signature(ev: EventIn) -> str:
    """Stable key for the contingency cache. Times that depend on 'now' are left out on purpose."""
    p = ev.params
    match ev.type:
        case "aircraft_down":
            return f"aircraft_down|{p['aircraft_id']}|until={p['until']}"
        case "crew_unavailable":
            return f"crew_unavailable|{p['crew_id']}|{p['start']}-{p['end']}"
        case "new_mission":
            return (f"new_mission|{p['mission_type']}|P{p['priority']}|{p['zone_id']}|{p['start']}+{p['window_min']}"
                    f"|{p['duration_min']}|{p['aircraft']}")
        case "weather_closure":
            return f"weather_closure|{p['location_id']}|{p['start']}-{p['end']}"
        case "zone_restriction":
            return f"zone_restriction|{p['zone_id']}|{p['start']}-{p['end']}"
        case "threat_zone":
            return f"threat_zone|{p['zone_id']}|L{p['level']}|{p['start']}-{p['end']}"
        case "risk_update":
            vals = ",".join(f"{k}={p[k]}" for k in sorted(p) if k != "aircraft_id")
            return f"risk_update|{p['aircraft_id']}|{vals}"
        case "cancel_mission":
            return f"cancel_mission|{p['mission_id']}"
        case "set_priority":
            return f"set_priority|{p['mission_id']}|P{p['priority']}"
    return ev.type


def combined_signature(events: list[EventIn]) -> str:
    return " + ".join(sorted(signature(e) for e in events))


def affected_sorties(ev: EventIn, ws: WorldState, active: Plan | None) -> list[str]:
    if active is None:
        return []
    p = ev.params
    hit = []
    for s in active.sorties:
        a = ws.aircraft.get(s.aircraft_id)
        m = ws.missions.get(s.mission_id)
        if a is None or m is None:
            continue
        touched = False
        match ev.type:
            case "aircraft_down" | "risk_update":
                touched = s.aircraft_id == p["aircraft_id"] and s.landing > ws.now
            case "crew_unavailable":
                touched = s.crew_id == p["crew_id"] and s.takeoff < p["end"] and p["start"] < s.landing
            case "weather_closure":
                loc = p["location_id"]
                if loc == a.base_id:
                    touched = any(p["start"] <= t < p["end"] for t in (s.takeoff, s.landing))
                elif loc == m.zone_id:
                    touched = s.takeoff < p["end"] and p["start"] < s.landing
            case "zone_restriction" | "threat_zone":
                touched = m.zone_id == p["zone_id"] and s.takeoff < p["end"] and p["start"] < s.landing
            case "cancel_mission" | "set_priority":
                touched = s.mission_id == p["mission_id"]
        if touched:
            hit.append(f"{s.mission_id}/{s.aircraft_id}")
    return hit


def classify(ev: EventIn, ws: WorldState, active: Plan | None) -> Classification:
    affected = affected_sorties(ev, ws, active)
    p1_hit = any(ws.missions[k.split("/")[0]].priority == 1 for k in affected if k.split("/")[0] in ws.missions)
    if ev.type == "new_mission":
        severity = "high" if ev.params["priority"] == 1 else "medium"
    elif p1_hit or len(affected) >= 3:
        severity = "high"
    elif affected:
        severity = "medium"
    else:
        severity = "low"
    return Classification(category=CATEGORY[ev.type], severity=severity, signature=signature(ev),
                          affected=affected, summary=describe(ev, ws))

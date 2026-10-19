"""Offline rule-based parser: planner text -> structured conditions (EventIn).

Always available, so the chat works with no API key and no network.
Examples it understands:
  "Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00"
  "AR-104 down until 18:00"            "crew C-07 sick"
  "zone 4 restricted 10:00-12:00"      "threat level 3 in Z5"
  "cancel M14"                         "raise M11 to P2"
  "SK-205 has 5 faults"                "fog at Z2 from 13 to 15"
"""

from __future__ import annotations

import re

from app.events.types import EventIn

TIME = r"(\d{1,2}:\d{2}|\d{4}|\d{1,2})"
RANGE = re.compile(rf"(?:from\s+|between\s+)?{TIME}\s*(?:h|hrs|z)?\s*(?:to|-|–|until|till|and)\s*{TIME}", re.I)
BASE = re.compile(r"\b(?:base\s*([12])|b([12])\b|(corvane)|(ostrel))", re.I)
ZONE = re.compile(r"\b(?:zone\s*(\d)|z(\d))\b", re.I)
AIRCRAFT = re.compile(r"\b(AR|SK|NC|TV)\s*-?\s*(\d{3})\b", re.I)
CREW = re.compile(r"\bcrew\s*(?:c\s*-?\s*)?(\d{1,2})\b|\bc-(\d{1,2})\b", re.I)
MISSION = re.compile(r"\bm\s*-?\s*(\d{1,2})\b", re.I)
PRIORITY = re.compile(r"\b(?:p|priority\s*)([1-4])\b", re.I)
AT = re.compile(rf"\b(?:at|from|@)\s*{TIME}\b", re.I)
UNTIL = re.compile(rf"\b(?:until|till|to)\s*{TIME}\b", re.I)
COUNT = re.compile(r"\b([1-4])\s*(?:x\s*)?(?:aircraft|ship|jets?|planes?|airframes?)\b|\b([1-4])-ship\b", re.I)
DURATION = re.compile(r"\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b", re.I)

MISSION_WORDS = [
    ("SEAD", r"\bsead\b|suppress"),
    ("STRIKE", r"\bstrike|attack|bomb"),
    ("CAP", r"\bcap\b|patrol|air cover"),
    ("ISR", r"\bisr\b|recce|recon|reconnaissance|surveillance"),
    ("AIRLIFT", r"airlift|resupply|transport|drop"),
]
CLOSED = r"closed?|closure|shut|fog|storm|weather|no ops|unusable"
DOWN = r"\bdown\b|unserviceable|\bu/s\b|unavailable|grounded|broken|faulty|don'?t use|do not use|avoid|out of action"


def _hm(t: str) -> str:
    t = t.strip()
    if ":" in t:
        h, m = t.split(":")
    elif len(t) == 4:
        h, m = t[:2], t[2:]
    else:
        h, m = t, "00"
    return f"{int(h):02d}:{int(m):02d}"


WORD_NUM = {"one": "1", "two": "2", "three": "3", "four": "4"}


def _clean(text: str) -> str:
    """'2pm' -> '14:00', 'priority one' -> 'P1'."""

    def ampm(m: re.Match) -> str:
        h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "pm" else 0)
        return f"{h:02d}:{m.group(2) or '00'}"

    text = re.sub(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", ampm, text, flags=re.I)
    return re.sub(r"\bpriority\s+(one|two|three|four)\b", lambda m: f"P{WORD_NUM[m.group(1).lower()]}", text, flags=re.I)


def _split(text: str) -> list[str]:
    text = _clean(text)
    text = re.sub(rf"between\s+{TIME}\s+and\s+{TIME}", lambda m: f"{m.group(1)} to {m.group(2)}", text, flags=re.I)
    parts = re.split(r"[;,\n]|\.\s|\band\b(?!\s*\d)|\balso\b|\bplus\b", text, flags=re.I)
    return [p.strip() for p in parts if p and p.strip()]


def _range(clause: str) -> tuple[str, str] | None:
    m = RANGE.search(clause)
    return (_hm(m.group(1)), _hm(m.group(2))) if m else None


def parse_offline(text: str) -> tuple[list[EventIn], list[str]]:
    events: list[EventIn] = []
    leftovers: list[str] = []
    for clause in _split(text):
        ev = _parse_clause(clause)
        if ev is None:
            leftovers.append(clause)
        else:
            events.append(ev)
    return events, leftovers


def _parse_clause(c: str) -> EventIn | None:
    low = c.lower()
    rng = _range(c)

    # cancel / priority change on an existing mission
    mm = MISSION.search(c)
    if mm and re.search(r"cancel|drop|scrub|remove|abort", low):
        return EventIn(type="cancel_mission", params={"mission_id": f"M{int(mm.group(1)):02d}"}, origin="planner chat")
    pm = PRIORITY.search(c)
    if mm and pm and re.search(r"raise|lower|set|make|change|bump|priorit|to p|as p", low) and not re.search(r"\badd|\bnew\b", low):
        return EventIn(type="set_priority", params={"mission_id": f"M{int(mm.group(1)):02d}",
                                                    "priority": int(pm.group(1))}, origin="planner chat")

    # new mission
    mtype = next((t for t, pat in MISSION_WORDS if re.search(pat, low)), None)
    zm = ZONE.search(c)
    if mtype and zm and (re.search(r"\badd|\bnew\b|\btask|\bneed|\bschedule|\bplan\b|\bfly\b", low) or pm):
        params: dict = {"mission_type": mtype, "zone_id": f"Z{zm.group(1) or zm.group(2)}",
                        "priority": int(pm.group(1)) if pm else 2}
        at = AT.search(c)
        if at:
            params["start"] = _hm(at.group(1))
        elif rng:
            params["start"] = rng[0]
        else:
            return None
        cm = COUNT.search(c)
        if cm:
            params["aircraft"] = int(cm.group(1) or cm.group(2))
        dm = DURATION.search(c)
        if dm:
            v = float(dm.group(1))
            params["duration_min"] = int(v * 60 if dm.group(2).lower().startswith("h") else v)
        return EventIn(type="new_mission", params=params, origin="planner chat")

    # threat
    if zm and re.search(r"threat|sam\b|air defen[cs]e|manpads|hostile", low):
        lvl = re.search(r"level\s*([0-3])", low)
        level = int(lvl.group(1)) if lvl else 3 if "high" in low else 2 if "medium" in low else 1 if "low" in low else 3
        params = {"zone_id": f"Z{zm.group(1) or zm.group(2)}", "level": level}
        if rng:
            params.update(start=rng[0], end=rng[1])
        return EventIn(type="threat_zone", params=params, origin="planner chat")

    # aircraft risk update / down
    am = AIRCRAFT.search(c)
    if am:
        aid = f"{am.group(1).upper()}-{am.group(2)}"
        faults = re.search(r"(\d+)\s*(?:new\s*)?faults?", low)
        hours = re.search(r"(\d+(?:\.\d+)?)\s*(?:flight\s*)?hours?\s*(?:since|after)", low)
        if faults or hours:
            params = {"aircraft_id": aid}
            if faults:
                params["faults_30d"] = int(faults.group(1))
            if hours:
                params["hours_since_maint"] = float(hours.group(1))
            return EventIn(type="risk_update", params=params, origin="planner chat")
        if re.search(DOWN, low):
            params = {"aircraft_id": aid}
            um = UNTIL.search(c)
            if um:
                params["until"] = _hm(um.group(1))
            return EventIn(type="aircraft_down", params=params, origin="planner chat")

    # crew
    cm = CREW.search(c)
    if cm and re.search(r"sick|unavailable|off|rest|not available|stood down|grounded", low):
        params = {"crew_id": f"C-{int(cm.group(1) or cm.group(2)):02d}"}
        if rng:
            params.update(start=rng[0], end=rng[1])
        return EventIn(type="crew_unavailable", params=params, origin="planner chat")

    # base closure
    bm = BASE.search(c)
    if bm and re.search(CLOSED, low):
        num = bm.group(1) or bm.group(2) or ("1" if bm.group(3) else "2")
        params = {"location_id": f"B{num}"}
        if rng:
            params.update(start=rng[0], end=rng[1])
        else:
            return None
        return EventIn(type="weather_closure", params=params, origin="planner chat")

    # zone closure: weather -> weather_closure, otherwise airspace restriction
    if zm and re.search(CLOSED + r"|restrict|no[- ]fly|avoid|keep out", low) and rng:
        z = f"Z{zm.group(1) or zm.group(2)}"
        if re.search(r"fog|storm|weather|cloud", low):
            return EventIn(type="weather_closure", params={"location_id": z, "start": rng[0], "end": rng[1]},
                           origin="planner chat")
        return EventIn(type="zone_restriction", params={"zone_id": z, "start": rng[0], "end": rng[1]},
                       origin="planner chat")
    return None

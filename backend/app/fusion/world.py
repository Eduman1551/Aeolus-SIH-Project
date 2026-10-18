"""WorldState: the single fused, live picture of fleet, crews, weapons, airspace, weather, threats and tasking."""

from __future__ import annotations

import copy
import hashlib
import json
import math
from collections import deque
from datetime import UTC, datetime
from typing import Any

from app.data.loader import SourceFile, load_sources
from app.fusion.schema import (
    Aircraft,
    AircraftType,
    Base,
    Crew,
    Meta,
    Mission,
    MissionType,
    PlanningRules,
    Restriction,
    Threat,
    WeaponStock,
    WeaponType,
    WeatherSegment,
    Zone,
)


def wall_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def fmt_min(m: float) -> str:
    m = int(round(m))
    return f"{m // 60:02d}:{m % 60:02d}"


class WorldState:
    def __init__(self) -> None:
        self.bases: dict[str, Base] = {}
        self.zones: dict[str, Zone] = {}
        self.restrictions: list[Restriction] = []
        self.aircraft_types: dict[str, AircraftType] = {}
        self.aircraft: dict[str, Aircraft] = {}
        self.crews: dict[str, Crew] = {}
        self.weapon_types: dict[str, WeaponType] = {}
        self.stock: list[WeaponStock] = []
        self.weather: list[WeatherSegment] = []
        self.threats: list[Threat] = []
        self.mission_types: dict[str, MissionType] = {}
        self.missions: dict[str, Mission] = {}
        self.rules = PlanningRules()
        self.observations: dict[str, dict[str, Any]] = {}  # latest live weather obs per location
        self.now: float = 360.0
        self.version: int = 0  # bumps on every planning-relevant change
        self.seed: int = 0
        self.sources: dict[str, dict[str, Any]] = {}
        self.fusion_issues: list[str] = []
        self.feed_log: deque[dict] = deque(maxlen=200)

    # ---------- lookups ----------

    def distance_km(self, base_id: str, zone_id: str) -> float:
        b, z = self.bases[base_id], self.zones[zone_id]
        return math.hypot(b.x_km - z.x_km, b.y_km - z.y_km)

    def stock_of(self, base_id: str, weapon_id: str) -> int:
        for s in self.stock:
            if s.base_id == base_id and s.weapon_id == weapon_id:
                return s.qty
        return 0

    def open_missions(self) -> list[Mission]:
        return sorted((m for m in self.missions.values() if m.status == "open"), key=lambda m: m.id)

    def next_mission_id(self) -> str:
        n = max((int(mid[1:]) for mid in self.missions if mid[1:].isdigit()), default=0) + 1
        return f"M{n:02d}"

    # ---------- change tracking ----------

    def touch(self) -> None:
        self.version += 1

    def fingerprint(self) -> str:
        """Hash of every planning-relevant field (no clock, telemetry, observations or meta)."""
        drop = {"meta", "telemetry", "checked_in"}

        def dump(items) -> list:
            return [i.model_dump(exclude=drop) for i in items]

        payload = {
            "aircraft": dump(self.aircraft.values()),
            "crews": dump(self.crews.values()),
            "stock": dump(self.stock),
            "weather": dump(self.weather),
            "threats": dump(self.threats),
            "restrictions": dump(self.restrictions),
            "missions": dump(self.missions.values()),
            "rules": self.rules.model_dump(),
        }
        return hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]

    def clone(self) -> WorldState:
        other = copy.copy(self)
        for attr in ("bases", "zones", "aircraft_types", "aircraft", "crews", "weapon_types", "mission_types",
                     "missions", "observations", "sources"):
            setattr(other, attr, copy.deepcopy(getattr(self, attr)))
        for attr in ("restrictions", "stock", "weather", "threats", "fusion_issues"):
            setattr(other, attr, copy.deepcopy(getattr(self, attr)))
        other.rules = self.rules.model_copy()
        other.feed_log = deque(maxlen=200)
        return other

    # ---------- serialisation ----------

    def snapshot(self) -> dict[str, Any]:
        def dump(items) -> list:
            return [i.model_dump() for i in items]

        return {
            "now": self.now,
            "version": self.version,
            "fingerprint": self.fingerprint(),
            "seed": self.seed,
            "synthetic": True,
            "rules": self.rules.model_dump(),
            "bases": dump(self.bases.values()),
            "zones": dump(self.zones.values()),
            "restrictions": dump(self.restrictions),
            "aircraft_types": dump(self.aircraft_types.values()),
            "aircraft": dump(self.aircraft.values()),
            "crews": dump(self.crews.values()),
            "weapon_types": dump(self.weapon_types.values()),
            "stock": dump(self.stock),
            "weather": dump(self.weather),
            "threats": dump(self.threats),
            "mission_types": dump(self.mission_types.values()),
            "missions": dump(self.missions.values()),
            "observations": self.observations,
            "sources": self.sources,
            "fusion_issues": self.fusion_issues,
        }


def _meta(source: str, ts: str) -> Meta:
    return Meta(source=source, updated_at=ts)


def fuse(sources: list[SourceFile] | None = None) -> WorldState:
    """Merge every source file into one WorldState, tagging each record with its source and timestamp."""
    sources = sources if sources is not None else load_sources()
    ws = WorldState()
    ts = wall_now()
    for sf in sources:
        p, src = sf.payload, sf.source
        ws.seed = ws.seed or sf.seed
        count = 0
        for raw in p.get("aircraft_types", []):
            ws.aircraft_types[raw["id"]] = AircraftType(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("aircraft", []):
            ws.aircraft[raw["id"]] = Aircraft(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("crews", []):
            ws.crews[raw["id"]] = Crew(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("weapon_types", []):
            ws.weapon_types[raw["id"]] = WeaponType(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("stock", []):
            ws.stock.append(WeaponStock(**raw, meta=_meta(src, ts)))
            count += 1
        for raw in p.get("bases", []):
            ws.bases[raw["id"]] = Base(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("zones", []):
            ws.zones[raw["id"]] = Zone(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("restrictions", []):
            ws.restrictions.append(Restriction(**raw, meta=_meta(src, ts)))
            count += 1
        for raw in p.get("weather", []):
            ws.weather.append(WeatherSegment(**raw, meta=_meta(src, ts)))
            count += 1
        for raw in p.get("threats", []):
            ws.threats.append(Threat(**raw, meta=_meta(src, ts)))
            count += 1
        for raw in p.get("mission_types", []):
            ws.mission_types[raw["id"]] = MissionType(**raw, meta=_meta(src, ts))
            count += 1
        for raw in p.get("missions", []):
            ws.missions[raw["id"]] = Mission(**raw, meta=_meta(src, ts))
            count += 1
        if "rules" in p:
            ws.rules = PlanningRules(**p["rules"])
            count += 1
        ws.sources[sf.name] = {"source": src, "records": count, "loaded_at": ts}

    ws.fusion_issues = check_references(ws)
    ws.now = float(ws.rules.scenario_start)
    return ws


def check_references(ws: WorldState) -> list[str]:
    """Cross-source consistency checks. Problems are reported, not silently fixed."""
    issues = []
    for a in ws.aircraft.values():
        if a.type_id not in ws.aircraft_types:
            issues.append(f"aircraft {a.id}: unknown type {a.type_id}")
        if a.base_id not in ws.bases:
            issues.append(f"aircraft {a.id}: unknown base {a.base_id}")
    for c in ws.crews.values():
        if c.base_id not in ws.bases:
            issues.append(f"crew {c.id}: unknown base {c.base_id}")
        for q in c.qualified_types:
            if q not in ws.aircraft_types:
                issues.append(f"crew {c.id}: unknown qualification {q}")
    for s in ws.stock:
        if s.weapon_id not in ws.weapon_types or s.base_id not in ws.bases:
            issues.append(f"stock {s.base_id}/{s.weapon_id}: unknown base or weapon")
    for m in ws.missions.values():
        if m.type_id not in ws.mission_types:
            issues.append(f"mission {m.id}: unknown type {m.type_id}")
        if m.zone_id not in ws.zones:
            issues.append(f"mission {m.id}: unknown zone {m.zone_id}")
    locs = set(ws.bases) | set(ws.zones)
    for w in ws.weather:
        if w.location_id not in locs:
            issues.append(f"weather: unknown location {w.location_id}")
    return issues

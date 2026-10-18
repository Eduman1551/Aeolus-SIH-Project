"""Unified schema for every record Aeolus knows about.

All times are integer minutes from 00:00 on scenario day 1 (0..1440).
All data is synthetic and fictional.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Minute = int


class Meta(BaseModel):
    """Where a record came from and when it was last updated (wall clock, ISO)."""

    source: str
    updated_at: str


class Record(BaseModel):
    meta: Meta | None = None


class Window(BaseModel):
    start: Minute
    end: Minute
    reason: str = ""


# ---------- airspace ----------


class Base(Record):
    id: str
    name: str
    x_km: float
    y_km: float


class Zone(Record):
    id: str
    name: str
    x_km: float
    y_km: float


class Restriction(Record):
    """Airspace restriction: no mission may operate in the zone during the window."""

    id: str
    zone_id: str
    start: Minute
    end: Minute
    reason: str


# ---------- fleet ----------


class AircraftType(Record):
    id: str
    name: str
    role: str
    radius_km: float
    turnaround_min: int
    min_ceiling_ft: int  # base weather minimums for take-off / landing
    min_vis_km: float
    max_threat: int  # highest zone threat level this type may enter (0-3)
    vulnerability: int  # 1 (low) .. 3 (high), scales the threat risk penalty
    weather_sensitivity: int  # 0..2, scales the marginal-weather penalty


class RiskInputs(BaseModel):
    """Maintenance indicators used by the serviceability model."""

    hours_since_maint: float
    age_years: float
    faults_30d: int
    days_since_inspection: int
    sorties_7d: int


class Telemetry(BaseModel):
    fuel_pct: int = 100
    position: str = "on ground"
    last_report: str | None = None


class Aircraft(Record):
    id: str
    type_id: str
    base_id: str
    status: Literal["serviceable", "unserviceable"] = "serviceable"
    unavailable: list[Window] = Field(default_factory=list)
    risk: RiskInputs
    telemetry: Telemetry = Field(default_factory=Telemetry)


class Crew(Record):
    id: str
    callsign: str
    base_id: str
    qualified_types: list[str]
    duty_start: Minute
    duty_end: Minute
    max_duty_min: int
    status: Literal["available", "unavailable"] = "available"
    unavailable: list[Window] = Field(default_factory=list)
    checked_in: bool = False


# ---------- armament ----------


class WeaponType(Record):
    id: str
    name: str
    category: str
    compatible_types: list[str]


class WeaponStock(Record):
    base_id: str
    weapon_id: str
    qty: int


# ---------- weather / threats ----------


class WeatherSegment(Record):
    location_id: str  # base or zone id
    start: Minute
    end: Minute
    ceiling_ft: int
    vis_km: float
    wind_kt: int = 10
    kind: Literal["forecast", "closure"] = "forecast"
    note: str = ""


class Threat(Record):
    id: str
    zone_id: str
    level: int  # 0..3
    start: Minute = 0
    end: Minute = 1440
    note: str = ""


# ---------- tasking ----------


class MissionType(Record):
    id: str
    name: str
    eligible_types: list[str]
    loadouts: dict[str, dict[str, int]]  # aircraft type -> {weapon id: qty per aircraft}
    target_min_ceiling_ft: int
    target_min_vis_km: float


class Mission(Record):
    id: str
    name: str
    type_id: str
    priority: int  # 1 (highest) .. 4
    zone_id: str
    window_start: Minute  # earliest take-off
    window_end: Minute  # latest take-off
    duration_min: int
    aircraft_required: int = 1
    status: Literal["open", "cancelled"] = "open"
    origin: str = "tasking order"


class PlanningRules(BaseModel):
    brief_min: int = 60
    debrief_min: int = 30
    horizon_start: Minute = 360
    horizon_end: Minute = 1440
    scenario_start: Minute = 360
    freeze_min: int = 30  # sorties taking off within this many minutes of "now" are locked


# ---------- plans ----------


class Sortie(BaseModel):
    mission_id: str
    aircraft_id: str
    crew_id: str
    takeoff: Minute
    landing: Minute
    loadout: dict[str, int] = Field(default_factory=dict)


class Unassigned(BaseModel):
    mission_id: str
    reason: str


PlanStatus = Literal["draft", "pending_approval", "invalid", "active", "rejected", "superseded", "ended"]


class Plan(BaseModel):
    id: str
    created_at: str
    source: Literal["cpsat", "greedy", "cache"]
    status: PlanStatus = "draft"
    sorties: list[Sortie] = Field(default_factory=list)
    unassigned: list[Unassigned] = Field(default_factory=list)
    parent_id: str | None = None
    solve_ms: float = 0.0
    solver_status: str = ""
    objective: float | None = None
    world_version: int = 0
    note: str = ""

    def by_mission(self) -> dict[str, list[Sortie]]:
        out: dict[str, list[Sortie]] = {}
        for s in self.sorties:
            out.setdefault(s.mission_id, []).append(s)
        return out

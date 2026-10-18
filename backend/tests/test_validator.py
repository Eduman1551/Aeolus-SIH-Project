"""One violating case per validator rule, plus a clean plan that must pass."""

import pytest
from app.fusion.schema import Mission, Plan, Restriction, Sortie, Threat, WeatherSegment, Window
from app.fusion.world import fuse
from app.validator import RULES, validate_plan

CAP_LOAD = {"AAM-L": 2, "AAM-S": 2}


@pytest.fixture
def ws():
    return fuse()


def cap_sortie(aircraft="AR-101", crew="C-01", mission="M01", takeoff=450, duration=180, load=None):
    return Sortie(mission_id=mission, aircraft_id=aircraft, crew_id=crew, takeoff=takeoff,
                  landing=takeoff + duration, loadout=dict(CAP_LOAD if load is None else load))


def plan_of(*sorties):
    return Plan(id="t", created_at="", source="cpsat", sorties=list(sorties))


def good_plan():
    return plan_of(cap_sortie(), cap_sortie(aircraft="AR-102", crew="C-03"))


def add_cap_mission(ws, mid="M90", start=700):
    ws.missions[mid] = Mission(id=mid, name="test", type_id="CAP", priority=3, zone_id="Z1", window_start=start,
                               window_end=start, duration_min=60, aircraft_required=1)


def fired(ws, plan, now=None):
    return {v.rule for v in validate_plan(ws, plan, now).violations}


def test_clean_plan_passes(ws):
    rep = validate_plan(ws, good_plan())
    assert rep.ok, rep.violations
    assert len(rep.rules) == len(RULES) and all(r.passed for r in rep.rules)


def test_mission_open(ws):
    ws.missions["M01"].status = "cancelled"
    assert "mission_open" in fired(ws, good_plan())


def test_aircraft_count(ws):
    assert "aircraft_count" in fired(ws, plan_of(cap_sortie()))


def test_takeoff_window(ws):
    p = plan_of(cap_sortie(takeoff=480), cap_sortie(aircraft="AR-102", crew="C-03", takeoff=480))
    assert "takeoff_window" in fired(ws, p)


def test_aircraft_serviceable(ws):
    ws.aircraft["AR-101"].unavailable.append(Window(start=400, end=500, reason="hydraulic leak"))
    assert "aircraft_serviceable" in fired(ws, good_plan())


def test_aircraft_type(ws):
    p = plan_of(cap_sortie(aircraft="NC-301", load={}), cap_sortie(aircraft="AR-102", crew="C-03"))
    assert "aircraft_type" in fired(ws, p)


def test_aircraft_range(ws):
    ws.missions["M01"].zone_id = "Z5"  # ~894 km from Base 1, Arcus radius 700
    assert "aircraft_range" in fired(ws, good_plan())


def test_aircraft_double_booking(ws):
    add_cap_mission(ws, start=500)
    p = plan_of(*good_plan().sorties, cap_sortie(mission="M90", takeoff=500, duration=60, crew="C-05"))
    assert "aircraft_double_booking" in fired(ws, p)


def test_turnaround(ws):
    add_cap_mission(ws, start=650)  # lands 630, Arcus needs 60 min
    p = plan_of(*good_plan().sorties, cap_sortie(mission="M90", takeoff=650, duration=60, crew="C-05"))
    assert "turnaround" in fired(ws, p)


def test_crew_qualified(ws):
    p = plan_of(cap_sortie(crew="C-06"), cap_sortie(aircraft="AR-102", crew="C-03"))
    assert "crew_qualified" in fired(ws, p)


def test_crew_availability(ws):
    p = plan_of(cap_sortie(crew="C-02"), cap_sortie(aircraft="AR-102", crew="C-03"))  # C-02 starts at 12:00
    assert "crew_availability" in fired(ws, p)


def test_crew_double_booking(ws):
    add_cap_mission(ws, start=680)  # brief starts 10:20, C-01 debriefs on M01 until 11:00
    p = plan_of(*good_plan().sorties, cap_sortie(aircraft="AR-103", mission="M90", takeoff=680, duration=60))
    assert "crew_double_booking" in fired(ws, p)


def test_crew_duty(ws):
    ws.crews["C-01"].max_duty_min = 200
    assert "crew_duty" in fired(ws, good_plan())


def test_weapon_compatibility(ws):
    p = plan_of(cap_sortie(load={"GB-250": 4}), cap_sortie(aircraft="AR-102", crew="C-03"))
    assert "weapon_compatibility" in fired(ws, p)


def test_weapon_stock(ws):
    next(s for s in ws.stock if s.base_id == "B1" and s.weapon_id == "AAM-L").qty = 2
    assert "weapon_stock" in fired(ws, good_plan())


def test_weather_base(ws):
    ws.weather.append(WeatherSegment(location_id="B1", start=420, end=480, ceiling_ft=0, vis_km=0, kind="closure"))
    assert "weather_base" in fired(ws, good_plan())


def test_weather_target(ws):
    ws.weather.append(WeatherSegment(location_id="Z1", start=500, end=560, ceiling_ft=0, vis_km=0, kind="closure"))
    assert "weather_target" in fired(ws, good_plan())


def test_restricted_zone(ws):
    ws.restrictions.append(Restriction(id="RX", zone_id="Z1", start=500, end=520, reason="test"))
    assert "restricted_zone" in fired(ws, good_plan())


def test_threat_tolerance(ws):
    isr = Sortie(mission_id="M03", aircraft_id="NC-301", crew_id="C-11", takeoff=480, landing=720, loadout={})
    assert validate_plan(ws, plan_of(isr)).ok
    ws.threats.append(Threat(id="TX", zone_id="Z2", level=3))
    assert "threat_tolerance" in fired(ws, plan_of(isr))  # Nocta limit is 2


def test_every_rule_has_a_test():
    names = {n[len("test_"):] for n in globals() if n.startswith("test_")}
    assert {rid for rid, _ in RULES} <= names


def test_committed_sorties_skip_environment_rules(ws):
    ws.weather.append(WeatherSegment(location_id="Z1", start=500, end=560, ceiling_ft=0, vis_km=0, kind="closure"))
    rep = validate_plan(ws, good_plan(), now=460)  # already airborne at 07:30
    assert rep.ok and rep.committed_sorties == 2

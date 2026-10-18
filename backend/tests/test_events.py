import pytest
from app.events.apply import apply_event
from app.events.classify import classify
from app.events.types import EventError, EventIn, normalise
from app.fusion.world import fuse
from app.solver.cpsat import solve
from app.validator import validate_plan


@pytest.fixture
def scenario():
    ws = fuse()
    return ws, solve(ws).plan


def ev(t, **params):
    return EventIn(type=t, params=params)


def test_normalise_rejects_unknown_ids(scenario):
    ws, _ = scenario
    with pytest.raises(EventError):
        normalise(ev("aircraft_down", aircraft_id="XX-999"), ws)
    with pytest.raises(EventError):
        normalise(ev("weather_closure", location_id="B2", start="18:00", end="14:00"), ws)


def test_aircraft_down_classified_and_applied(scenario):
    ws, plan = scenario
    aid = plan.sorties[-1].aircraft_id
    e = normalise(ev("aircraft_down", aircraft_id=aid.lower()), ws)
    c = classify(e, ws, plan)
    assert c.category == "Resource loss" and c.affected
    assert c.signature == f"aircraft_down|{aid}|until=1440"
    v0 = ws.version
    apply_event(e, ws, plan)
    assert ws.version == v0 + 1
    assert ws.aircraft[aid].unavailable[-1].end == 1440
    assert not validate_plan(ws, plan).ok  # the old plan now breaks a rule


def test_weather_closure_hits_base_sorties(scenario):
    ws, plan = scenario
    e = normalise(ev("weather_closure", location_id="b2", start="14:00", end="18:00"), ws)
    c = classify(e, ws, plan)
    assert c.category == "Weather" and c.signature == "weather_closure|B2|840-1080"
    apply_event(e, ws, plan)
    assert ws.weather[-1].kind == "closure"


def test_new_mission_gets_next_id_and_defaults(scenario):
    ws, plan = scenario
    e = normalise(ev("new_mission", mission_type="strike", zone_id="z3", priority=1, start="16:00"), ws)
    assert e.params["aircraft"] == 2 and e.params["duration_min"] == 150
    assert classify(e, ws, plan).severity == "high"
    facts = apply_event(e, ws, plan)
    m = ws.missions[facts["mission_id"]]
    assert m.id == "M16" and m.priority == 1 and m.window_start == 960


def test_signature_ignores_now(scenario):
    ws, plan = scenario
    e = normalise(ev("aircraft_down", aircraft_id="AR-101"), ws)
    s1 = classify(e, ws, plan).signature
    ws.now += 90
    assert classify(e, ws, plan).signature == s1


def test_threat_and_risk_events(scenario):
    ws, plan = scenario
    t = normalise(ev("threat_zone", zone_id="Z3", level=3), ws)
    assert classify(t, ws, plan).category == "Threat"
    apply_event(t, ws, plan)
    assert max(x.level for x in ws.threats if x.zone_id == "Z3") == 3
    r = normalise(ev("risk_update", aircraft_id="AR-101", faults_30d=5), ws)
    apply_event(r, ws, plan)
    assert ws.aircraft["AR-101"].risk.faults_30d == 5

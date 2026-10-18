import pytest
from app.fusion.schema import Mission, WeatherSegment
from app.fusion.world import fuse
from app.solver.cpsat import PRIORITY_WEIGHT, SolveOptions, solve
from app.solver.greedy import greedy
from app.validator import validate_plan


@pytest.fixture
def ws():
    return fuse()


def covered(plan):
    return {s.mission_id for s in plan.sorties}


def weighted(ws, plan):
    return sum(PRIORITY_WEIGHT[ws.missions[m].priority] for m in covered(plan))


def test_default_scenario_solves_fast_and_valid(ws):
    res = solve(ws)
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert res.wall_ms < 10_000
    assert validate_plan(ws, res.plan).ok
    p1 = {m.id for m in ws.open_missions() if m.priority == 1}
    assert p1 <= covered(res.plan)


def test_greedy_is_valid_and_covers_p1(ws):
    res = greedy(ws)
    assert validate_plan(ws, res.plan).ok
    assert {m.id for m in ws.open_missions() if m.priority == 1} <= covered(res.plan)


def test_cpsat_beats_or_matches_greedy(ws):
    assert weighted(ws, solve(ws).plan) >= weighted(ws, greedy(ws).plan)


def test_resources_are_scarce(ws):
    # not every mission fits, so priorities matter
    assert solve(ws).plan.unassigned


def test_impossible_mission_stays_unassigned(ws):
    ws.missions["M99"] = Mission(id="M99", name="too far", type_id="CAP", priority=1, zone_id="Z5",
                                 window_start=600, window_end=600, duration_min=120, aircraft_required=4)
    ws.weather.append(WeatherSegment(location_id="B2", start=540, end=780, ceiling_ft=0, vis_km=0, kind="closure"))
    res = solve(ws)
    assert "M99" in {u.mission_id for u in res.plan.unassigned}
    assert validate_plan(ws, res.plan).ok


def test_no_serviceable_aircraft_gives_empty_but_valid_plan(ws):
    for a in ws.aircraft.values():
        a.status = "unserviceable"
    res = solve(ws)
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert res.plan.sorties == [] and len(res.plan.unassigned) == len(ws.open_missions())


def test_weather_closure_is_respected(ws):
    ws.weather.append(WeatherSegment(location_id="B2", start=840, end=1080, ceiling_ft=0, vis_km=0, kind="closure"))
    res = solve(ws)
    assert validate_plan(ws, res.plan).ok
    b2 = [s for s in res.plan.sorties if ws.aircraft[s.aircraft_id].base_id == "B2"]
    assert all(not (840 <= s.takeoff < 1080 or 840 <= s.landing < 1080) for s in b2)


def test_stock_limit_is_respected(ws):
    for st in ws.stock:
        if st.weapon_id == "ARM-9":
            st.qty = 0
    res = solve(ws)
    assert not any(ws.missions[s.mission_id].type_id == "SEAD" for s in res.plan.sorties)
    assert validate_plan(ws, res.plan).ok


def test_serviceability_risk_moves_assignment(ws):
    base = solve(ws).plan
    used = sorted({s.aircraft_id for s in base.sorties})
    target = used[0]
    risky = solve(ws, SolveOptions(serviceability={target: 0.05}))
    assert validate_plan(ws, risky.plan).ok
    assert sum(s.aircraft_id == target for s in risky.plan.sorties) <= sum(s.aircraft_id == target for s in base.sorties)

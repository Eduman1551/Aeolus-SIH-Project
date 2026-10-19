from app.fusion.schema import WeatherSegment
from app.fusion.world import fuse
from app.predict.model import predict_serviceability
from app.predict.train import train
from app.predict.weather import weather_impact
from app.solver.cpsat import SolveOptions, solve
from app.validator import validate_plan


def test_model_trains_and_is_labelled_synthetic():
    _, meta = train(save=False)
    assert "synthetic" in meta["trained_on"]
    assert meta["test_auc"] > 0.6


def test_worse_maintenance_lowers_probability():
    ws = fuse()
    before = predict_serviceability(ws)["AR-101"]
    ws.aircraft["AR-101"].risk.faults_30d = 6
    ws.aircraft["AR-101"].risk.hours_since_maint = 300
    assert predict_serviceability(ws)["AR-101"] < before - 0.3


def test_changing_risk_inputs_changes_the_plan():
    ws = fuse()
    base = solve(ws, SolveOptions(serviceability=predict_serviceability(ws), weather_impact=weather_impact(ws))).plan
    used = {s.aircraft_id for s in base.sorties}
    target = sorted(used)[0]
    ws.aircraft[target].risk.faults_30d = 7
    ws.aircraft[target].risk.hours_since_maint = 310
    ws.aircraft[target].risk.days_since_inspection = 95
    after = solve(ws, SolveOptions(serviceability=predict_serviceability(ws), weather_impact=weather_impact(ws))).plan
    assert validate_plan(ws, after).ok
    assert [s.model_dump() for s in after.sorties] != [s.model_dump() for s in base.sorties]
    assert sum(s.aircraft_id == target for s in after.sorties) <= sum(s.aircraft_id == target for s in base.sorties)


def test_weather_impact_rises_near_minimums():
    ws = fuse()
    base = weather_impact(ws).get(("M01", "B1", "ARC"), 0.0)
    for h in range(7, 11):
        ws.weather.append(WeatherSegment(location_id="B1", start=h * 60, end=(h + 1) * 60, ceiling_ft=600, vis_km=8))
    assert weather_impact(ws)[("M01", "B1", "ARC")] > base

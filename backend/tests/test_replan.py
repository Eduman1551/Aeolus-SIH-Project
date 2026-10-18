import pytest
from app.fusion.schema import Window
from app.fusion.world import fuse
from app.solver.cpsat import SolveOptions, solve
from app.solver.replan import committed_sorties, replan
from app.solver.stability import match_sorties, stability_metrics
from app.validator import validate_plan


@pytest.fixture
def scenario():
    ws = fuse()
    plan = solve(ws).plan
    return ws, plan


def knock_out_busiest(ws, plan, start=360):
    counts = {}
    for s in plan.sorties:
        counts[s.aircraft_id] = counts.get(s.aircraft_id, 0) + 1
    aid = max(sorted(counts), key=lambda a: counts[a])
    ws.aircraft[aid].unavailable.append(Window(start=start, end=1440, reason="test outage"))
    ws.touch()
    return aid


def test_stability_metric_identity(scenario):
    _, plan = scenario
    m = stability_metrics(plan, plan)
    assert m["changed"] == 0 and m["stability_pct"] == 100.0


def test_stability_penalty_reduces_changes(scenario):
    ws, plan = scenario
    knock_out_busiest(ws, plan)
    loose = replan(ws, plan, now=360, base=SolveOptions(), stability_lambda=0)
    tight = replan(ws, plan, now=360, base=SolveOptions(), stability_lambda=400)
    assert validate_plan(ws, tight.plan).ok and validate_plan(ws, loose.plan).ok
    assert stability_metrics(plan, tight.plan)["changed"] <= stability_metrics(plan, loose.plan)["changed"]
    assert stability_metrics(plan, tight.plan)["stability_pct"] >= 70


def test_committed_sorties_are_locked(scenario):
    ws, plan = scenario
    now = 480  # 08:00, so the 07:30 and 08:00 take-offs are committed
    frozen = committed_sorties(ws, plan, now)
    assert frozen
    ws.aircraft[frozen[0].aircraft_id].unavailable.append(Window(start=now, end=1440, reason="lands u/s"))
    res = replan(ws, plan, now=now, base=SolveOptions(), stability_lambda=200)
    kept = {(s.mission_id, s.aircraft_id, s.crew_id, s.takeoff) for s in res.plan.sorties}
    assert all((s.mission_id, s.aircraft_id, s.crew_id, s.takeoff) in kept for s in frozen)
    # no new take-off is placed before now + freeze window
    new = [s for s in res.plan.sorties if (s.mission_id, s.aircraft_id, s.crew_id, s.takeoff)
           not in {(f.mission_id, f.aircraft_id, f.crew_id, f.takeoff) for f in frozen}]
    assert all(s.takeoff >= now + ws.rules.freeze_min for s in new)


def test_forbid_cut_gives_a_different_alternative(scenario):
    ws, plan = scenario
    knock_out_busiest(ws, plan)
    first = replan(ws, plan, now=360, base=SolveOptions(), stability_lambda=200).plan
    pairs = match_sorties(plan, first)
    added = [(p.new.mission_id, p.new.aircraft_id, p.new.crew_id) for p in pairs
             if p.kind != "same" and p.new is not None]
    dropped = [(p.old.mission_id, p.old.aircraft_id, p.old.crew_id) for p in pairs
               if p.kind != "same" and p.old is not None]
    second = replan(ws, plan, now=360, base=SolveOptions(forbid=[(added, dropped)]), stability_lambda=200).plan
    keys = lambda pl: {(s.mission_id, s.aircraft_id, s.crew_id) for s in pl.sorties}  # noqa: E731
    assert keys(second) != keys(first)
    assert validate_plan(ws, second).ok

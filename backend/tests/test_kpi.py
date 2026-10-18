from app.fusion.world import fuse
from app.kpi.tracker import KpiTracker, coverage, utilisation
from app.solver.cpsat import solve
from app.solver.greedy import greedy


def test_eight_kpis_from_real_runs():
    ws = fuse()
    res, g = solve(ws), greedy(ws)
    t = KpiTracker()
    t.record_initial(res.wall_ms, g.wall_ms)
    t.record_replan(120.0, "cache miss", 91.0)
    t.record_replan(15.0, "cache hit", 95.0)
    kpis = {k.id: k for k in t.compute(ws, res.plan, g.plan, 0, 0)}
    assert len(kpis) == 8
    assert kpis["planning_time"].value == round(res.wall_ms, 1)
    assert kpis["cache_hit_rate"].value == 50.0
    assert kpis["stability"].value == 95.0
    assert kpis["explanation_coverage"].value is None  # no changes recorded yet


def test_coverage_and_utilisation():
    ws = fuse()
    plan = solve(ws).plan
    got, total = coverage(ws, plan, (1,))
    assert got == total
    ua, uc = utilisation(ws, plan)
    assert 0 < ua <= 100 and 0 < uc <= 100
    assert utilisation(ws, None) == (0.0, 0.0)

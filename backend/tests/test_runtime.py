"""Stateless running: the scenario survives a save/load round trip, the clock and feed catch up
from wall time, and deferred work (cache, wording) runs on a later poll instead of a thread."""

import dataclasses

from app.config import settings
from app.planning.runtime import decode_state, encode_state
from app.planning.service import build_planner

S = dataclasses.replace(settings, database_url=None, groq_api_key=None)


def fresh_copy(p):
    """What a new serverless instance sees: a brand-new planner loaded from the saved bytes."""
    q = build_planner(S)
    q.deferred = p.deferred
    q.load_state(decode_state(encode_state(p.dump_state())))
    return q


def approved(deferred=True):
    p = build_planner(S)
    p.deferred = deferred
    prop = p.generate()
    p.approve(prop.id)
    return p


def test_round_trip_keeps_the_whole_scenario():
    p = approved()
    q = fresh_copy(p)
    assert q.status == "active" and q.active.id == p.active.id
    assert q.kpi.approvals == 1 and q.revs == p.revs
    a, b = p.status_view(), q.status_view()
    for key in ("status", "now", "active", "kpis", "events", "history"):
        assert a[key] == b[key], key


def test_state_from_another_build_starts_fresh():
    assert decode_state(b"") is None
    assert decode_state(b"not a pickle") is None


def test_clock_catches_up_from_wall_time():
    p = approved()
    p.sim_speed = 60.0  # 60 scenario minutes per real minute
    p.catch_up(1000.0)
    start = p.ws.now
    msgs = p.catch_up(1030.0)  # 30 real seconds later
    assert abs(p.ws.now - (start + 30)) < 1e-6
    assert msgs and 0 <= p.feed_due < 3  # feed batches due every 3 s were replayed (capped after long gaps)
    p.paused = True
    p.catch_up(1090.0)
    assert abs(p.ws.now - (start + 30)) < 1e-6


def test_clock_waits_for_the_first_publish():
    p = build_planner(S)
    p.catch_up(1000.0)
    p.catch_up(1600.0)
    assert p.ws.now == 360.0


def test_deferred_cache_builds_on_next_poll_and_survives_reload():
    p = approved(deferred=True)
    assert p.cache.status == "building" and p.cache_pending
    q = fresh_copy(p)
    assert q.run_deferred() is True
    assert q.cache.status == "ready" and q.cache.entries
    r = fresh_copy(q)
    sig, entry = next(iter(r.cache.entries.items()))
    out = r.inject([entry.event], "event")
    assert out["path"] == "cache hit"


def test_deferred_reword_does_not_start_threads(monkeypatch):
    import threading

    started = []
    monkeypatch.setattr(threading.Thread, "start", lambda self: started.append(self.name))
    p = build_planner(S)
    p.deferred = True
    prop = p.generate()
    assert p.reword_pending == prop.id and not started
    p.approve(prop.id)
    assert not started

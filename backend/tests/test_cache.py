"""Contingency cache: hit, miss, invalidation; fragility badges."""

import dataclasses
import time

import pytest
from app.config import settings
from app.events.types import EventIn
from app.planning.service import build_planner


def wait_ready(p, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        if p.cache.status == "ready":
            return
        time.sleep(0.05)
    raise AssertionError("cache never became ready")


@pytest.fixture
def planner():
    p = build_planner(dataclasses.replace(settings, database_url=None))
    prop = p.generate()
    p.approve(prop.id)
    wait_ready(p)
    return p


def test_cache_has_three_to_five_entries(planner):
    view = planner.cache_view()
    assert view["status"] == "ready"
    assert 3 <= len(view["entries"]) <= 5


def test_hit_is_served_from_cache_and_validated(planner):
    entry = next(iter(planner.cache.entries.values()))
    ev = EventIn(type=entry.event.type, params=dict(entry.event.params), origin="event panel")
    out = planner.inject([ev])
    assert out["path"] == "cache hit"
    prop = out["proposal"]
    assert prop.plan.source == "cache" and prop.validation.ok
    assert all(c.reason for c in prop.changes)


def test_miss_when_event_not_modelled(planner):
    out = planner.inject([EventIn(type="new_mission", params={"mission_type": "ISR", "zone_id": "Z1",
                                                              "priority": 3, "start": "21:00"})])
    assert out["path"] == "cache miss"


def test_cache_invalidated_when_world_changes(planner):
    entry = next(iter(planner.cache.entries.values()))
    planner.inject([EventIn(type="risk_update", params={"aircraft_id": "TV-401", "faults_30d": 6})])
    assert planner.cache_view()["status"] == "stale"
    ev = EventIn(type=entry.event.type, params=dict(entry.event.params))
    assert planner.inject([ev])["path"] == "cache miss"


def test_hit_faster_than_miss(planner):
    entry = next(iter(planner.cache.entries.values()))
    hit = planner.inject([EventIn(type=entry.event.type, params=dict(entry.event.params))])
    assert hit["path"] == "cache hit"
    miss = planner.inject([EventIn(type=entry.event.type, params=dict(entry.event.params))])  # world changed now
    assert miss["path"] == "cache miss"
    assert hit["proposal"].timing["total_ms"] < miss["proposal"].timing["total_ms"]


def test_fragility_badge_for_every_sortie(planner):
    frag = planner.active_fragility
    assert len(frag) == len(planner.active.sorties)
    assert {f["level"] for f in frag.values()} <= {"low", "medium", "high"}

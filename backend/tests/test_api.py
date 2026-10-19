"""API happy path: generate -> approve -> event -> diff -> reject -> approve -> end."""

import dataclasses

import app.main as main_mod
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    # keep tests off the real database
    monkeypatch.setattr(main_mod, "settings", dataclasses.replace(main_mod.settings, database_url=None, groq_api_key=None))
    with TestClient(main_mod.app) as c:
        yield c


def test_health_and_state(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["synthetic_data"]
    s = client.get("/api/state").json()
    assert len(s["aircraft"]) == 20 and s["synthetic"] is True


def test_happy_path(client):
    r = client.post("/api/plan/generate").json()
    assert r["status"] == "pending_approval"
    prop = r["proposal"]
    assert prop["publishable"] and prop["validation"]["ok"]
    assert r["baseline"] is not None

    r = client.post("/api/plan/approve", json={"plan_id": prop["id"]}).json()
    assert r["status"] == "active" and r["active"]["id"] == prop["id"]

    aid = r["active"]["sorties"][-1]["aircraft_id"]
    r = client.post("/api/events", json={"type": "aircraft_down", "params": {"aircraft_id": aid}})
    assert r.status_code == 200, r.text
    r = r.json()
    assert r["status"] == "pending_approval"
    p2 = r["proposal"]
    assert p2["validation"]["ok"]
    assert all(c["reason"] for c in p2["changes"])
    assert p2["timing"]["path"] in ("cache hit", "cache miss")

    r = client.post("/api/plan/reject", json={"plan_id": p2["id"], "note": "try another option"}).json()
    p3 = r["proposal"]
    assert p3["id"] != p2["id"] and p3["timing"]["path"] == "reject loop"

    r = client.post("/api/plan/approve", json={"plan_id": p3["id"]}).json()
    assert r["status"] == "active"

    kpis = {k["id"]: k for k in r["kpis"]}
    assert len(kpis) == 8
    assert kpis["violations"]["value"] == 0
    assert kpis["explanation_coverage"]["value"] == 100.0

    r = client.post("/api/plan/end").json()
    assert r["status"] == "ended" and r["ended"]["lines"]


def test_bad_event_is_a_400(client):
    r = client.post("/api/events", json={"type": "aircraft_down", "params": {"aircraft_id": "NOPE-1"}})
    assert r.status_code == 400 and "unknown aircraft" in r.json()["detail"]


def test_approve_without_proposal_is_a_400(client):
    assert client.post("/api/plan/approve", json={"plan_id": "x"}).status_code == 400


def test_websocket_hello(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "hello"


def test_map_layers(client):
    m = client.get("/api/map").json()
    assert {b["id"] for b in m["bases"]} == {"B1", "B2"} and len(m["zones"]) == 6
    assert m["threats"] and m["restrictions"] and m["weather_cells"]
    assert all("wing" in b for b in m["bases"])


def test_clock_speed_and_activity_log(client):
    r = client.post("/api/clock", json={"speed": 60}).json()
    assert r["speed"] == 60
    assert client.post("/api/clock", json={"speed": 7}).status_code == 400
    st = client.post("/api/plan/generate").json()
    client.post("/api/plan/approve", json={"plan_id": st["proposal"]["id"]})
    acts = client.get("/api/plan").json()["activity"]
    actions = [a["action"] for a in acts]
    assert any(a.startswith("approved plan") for a in actions)
    assert any(a.startswith("published") for a in actions)
    assert all(a["actor"] and a["clock"] for a in acts)


def test_aircraft_have_callsigns(client):
    s = client.get("/api/state").json()
    assert all(a["callsign"] for a in s["aircraft"])

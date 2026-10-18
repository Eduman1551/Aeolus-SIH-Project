"""Offline chat parser (always available) and the LLM fallback behaviour."""

import pytest
from app.events.types import normalise
from app.fusion.world import fuse
from app.llm.client import LLM
from app.llm.offline import parse_offline


def types(text):
    evs, _ = parse_offline(text)
    return [(e.type, e.params) for e in evs]


def test_demo_sentence():
    got = types("Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00")
    assert got[0] == ("weather_closure", {"location_id": "B2", "start": "14:00", "end": "18:00"})
    assert got[1] == ("new_mission", {"mission_type": "STRIKE", "zone_id": "Z3", "priority": 1, "start": "16:00"})


@pytest.mark.parametrize("text,etype,expect", [
    ("AR-104 down until 18:00", "aircraft_down", {"aircraft_id": "AR-104", "until": "18:00"}),
    ("don't use sk205", "aircraft_down", {"aircraft_id": "SK-205"}),
    ("crew C-07 sick", "crew_unavailable", {"crew_id": "C-07"}),
    ("zone 4 restricted 10:00-12:00", "zone_restriction", {"zone_id": "Z4", "start": "10:00", "end": "12:00"}),
    ("fog at Z2 between 13 and 15", "weather_closure", {"location_id": "Z2", "start": "13:00", "end": "15:00"}),
    ("threat level 3 in Z5", "threat_zone", {"zone_id": "Z5", "level": 3}),
    ("cancel M14", "cancel_mission", {"mission_id": "M14"}),
    ("raise M11 to P2", "set_priority", {"mission_id": "M11", "priority": 2}),
    ("SK-205 has 5 faults", "risk_update", {"aircraft_id": "SK-205", "faults_30d": 5}),
    ("need a P2 recce of zone 1 at 1500 for 2 hours", "new_mission",
     {"mission_type": "ISR", "zone_id": "Z1", "priority": 2, "start": "15:00", "duration_min": 120}),
])
def test_single_conditions(text, etype, expect):
    got = types(text)
    assert got == [(etype, expect)]


def test_unparseable_text_returns_leftovers():
    evs, left = parse_offline("make it better please")
    assert evs == [] and left == ["make it better please"]


def test_parsed_conditions_normalise_against_world():
    ws = fuse()
    evs, _ = parse_offline("Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00")
    norm = [normalise(e, ws) for e in evs]
    assert norm[0].params["start"] == 840 and norm[1].params["aircraft"] == 2


def test_llm_without_key_uses_offline_parser():
    llm = LLM(api_key=None, model=None)
    evs, parser = llm.parse("cancel M14", fuse())
    assert parser == "offline parser" and evs[0].type == "cancel_mission"
    assert llm.reword("summary", []) is None
    assert llm.status()["mode"] == "offline parser"


def test_llm_failure_falls_back(monkeypatch):
    llm = LLM(api_key="test-key", model="test-model")

    def boom(*a, **k):
        raise ConnectionError("offline")

    monkeypatch.setattr(llm, "_chat", boom)
    evs, parser = llm.parse("cancel M14", fuse())
    assert "offline parser" in parser and evs[0].type == "cancel_mission"


def test_reword_rejects_invented_numbers(monkeypatch):
    llm = LLM(api_key="test-key", model="test-model")
    monkeypatch.setattr(llm, "_chat", lambda *a, **k: "Seven of 99 sorties changed.")
    assert llm.reword("2 of 23 sorties changed.", []) is None
    monkeypatch.setattr(llm, "_chat", lambda *a, **k: "Only 2 of the 23 sorties had to change.")
    assert llm.reword("2 of 23 sorties changed.", []) == "Only 2 of the 23 sorties had to change."

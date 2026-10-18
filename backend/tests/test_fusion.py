from app.fusion.feed import FeedSimulator
from app.fusion.world import fuse


def test_fusion_merges_all_sources_with_tags():
    ws = fuse()
    assert len(ws.aircraft) == 20 and len(ws.crews) == 30 and len(ws.missions) == 15
    assert ws.fusion_issues == []
    assert ws.aircraft["AR-101"].meta.source == "fleet management system"
    assert ws.crews["C-01"].meta.source == "crew rostering system"
    assert ws.weather[0].meta.source == "met office"
    assert len(ws.sources) == 8


def test_fusion_reports_broken_references():
    ws = fuse()
    ws.aircraft["AR-101"].type_id = "XXX"
    from app.fusion.world import check_references

    assert any("AR-101" in i for i in check_references(ws))


def test_feed_updates_live_fields_but_not_fingerprint():
    ws = fuse()
    before = ws.fingerprint()
    feed = FeedSimulator(seed=1)
    msgs = []
    for _ in range(30):
        ws.now += 5
        msgs += feed.tick(ws)
    assert msgs and len(ws.feed_log) == len(msgs)
    assert any(c.checked_in for c in ws.crews.values())
    assert ws.fingerprint() == before


def test_clone_is_independent():
    ws = fuse()
    other = ws.clone()
    other.aircraft["AR-101"].status = "unserviceable"
    assert ws.aircraft["AR-101"].status == "serviceable"
    assert other.fingerprint() != ws.fingerprint()

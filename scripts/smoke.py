"""Headless run of the demo scenario through the Aeolus API.

Runs the app in-process (no server needed), walks the DEMO.md story, asserts that no plan
ever has a hard-constraint violation, and prints the KPI table used in the README.

Usage:  pnpm smoke                 (offline chat parser, writes to the database if DATABASE_URL is set)
        pnpm smoke -- --llm        (use the Groq LLM for the chat step)
        pnpm smoke -- --no-db      (skip the database)
        STATE_BACKEND=db pnpm smoke  (keep the scenario in PostgreSQL, as on Vercel)
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app.main as main_mod  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def step(n: int, text: str) -> None:
    print(f"\n[{n}] {text}")


def check(cond: bool, msg: str) -> None:
    if not cond:
        print(f"    FAIL: {msg}")
        raise SystemExit(1)


def proposal_ok(state: dict, what: str) -> dict:
    prop = state["proposal"]
    check(prop is not None, f"{what}: no proposal")
    v = len(prop["validation"]["violations"])
    check(v == 0, f"{what}: {v} violations")
    check(all(c["reason"].strip() for c in prop["changes"]), f"{what}: change without a reason")
    t = prop["timing"]
    st = prop["stability"]
    print(f"    {prop['id']}: {t['path']}, {t['total_ms']:.1f} ms, {st['changed']} of {st['total']} changed, "
          f"{st['added']} added, {len(prop['plan']['unassigned'])} unassigned, 0 violations")
    return prop


def wait_cache(c: TestClient, timeout: float = 30.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        c.get("/api/live")  # on serverless the cache is built by the next live poll
        s = c.get("/api/plan").json()
        if s["cache"]["status"] == "ready":
            return s
        time.sleep(0.1)
    raise SystemExit("contingency cache never became ready")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--llm", action="store_true", help="use the Groq LLM for the chat step")
    ap.add_argument("--no-db", action="store_true", help="do not write to PostgreSQL")
    ap.add_argument("--json", type=Path, help="also write the KPI results to this JSON file")
    args = ap.parse_args()

    s = main_mod.settings
    s = dataclasses.replace(s, groq_api_key=s.groq_api_key if args.llm else None,
                            database_url=None if args.no_db else s.database_url)
    main_mod.settings = s

    with TestClient(main_mod.app) as c:
        step(1, "Load and fuse the synthetic data")
        c.post("/api/scenario/reset")
        w = c.get("/api/state").json()
        print(f"    {len(w['aircraft'])} aircraft, {len(w['crews'])} crews, {len(w['missions'])} missions, "
              f"{len(w['sources'])} sources fused, {len(w['fusion_issues'])} fusion issues (seed {w['seed']})")
        check(not w["fusion_issues"], "fusion issues")

        step(2, "Generate the initial plan (CP-SAT) and the greedy baseline")
        st = c.post("/api/plan/generate").json()
        prop = proposal_ok(st, "initial plan")
        base = st["baseline"]
        a_cov = len({x["mission_id"] for x in prop["plan"]["sorties"]})
        g_cov = len({x["mission_id"] for x in base["sorties"]})
        print(f"    Aeolus covers {a_cov} missions in {prop['plan']['solve_ms']:.1f} ms; "
              f"greedy covers {g_cov} in {base['solve_ms']:.1f} ms")
        st = c.post("/api/plan/approve", json={"plan_id": prop["id"]}).json()
        check(st["status"] == "active", "approve failed")

        step(3, "Aircraft down (prepared contingency, expect a cache hit)")
        st = wait_cache(c)
        entries = st["cache"]["entries"]
        down = next(e for e in entries if e["event"]["type"] == "aircraft_down")
        r = c.post("/api/events", json={"type": "aircraft_down", "params": down["event"]["params"]}).json()
        check(r["path"] == "cache hit", f"expected cache hit, got {r['path']}")
        prop = proposal_ok(r, "aircraft down")
        c.post("/api/plan/approve", json={"plan_id": prop["id"]})

        step(4, "Weather closure from the forecast (prepared contingency, expect a cache hit)")
        st = wait_cache(c)
        wx = next((e for e in st["cache"]["entries"] if e["event"]["type"] == "weather_closure"), None)
        if wx:
            r = c.post("/api/events", json={"type": "weather_closure", "params": wx["event"]["params"]}).json()
            check(r["path"] == "cache hit", f"expected cache hit, got {r['path']}")
            prop = proposal_ok(r, "weather closure")
            c.post("/api/plan/approve", json={"plan_id": prop["id"]})
        else:
            print("    no weather contingency prepared for this plan, skipped")

        step(5, "Chat: 'Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00' (expect a cache miss)")
        wait_cache(c)
        text = "Base 2 closed 14:00 to 18:00, add P1 strike on Z3 at 16:00"
        parsed = c.post("/api/chat/parse", json={"text": text}).json()
        print(f"    parser: {parsed['parser']}; conditions: " + "; ".join(x["description"] for x in parsed["conditions"]))
        check(len(parsed["conditions"]) == 2, "chat parser did not find both conditions")
        r = c.post("/api/chat/apply", json={"conditions": parsed["conditions"], "text": text}).json()
        check(r["path"] in ("cache miss", "cache stale"), f"expected a miss, got {r['path']}")
        prop = proposal_ok(r, "chat conditions")
        new_p1 = [m for m in c.get("/api/state").json()["missions"] if m["origin"] == "planner chat"]
        check(any(x["mission_id"] == new_p1[0]["id"] for x in prop["plan"]["sorties"]), "new P1 strike not covered")
        print(f"    new P1 strike {new_p1[0]['id']} is covered")

        step(6, "Reject once (loop back to the solver), then approve")
        r = c.post("/api/plan/reject", json={"plan_id": prop["id"], "note": "try another option"}).json()
        prop2 = proposal_ok(r, "after reject")
        check(prop2["id"] != prop["id"], "reject did not produce a new plan")
        st = c.post("/api/plan/approve", json={"plan_id": prop2["id"]}).json()
        check(st["status"] == "active", "approve after reject failed")
        check(st["active_validation"]["ok"], "active plan has violations")

        step(7, "Threat raised on a zone (prepared contingency)")
        st = wait_cache(c)
        th = next((e for e in st["cache"]["entries"] if e["event"]["type"] == "threat_zone"), None)
        if th:
            r = c.post("/api/events", json={"type": "threat_zone", "params": th["event"]["params"]}).json()
            prop = proposal_ok(r, "threat")
            c.post("/api/plan/approve", json={"plan_id": prop["id"]})

        step(8, "End the plan and log the KPI snapshot")
        r = c.post("/api/plan/end").json()
        check(r["status"] == "ended", "end plan failed")
        kpis = r["ended"]["kpis"]
        store = getattr(main_mod.app.state.runtime, "store", None)
        if store is not None:
            store.flush()
        db = c.get("/api/health").json()["db"]
        print(f"    KPI snapshot {'saved to PostgreSQL' if db['online'] else 'kept in memory (database offline)'}")

        print("\n| # | KPI | Measured | Detail | Suggested target |")
        print("|---|---|---|---|---|")
        for i, k in enumerate(kpis, 1):
            print(f"| {i} | {k['label']} | {k['display']} | {k['detail']} | {k['target']} |")
        hist = r["kpi_history"]
        hits = [x["ms"] for x in hist["replans"] if x["path"] == "cache hit"]
        misses = [x["ms"] for x in hist["replans"] if x["path"] != "cache hit"]
        print(f"\nReplans: {len(hist['replans'])} ({len(hits)} cache hits avg "
              f"{sum(hits) / max(1, len(hits)):.1f} ms, {len(misses)} misses avg {sum(misses) / max(1, len(misses)):.1f} ms)")
        print(f"Initial solve {hist['initial_solve_ms']:.1f} ms vs greedy {hist['greedy_ms']:.1f} ms; "
              f"manual baseline {hist['manual_baseline_min']} min (assumed)")
        if args.json:
            args.json.write_text(json.dumps({"kpis": kpis, "history": hist}, indent=2), encoding="utf-8")
        print("\nSMOKE OK: 0 violations on every plan")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

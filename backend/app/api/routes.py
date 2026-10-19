"""REST routes. Handlers are plain `def` so solver work runs in FastAPI's thread pool.

Every handler works inside a runtime session (see app/planning/runtime.py): "read" for views,
"write" for anything that changes the scenario, "poll" for the live endpoint.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.events.types import EventError, EventIn, describe, normalise
from app.fusion.theatre import map_layers
from app.fusion.world import fmt_min
from app.planning.orchestrator import PlannerError
from app.predict.model import model_info
from app.predict.weather import mission_weather_notes

router = APIRouter()


def session(req: Request, mode: str = "read"):
    return req.app.state.get_runtime().session(mode)


def live_view(p) -> dict[str, Any]:
    ws = p.ws
    return {
        "observations": ws.observations,
        "telemetry": {a.id: a.telemetry.model_dump() for a in ws.aircraft.values()},
        "checked_in": [c.id for c in ws.crews.values() if c.checked_in],
        "updated": {a.id: a.meta.updated_at for a in ws.aircraft.values() if a.meta},
    }


class PlanAction(BaseModel):
    plan_id: str = ""


class RejectBody(BaseModel):
    plan_id: str = ""
    note: str = ""


class ChatText(BaseModel):
    text: str


class ChatApply(BaseModel):
    conditions: list[EventIn]
    text: str | None = None


class ClockBody(BaseModel):
    action: str | None = Field(default=None, pattern="^(pause|resume)$")
    speed: int | None = Field(default=None, description="scenario minutes per real minute: 1, 10 or 60")


class SettingsBody(BaseModel):
    stability_lambda: int = Field(ge=0, le=5000)


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (PlannerError, EventError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/health")
def health(req: Request) -> dict[str, Any]:
    rt = req.app.state.get_runtime()
    llm = getattr(getattr(rt, "template", None) or getattr(rt, "planner", None), "llm", None)
    return {
        "ok": True,
        "db": rt.db_status(),
        "state": rt.kind,
        "llm": llm.status() if llm else {"configured": False, "mode": "offline parser"},
        "synthetic_data": True,
    }


@router.get("/api/live")
def live(req: Request, feed_since: int = 0, plan_rev: int = -1) -> dict[str, Any]:
    """Polled every ~2 s by the dashboard instead of a WebSocket. Returns the clock, feed messages
    newer than `feed_since`, the plan view when it changed since `plan_rev`, and the revisions
    (the client refetches /api/state when the world revision moves)."""
    with session(req, "poll") as p:
        new = [m for m in p.ws.feed_log if m["id"] > feed_since][:30] if feed_since else []
        return {
            "clock": {"now": p.ws.now, "clock": fmt_min(p.ws.now), "paused": p.paused, "status": p.status,
                      "speed": p.sim_speed},
            "revs": dict(p.revs),
            "last_feed_id": p.feed.last_id,
            "feed": {"messages": new[::-1], "live": live_view(p)} if new else None,
            "plan": p.status_view() if p.revs["plan"] != plan_rev else None,
            "cache": p.cache_view(),
        }


@router.get("/api/state")
def state(req: Request) -> dict[str, Any]:
    with session(req) as p:
        snap = p.ws.snapshot()
        svc, wx = p.risk_inputs(p.ws)
        snap["serviceability"] = svc
        snap["weather_impact"] = mission_weather_notes(p.ws, wx)
        snap["model"] = model_info()
        snap["feed"] = list(p.ws.feed_log)[:60]
        return snap


@router.get("/api/plan")
def plan_status(req: Request) -> dict[str, Any]:
    with session(req) as p:
        return p.status_view()


@router.post("/api/plan/generate")
def generate(req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        _guard(p.generate)
        return p.status_view()


@router.post("/api/plan/approve")
def approve(body: PlanAction, req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        _guard(p.approve, body.plan_id)
        return p.status_view()


@router.post("/api/plan/reject")
def reject(body: RejectBody, req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        _guard(p.reject, body.plan_id, body.note)
        return p.status_view()


@router.post("/api/plan/end")
def end_plan(req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        ended = _guard(p.end_plan)
        return {"ended": ended, **p.status_view()}


@router.post("/api/events")
def inject_event(body: EventIn, req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        out = _guard(p.inject, [body], "event")
        return {"path": out["path"], "total_ms": out["total_ms"], "events": out["events"], **p.status_view()}


@router.post("/api/chat/parse")
def chat_parse(body: ChatText, req: Request) -> dict[str, Any]:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Type a condition first.")
    with session(req, "write") as p:
        conditions, parser = p.parse_note(text)
        items, problems = [], []
        for c in conditions:
            try:
                n = normalise(c, p.ws)
                items.append({"type": n.type, "params": n.params, "description": describe(n, p.ws)})
            except EventError as exc:
                problems.append(f"{c.type}: {exc}")
        if p.store:
            p.store.save_chat(text, parser, items)
    return {"conditions": items, "parser": parser, "problems": problems,
            "understood": bool(items),
            "message": None if items else "I could not turn that into a planning condition. Try for example: "
                                          "'Base 2 closed 14:00 to 18:00' or 'add P1 strike on Z3 at 16:00'."}


@router.post("/api/chat/apply")
def chat_apply(body: ChatApply, req: Request) -> dict[str, Any]:
    if not body.conditions:
        raise HTTPException(status_code=400, detail="No conditions to apply.")
    events = [EventIn(type=c.type, params=c.params, origin="planner chat") for c in body.conditions]
    with session(req, "write") as p:
        out = _guard(p.inject, events, "conditions", body.text)
        return {"path": out["path"], "total_ms": out["total_ms"], "events": out["events"], **p.status_view()}


@router.post("/api/clock")
def clock(body: ClockBody, req: Request) -> dict[str, Any]:
    if body.speed is not None and body.speed not in (1, 10, 60):
        raise HTTPException(status_code=400, detail="speed must be 1, 10 or 60")
    with session(req, "write") as p:
        if body.action is not None:
            p.paused = body.action == "pause"
        if body.speed is not None:
            p.sim_speed = float(body.speed)
        return {"paused": p.paused, "speed": p.sim_speed, "now": p.ws.now}


@router.get("/api/map")
def map_data(req: Request) -> dict[str, Any]:
    with session(req) as p:
        return map_layers(p.ws)


@router.post("/api/settings")
def update_settings(body: SettingsBody, req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        p.stability_lambda = body.stability_lambda
        return {"stability_lambda": p.stability_lambda}


@router.post("/api/scenario/reset")
def reset(req: Request) -> dict[str, Any]:
    with session(req, "write") as p:
        p.reset()
        p.log("Planner", "reset the scenario", "synthetic data reloaded", kind="planner")
        p.notify("world")
        p.notify("plan")
        return p.status_view()


@router.get("/api/kpis/history")
def kpi_history(req: Request) -> dict[str, Any]:
    with session(req) as p:
        store = p.store
    return {"snapshots": store.recent_kpi_snapshots(5) if store else []}

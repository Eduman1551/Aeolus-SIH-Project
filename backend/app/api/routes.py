"""REST routes. Handlers are plain `def` so solver work runs in FastAPI's thread pool."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.events.types import EventError, EventIn, describe, normalise
from app.fusion.theatre import map_layers
from app.planning.orchestrator import Planner, PlannerError
from app.predict.model import model_info
from app.predict.weather import mission_weather_notes

router = APIRouter()


def planner(req: Request) -> Planner:
    return req.app.state.planner


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
    p = planner(req)
    store = req.app.state.store
    llm = getattr(p, "llm", None)
    return {
        "ok": True,
        "db": {"configured": bool(store.url), "online": store.online, "error": None if store.online else store.last_error},
        "llm": llm.status() if llm else {"configured": False, "mode": "offline parser"},
        "synthetic_data": True,
    }


@router.get("/api/state")
def state(req: Request) -> dict[str, Any]:
    p = planner(req)
    with p.lock:
        snap = p.ws.snapshot()
        svc, wx = p.risk_inputs(p.ws)
        snap["serviceability"] = svc
        snap["weather_impact"] = mission_weather_notes(p.ws, wx)
        snap["model"] = model_info()
        snap["feed"] = list(p.ws.feed_log)[:60]
        return snap


@router.get("/api/plan")
def plan_status(req: Request) -> dict[str, Any]:
    return planner(req).status_view()


@router.post("/api/plan/generate")
def generate(req: Request) -> dict[str, Any]:
    p = planner(req)
    _guard(p.generate)
    return p.status_view()


@router.post("/api/plan/approve")
def approve(body: PlanAction, req: Request) -> dict[str, Any]:
    p = planner(req)
    _guard(p.approve, body.plan_id)
    return p.status_view()


@router.post("/api/plan/reject")
def reject(body: RejectBody, req: Request) -> dict[str, Any]:
    p = planner(req)
    _guard(p.reject, body.plan_id, body.note)
    return p.status_view()


@router.post("/api/plan/end")
def end_plan(req: Request) -> dict[str, Any]:
    p = planner(req)
    ended = _guard(p.end_plan)
    return {"ended": ended, **p.status_view()}


@router.post("/api/events")
def inject_event(body: EventIn, req: Request) -> dict[str, Any]:
    p = planner(req)
    out = _guard(p.inject, [body], "event")
    return {"path": out["path"], "total_ms": out["total_ms"], "events": out["events"], **p.status_view()}


@router.post("/api/chat/parse")
def chat_parse(body: ChatText, req: Request) -> dict[str, Any]:
    p = planner(req)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Type a condition first.")
    conditions, parser = p.parse_note(text)
    items, problems = [], []
    with p.lock:
        for c in conditions:
            try:
                n = normalise(c, p.ws)
                items.append({"type": n.type, "params": n.params, "description": describe(n, p.ws)})
            except EventError as exc:
                problems.append(f"{c.type}: {exc}")
    if req.app.state.store:
        req.app.state.store.save_chat(text, parser, items)
    return {"conditions": items, "parser": parser, "problems": problems,
            "understood": bool(items),
            "message": None if items else "I could not turn that into a planning condition. Try for example: "
                                          "'Base 2 closed 14:00 to 18:00' or 'add P1 strike on Z3 at 16:00'."}


@router.post("/api/chat/apply")
def chat_apply(body: ChatApply, req: Request) -> dict[str, Any]:
    p = planner(req)
    if not body.conditions:
        raise HTTPException(status_code=400, detail="No conditions to apply.")
    events = [EventIn(type=c.type, params=c.params, origin="planner chat") for c in body.conditions]
    out = _guard(p.inject, events, "conditions", body.text)
    return {"path": out["path"], "total_ms": out["total_ms"], "events": out["events"], **p.status_view()}


@router.post("/api/clock")
def clock(body: ClockBody, req: Request) -> dict[str, Any]:
    p = planner(req)
    if body.speed is not None and body.speed not in (1, 10, 60):
        raise HTTPException(status_code=400, detail="speed must be 1, 10 or 60")
    with p.lock:
        if body.action is not None:
            p.paused = body.action == "pause"
        if body.speed is not None:
            p.sim_speed = float(body.speed)
    return {"paused": p.paused, "speed": p.sim_speed, "now": p.ws.now}


@router.get("/api/map")
def map_data(req: Request) -> dict[str, Any]:
    p = planner(req)
    with p.lock:
        return map_layers(p.ws)


@router.post("/api/settings")
def update_settings(body: SettingsBody, req: Request) -> dict[str, Any]:
    p = planner(req)
    with p.lock:
        p.stability_lambda = body.stability_lambda
    return {"stability_lambda": p.stability_lambda}


@router.post("/api/scenario/reset")
def reset(req: Request) -> dict[str, Any]:
    p = planner(req)
    p.reset()
    p.log("Planner", "reset the scenario", "synthetic data reloaded", kind="planner")
    req.app.state.hub.notify("world")
    req.app.state.hub.notify("plan")
    return p.status_view()


@router.get("/api/kpis/history")
def kpi_history(req: Request) -> dict[str, Any]:
    return {"snapshots": req.app.state.store.recent_kpi_snapshots(5)}


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    hub = ws.app.state.hub
    await hub.connect(ws)
    p: Planner = ws.app.state.planner
    await ws.send_json({"type": "hello", "clock": p.ws.now, "status": p.status})
    try:
        while True:
            await ws.receive_text()  # keepalive pings from the client
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:  # noqa: BLE001
        hub.disconnect(ws)

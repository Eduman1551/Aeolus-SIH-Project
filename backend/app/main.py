"""Aeolus API: FastAPI app, background scenario clock and live feed."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from db.store import Store
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.hub import Hub
from app.api.routes import router
from app.config import settings
from app.fusion.world import fmt_min
from app.planning.service import build_planner

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("aeolus")

FEED_EVERY_S = 3


async def clock_loop(app: FastAPI) -> None:
    planner, hub = app.state.planner, app.state.hub
    tick = 0
    while True:
        await asyncio.sleep(1.0)
        tick += 1
        try:
            planner.advance_clock(1.0)
            await hub.send({"type": "clock", "now": planner.ws.now, "clock": fmt_min(planner.ws.now),
                            "paused": planner.paused, "status": planner.status,
                            "speed": planner.sim_speed})
            if tick % FEED_EVERY_S == 0:
                msgs = planner.feed_tick()
                if msgs:
                    await hub.send({"type": "feed", "messages": msgs, "live": live_view(planner)})
        except Exception as exc:  # noqa: BLE001
            log.warning("clock loop: %s", exc)


def live_view(planner) -> dict:
    ws = planner.ws
    return {
        "observations": ws.observations,
        "telemetry": {a.id: a.telemetry.model_dump() for a in ws.aircraft.values()},
        "checked_in": [c.id for c in ws.crews.values() if c.checked_in],
        "updated": {a.id: a.meta.updated_at for a in ws.aircraft.values() if a.meta},
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = Store(settings.database_url)
    store.start()
    hub = Hub()
    hub.loop = asyncio.get_running_loop()
    planner = build_planner(settings, store, hub.notify)
    hub.payloads = {"plan": lambda: {"plan": planner.status_view()},
                    "world": lambda: {"version": planner.ws.version},
                    "cache": lambda: {"cache": planner.cache_view() if hasattr(planner, "cache_view") else {}}}
    app.state.store, app.state.hub, app.state.planner = store, hub, planner
    task = asyncio.create_task(clock_loop(app))
    log.info("Aeolus API ready (synthetic data). DB configured: %s", bool(settings.database_url))
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    store.stop()


app = FastAPI(title="Aeolus API", version="1.0.0", lifespan=lifespan,
              description="Decision support for air-operations planning. Synthetic data only.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

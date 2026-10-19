"""Aeolus API: FastAPI app.

There is no background loop: the scenario clock and simulated feed catch up from wall time on
every request, and dashboards poll GET /api/live. That way the same code runs as one long-lived
server (local, scenario kept in memory) or as stateless serverless functions on Vercel
(scenario saved in PostgreSQL), see app/planning/runtime.py.
"""

from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.planning.runtime import make_runtime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("aeolus")

_lock = threading.Lock()


def get_runtime():
    """Created on first use, so it also works where the ASGI lifespan never runs."""
    if getattr(app.state, "runtime", None) is None:
        with _lock:
            if getattr(app.state, "runtime", None) is None:
                app.state.runtime = make_runtime(settings)
                log.info("Aeolus API ready (synthetic data). Scenario kept in %s.", app.state.runtime.kind)
    return app.state.runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_runtime()
    yield
    rt = getattr(app.state, "runtime", None)
    if rt is not None:
        rt.close()
        app.state.runtime = None


app = FastAPI(title="Aeolus API", version="1.0.0", lifespan=lifespan,
              description="Decision support for air-operations planning. Synthetic data only.")
app.state.runtime = None
app.state.get_runtime = get_runtime
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=settings.cors_origin_regex,  # e.g. Vercel preview URLs
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

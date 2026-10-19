"""Where the scenario lives between requests.

MemoryRuntime: one long-running server (local `pnpm dev`, or a single-instance host). One planner
object stays in memory; history writes go through the store's background thread.

DbRuntime: serverless (Vercel). Any request may land on a fresh instance, so nothing important
lives in a Python global. Each request loads the whole scenario from PostgreSQL, works on its
own copy and, if it changed anything, saves it back in the same transaction as its history rows.
There are no background threads: the clock and feed catch up from wall time on every request,
and slow follow-up work (contingency cache, summary wording) runs on the next live poll.

Request modes:
  read   load, catch up the clock, never save
  write  lock the scenario row (one writer at a time), save afterwards
  poll   save only if it can take the lock without waiting and something changed
"""

from __future__ import annotations

import copy
import logging
import os
import pickle
import threading
import time
import zlib
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Literal

from db.store import Store, connect, init_schema

from app.config import Settings
from app.planning.service import AeolusPlanner, build_planner

log = logging.getLogger("aeolus.runtime")

Mode = Literal["read", "write", "poll"]
ROW_ID = 1
# A new deploy may change the saved classes, so state saved by another build starts fresh.
STATE_VERSION = f"1:{os.environ.get('VERCEL_GIT_COMMIT_SHA', 'local')[:12]}"


class MemoryRuntime:
    kind = "memory"

    def __init__(self, settings: Settings) -> None:
        self.store = Store(settings.database_url)
        self.store.start()
        self.planner = build_planner(settings, self.store)

    @contextmanager
    def session(self, mode: Mode = "read") -> Iterator[AeolusPlanner]:
        p = self.planner
        with p.lock:
            p.catch_up(time.time())
            if mode == "poll":
                p.run_deferred()
            yield p

    def db_status(self) -> dict:
        return {"configured": bool(self.store.url), "online": self.store.online,
                "error": None if self.store.online else self.store.last_error}

    def close(self) -> None:
        self.store.stop()


def encode_state(state: dict) -> bytes:
    return zlib.compress(pickle.dumps({"v": STATE_VERSION, "state": state}, protocol=pickle.HIGHEST_PROTOCOL), 6)


def decode_state(blob: bytes | None) -> dict | None:
    """The saved scenario, or None if there is none or it came from another build."""
    if not blob:
        return None
    try:
        data = pickle.loads(zlib.decompress(blob))  # noqa: S301 - only this app writes the row
    except Exception as exc:  # noqa: BLE001
        log.warning("saved scenario unreadable, starting fresh: %s", exc)
        return None
    return data["state"] if data.get("v") == STATE_VERSION else None


class DbRuntime:
    kind = "database"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.url = settings.database_url
        init_schema(self.url)
        self.template = build_planner(settings, None)  # holds the shared, stateless parts (settings, LLM client)
        self.local = threading.local()
        self.online, self.last_error = True, None

    # ---------- connections (one per worker thread, reused across requests) ----------

    def _conn(self):
        conn = getattr(self.local, "conn", None)
        if conn is None or conn.closed or conn.broken:
            # autocommit, so each `with conn.transaction()` below is a real BEGIN ... COMMIT
            conn = self.local.conn = connect(self.url, autocommit=True)
        return conn

    def _planner(self, state: dict | None) -> AeolusPlanner:
        p = copy.copy(self.template)
        p.lock = threading.RLock()
        p.store = Store(self.url, deferred=True)
        p.deferred = True
        p.on_notify = None
        p.revs = {"plan": 0, "world": 0, "cache": 0}
        if state is None:
            p.reset()
        else:
            p.load_state(state)
        return p

    def _load(self, conn, mode: Mode) -> tuple[dict | None, bool]:
        """(saved state, whether this request holds the row lock)."""
        if mode == "write":
            conn.execute("INSERT INTO scenario_state (id, data) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                         (ROW_ID, b""))
            row = conn.execute("SELECT data FROM scenario_state WHERE id = %s FOR UPDATE", (ROW_ID,)).fetchone()
            return decode_state(row[0]), True
        if mode == "poll":
            row = conn.execute("SELECT data FROM scenario_state WHERE id = %s FOR UPDATE SKIP LOCKED",
                               (ROW_ID,)).fetchone()
            if row is not None:
                return decode_state(row[0]), True
        row = conn.execute("SELECT data FROM scenario_state WHERE id = %s", (ROW_ID,)).fetchone()
        return decode_state(row[0] if row else None), False

    @contextmanager
    def session(self, mode: Mode = "read") -> Iterator[AeolusPlanner]:
        try:
            conn = self._conn()
            conn.execute("SELECT 1")
        except Exception:  # noqa: BLE001 - stale pooled connection, try once more
            self.local.conn = None
            conn = self._conn()
        try:
            with conn.transaction():
                state, locked = self._load(conn, mode)
                p = self._planner(state)
                fresh = state is None
                before = (p.status, p.revs.copy())
                msgs = p.catch_up(time.time(), feed=locked)
                did = p.run_deferred() if mode == "poll" and locked else False
                yield p
                changed = mode == "write" or fresh or bool(msgs) or did or (p.status, p.revs) != before
                if locked and changed:
                    p.store.write_pending(conn)
                    conn.execute("UPDATE scenario_state SET data = %s, rev = rev + 1, updated_at = now() WHERE id = %s",
                                 (encode_state(p.dump_state()), ROW_ID))
            self.online, self.last_error = True, None
        except Exception as exc:
            if _is_db_error(exc):
                self.online, self.last_error = False, f"{type(exc).__name__}: {exc}"[:200]
                self.local.conn = None
            raise

    def db_status(self) -> dict:
        return {"configured": True, "online": self.online, "error": self.last_error}

    def close(self) -> None:
        conn = getattr(self.local, "conn", None)
        if conn is not None:
            conn.close()


def _is_db_error(exc: Exception) -> bool:
    import psycopg

    return isinstance(exc, psycopg.Error)


def make_runtime(settings: Settings) -> MemoryRuntime | DbRuntime:
    """STATE_BACKEND=db|memory; default: db on Vercel (when DATABASE_URL is set), memory elsewhere."""
    backend = os.environ.get("STATE_BACKEND") or ("db" if os.environ.get("VERCEL") else "memory")
    if backend == "db" and settings.database_url:
        try:
            return DbRuntime(settings)
        except Exception as exc:  # noqa: BLE001
            log.warning("database state unavailable, keeping the scenario in memory: %s", exc)
    return MemoryRuntime(settings)

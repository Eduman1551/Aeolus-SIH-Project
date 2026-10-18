"""Small psycopg (v3) data-access layer, plain SQL.

Writes go through one background thread so a slow or unreachable database never blocks
planning. If DATABASE_URL is missing or the database is down the app keeps working in memory
and reports the database as offline.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

log = logging.getLogger("aeolus.db")
SCHEMA = Path(__file__).with_name("schema.sql")


def init_schema(url: str) -> None:
    with psycopg.connect(url, connect_timeout=15) as conn:
        conn.execute(SCHEMA.read_text(encoding="utf-8"))


class Store:
    def __init__(self, url: str | None) -> None:
        self.url = url
        self.online = False
        self.last_error: str | None = None
        self._q: queue.Queue[tuple[str, tuple] | None] = queue.Queue()
        self._conn: psycopg.Connection | None = None
        self._thread: threading.Thread | None = None

    # ---------- lifecycle ----------

    def start(self) -> None:
        if not self.url:
            self.last_error = "DATABASE_URL not set"
            return
        self._thread = threading.Thread(target=self._run, name="aeolus-db", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._thread:
            self._q.put(None)
            self._thread.join(timeout=5)

    def flush(self, timeout: float = 10.0) -> None:
        """Wait until queued writes are done (used by tests and the smoke script)."""
        done = threading.Event()
        self._q.put(("__flush__", (done,)))
        done.wait(timeout)

    def _connect(self) -> psycopg.Connection:
        if self._conn is None or self._conn.closed:
            self._conn = psycopg.connect(self.url, connect_timeout=15, autocommit=True)
        return self._conn

    def _run(self) -> None:
        try:
            init_schema(self.url)
            self._connect()
            self.online = True
        except Exception as exc:  # noqa: BLE001
            self.online = False
            self.last_error = f"{type(exc).__name__}: {exc}"[:200]
            log.warning("database offline: %s", self.last_error)
        while True:
            item = self._q.get()
            if item is None:
                break
            sql, params = item
            if sql == "__flush__":
                params[0].set()
                continue
            for attempt in (1, 2):
                try:
                    self._connect().execute(sql, params)
                    self.online = True
                    break
                except Exception as exc:  # noqa: BLE001
                    self.online = False
                    self.last_error = f"{type(exc).__name__}: {exc}"[:200]
                    self._conn = None
                    if attempt == 2:
                        log.warning("db write failed: %s", self.last_error)

    def _put(self, sql: str, params: tuple) -> None:
        if self.url:
            self._q.put((sql, params))

    # ---------- writes ----------

    def save_plan(self, plan: dict[str, Any], status: str, trigger: str | None = None,
                  validation: dict | None = None, stability_pct: float | None = None) -> None:
        self._put(
            """
            INSERT INTO plans (id, source, status, parent_id, trigger, solve_ms, objective, sorties, unassigned,
                               violations, stability_pct, plan, validation)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now(),
                validation = COALESCE(EXCLUDED.validation, plans.validation)
            """,
            (plan["id"], plan["source"], status, plan.get("parent_id"), trigger, plan.get("solve_ms"),
             plan.get("objective"), len(plan.get("sorties", [])), len(plan.get("unassigned", [])),
             len(validation.get("violations", [])) if validation else None, stability_pct, Jsonb(plan),
             Jsonb(validation) if validation else None),
        )

    def set_plan_status(self, plan_id: str, status: str) -> None:
        self._put("UPDATE plans SET status = %s, updated_at = now() WHERE id = %s", (status, plan_id))

    def save_decision(self, plan_id: str, decision: str, note: str | None) -> None:
        self._put("INSERT INTO plan_decisions (plan_id, decision, note) VALUES (%s,%s,%s)", (plan_id, decision, note))

    def save_event(self, rec: dict[str, Any]) -> None:
        self._put(
            """
            INSERT INTO events (id, sim_time, type, origin, signature, payload, classification, cache_hit, replan_ms,
                                proposal_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO NOTHING
            """,
            (rec["id"], rec.get("sim_time"), rec["type"], rec.get("origin"), rec.get("signature"),
             Jsonb(rec.get("params", {})), Jsonb(rec.get("classification")), rec.get("cache_hit"),
             rec.get("replan_ms"), rec.get("proposal_id")),
        )

    def save_kpis(self, seed: int, reason: str, kpis: dict, summary: str) -> None:
        self._put("INSERT INTO kpi_snapshots (scenario_seed, reason, kpis, summary) VALUES (%s,%s,%s,%s)",
                  (seed, reason, Jsonb(json.loads(json.dumps(kpis, default=str))), summary))

    def save_chat(self, text: str, parser: str, conditions: list) -> None:
        self._put("INSERT INTO chat_log (text, parser, conditions) VALUES (%s,%s,%s)", (text, parser, Jsonb(conditions)))

    # ---------- reads ----------

    def recent_kpi_snapshots(self, limit: int = 5) -> list[dict]:
        if not self.url:
            return []
        try:
            with psycopg.connect(self.url, connect_timeout=10) as conn:
                rows = conn.execute(
                    "SELECT id, taken_at, reason, kpis, summary FROM kpi_snapshots ORDER BY taken_at DESC LIMIT %s",
                    (limit,),
                ).fetchall()
            return [{"id": r[0], "taken_at": r[1].isoformat(), "reason": r[2], "kpis": r[3], "summary": r[4]}
                    for r in rows]
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{type(exc).__name__}: {exc}"[:200]
            return []

    def counts(self) -> dict[str, int]:
        if not self.url:
            return {}
        try:
            with psycopg.connect(self.url, connect_timeout=10) as conn:
                return {t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]  # noqa: S608
                        for t in ("plans", "plan_decisions", "events", "kpi_snapshots", "chat_log")}
        except Exception:  # noqa: BLE001
            return {}

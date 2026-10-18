"""Create the Aeolus tables from schema.sql. Usage: pnpm db:init"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402

from db.store import init_schema  # noqa: E402


def main() -> int:
    if not settings.database_url:
        print("DATABASE_URL is not set. Add it to .env (see .env.example).")
        return 1
    try:
        init_schema(settings.database_url)
    except Exception as exc:  # noqa: BLE001
        print(f"Could not create tables: {type(exc).__name__}: {exc}")
        return 1
    print("Database ready: plans, plan_decisions, events, kpi_snapshots, chat_log")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

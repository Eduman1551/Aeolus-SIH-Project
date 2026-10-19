"""Runtime settings, read from the environment (and the root .env file if present)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
BACKEND_DIR = ROOT / "backend"

load_dotenv(ROOT / ".env", override=False)


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    database_url: str | None = field(repr=False)
    groq_api_key: str | None = field(repr=False)
    llm_model: str | None
    sim_speed: float  # scenario minutes per real minute
    stability_lambda: int
    manual_baseline_min: int
    solver_time_limit_s: float
    seed: int
    cors_origins: tuple[str, ...] = ()
    cors_origin_regex: str | None = None


def load_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL") or None,
        groq_api_key=os.environ.get("GROQ_API_KEY") or None,
        llm_model=os.environ.get("LLM_MODEL") or None,
        sim_speed=_float("SIM_SPEED", 10.0),
        stability_lambda=_int("STABILITY_LAMBDA", 200),
        manual_baseline_min=_int("MANUAL_BASELINE_MIN", 180),
        solver_time_limit_s=_float("SOLVER_TIME_LIMIT_S", 8.0),
        seed=_int("AEOLUS_SEED", 2026),
        cors_origins=_cors_origins(),
        cors_origin_regex=os.environ.get("ALLOWED_ORIGIN_REGEX") or None,
    )


def _cors_origins() -> tuple[str, ...]:
    """Dashboard origins allowed to call the API: the local web port, plus the deployed site(s) from
    ALLOWED_ORIGINS (comma separated, e.g. https://aeolus.vercel.app). CORS_ORIGINS is the older name."""
    port = _int("WEB_PORT", 3000)
    origins = [f"http://localhost:{port}", f"http://127.0.0.1:{port}"]
    for name in ("ALLOWED_ORIGINS", "CORS_ORIGINS"):
        origins += [o.strip().rstrip("/") for o in os.environ.get(name, "").split(",") if o.strip()]
    return tuple(dict.fromkeys(origins))


settings = load_settings()

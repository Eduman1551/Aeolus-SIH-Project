"""Vercel entrypoint: exposes the FastAPI `app` from backend/ as one Python function.

vercel.json routes /api/* here (services mode). The backend code imports `app.*` and `db.*`
from the backend/ folder, so that folder goes on the path first.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]

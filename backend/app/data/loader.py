"""Load the seeded synthetic source files from data/."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.config import DATA_DIR

SOURCE_FILES = [
    "fleet.json",
    "crews.json",
    "armament.json",
    "airspace.json",
    "weather.json",
    "intel.json",
    "tasking.json",
    "rules.json",
]


@dataclass
class SourceFile:
    name: str
    source: str
    seed: int
    payload: dict


def load_sources(data_dir: Path = DATA_DIR) -> list[SourceFile]:
    missing = [n for n in SOURCE_FILES if not (data_dir / n).exists()]
    if missing:
        # generate on the fly so a fresh clone still runs
        import importlib.util

        spec = importlib.util.spec_from_file_location("aeolus_generate", DATA_DIR / "generate.py")
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(mod)
        files = mod.build(2026)
        data_dir.mkdir(parents=True, exist_ok=True)
        for name, payload in files.items():
            (data_dir / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    out = []
    for name in SOURCE_FILES:
        raw = json.loads((data_dir / name).read_text(encoding="utf-8"))
        out.append(SourceFile(name=name, source=raw.pop("source"), seed=raw.pop("seed", 0), payload=raw))
    return out

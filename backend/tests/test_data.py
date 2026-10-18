import importlib.util

from app.config import DATA_DIR
from app.data.loader import SOURCE_FILES, load_sources


def _generator():
    spec = importlib.util.spec_from_file_location("gen", DATA_DIR / "generate.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_same_seed_same_data():
    gen = _generator()
    assert gen.build(2026) == gen.build(2026)


def test_different_seed_changes_noise_only():
    gen = _generator()
    a, b = gen.build(1), gen.build(2)
    assert a["tasking.json"]["missions"] == b["tasking.json"]["missions"]  # scripted missions stay fixed
    assert a["weather.json"] != b["weather.json"]


def test_dataset_size_and_scarcity():
    data = _generator().build(2026)
    assert len(data["fleet.json"]["aircraft"]) == 20
    assert len(data["fleet.json"]["aircraft_types"]) == 4
    assert len(data["crews.json"]["crews"]) == 30
    assert len(data["tasking.json"]["missions"]) == 15
    demand = sum(m["aircraft_required"] for m in data["tasking.json"]["missions"])
    assert demand > 20  # more sorties than airframes: priorities matter


def test_loader_reads_every_source():
    files = load_sources()
    assert [f.name for f in files] == SOURCE_FILES
    assert all(f.source for f in files)

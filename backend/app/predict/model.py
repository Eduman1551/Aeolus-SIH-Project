"""Aircraft serviceability model (lite).

A small logistic-regression model that predicts P(aircraft stays serviceable for the next
sortie) from maintenance indicators. It is TRAINED ON SYNTHETIC DATA (see train.py) offline
with scikit-learn. Only the fitted numbers (scaler mean/scale, coefficients, intercept) are
shipped in serviceability.json, so the API needs numpy alone and never trains at request time.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np

from app.fusion.schema import RiskInputs
from app.fusion.world import WorldState

FEATURES = ["hours_since_maint", "age_years", "faults_30d", "days_since_inspection", "sorties_7d"]
MODEL_PATH = Path(__file__).with_name("serviceability.json")
_lock = threading.Lock()
_model: dict | None = None


def load() -> dict:
    global _model
    with _lock:
        if _model is None:
            _model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
        return _model


def model_info() -> dict:
    return load()["meta"]


def features(r: RiskInputs) -> list[float]:
    return [r.hours_since_maint, r.age_years, r.faults_30d, r.days_since_inspection, r.sorties_7d]


def predict_proba(X: np.ndarray) -> np.ndarray:
    """Same maths as sklearn's StandardScaler + LogisticRegression.predict_proba(X)[:, 1]."""
    m = load()
    z = (X - np.array(m["mean"])) / np.array(m["scale"])
    return 1.0 / (1.0 + np.exp(-(z @ np.array(m["coef"]) + m["intercept"])))


def predict_serviceability(ws: WorldState) -> dict[str, float]:
    ids = sorted(ws.aircraft)
    X = np.array([features(ws.aircraft[i].risk) for i in ids], dtype=float)
    probs = predict_proba(X)
    out = {}
    for aid, p in zip(ids, probs, strict=True):
        out[aid] = 0.0 if ws.aircraft[aid].status != "serviceable" else round(float(p), 3)
    return out

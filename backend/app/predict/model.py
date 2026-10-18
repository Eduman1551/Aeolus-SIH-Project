"""Aircraft serviceability model (lite).

A small logistic-regression model that predicts P(aircraft stays serviceable for the next
sortie) from maintenance indicators. It is TRAINED ON SYNTHETIC DATA generated below from an
assumed relationship, so it demonstrates the pipeline, not real-world accuracy.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.fusion.schema import RiskInputs
from app.fusion.world import WorldState

FEATURES = ["hours_since_maint", "age_years", "faults_30d", "days_since_inspection", "sorties_7d"]
MODEL_PATH = Path(__file__).with_name("serviceability.joblib")
META_PATH = Path(__file__).with_name("serviceability.meta.json")
_lock = threading.Lock()
_model = None


def synthetic_training_data(n: int = 5000, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    hours = rng.uniform(0, 320, n)
    age = rng.uniform(1, 25, n)
    faults = rng.poisson(1.0, n).clip(0, 8)
    days = rng.uniform(0, 100, n)
    sorties = rng.integers(0, 20, n)
    # assumed ground truth: wear, faults and overdue inspections lower serviceability
    logit = 4.0 - 0.008 * hours - 0.04 * age - 0.45 * faults - 0.012 * days - 0.05 * sorties
    p = 1 / (1 + np.exp(-logit))
    y = rng.random(n) < p
    return np.column_stack([hours, age, faults, days, sorties]), y.astype(int)


def train(save: bool = True) -> tuple[object, dict]:
    X, y = synthetic_training_data()
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=7, stratify=y)
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=500))
    model.fit(Xtr, ytr)
    prob = model.predict_proba(Xte)[:, 1]
    meta = {
        "trained_on": "synthetic data (data generated in app/predict/model.py)",
        "features": FEATURES,
        "n_train": int(len(Xtr)),
        "n_test": int(len(Xte)),
        "test_auc": round(float(roc_auc_score(yte, prob)), 3),
        "test_accuracy": round(float(accuracy_score(yte, prob >= 0.5)), 3),
    }
    if save:
        joblib.dump(model, MODEL_PATH)
        META_PATH.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return model, meta


def load():
    global _model
    with _lock:
        if _model is None:
            if MODEL_PATH.exists():
                try:
                    _model = joblib.load(MODEL_PATH)
                except Exception:  # noqa: BLE001 - incompatible pickle, retrain
                    _model = None
            if _model is None:
                _model, _ = train(save=True)
        return _model


def model_info() -> dict:
    if META_PATH.exists():
        return json.loads(META_PATH.read_text(encoding="utf-8"))
    load()
    return json.loads(META_PATH.read_text(encoding="utf-8")) if META_PATH.exists() else {}


def features(r: RiskInputs) -> list[float]:
    return [r.hours_since_maint, r.age_years, r.faults_30d, r.days_since_inspection, r.sorties_7d]


def predict_serviceability(ws: WorldState) -> dict[str, float]:
    ids = sorted(ws.aircraft)
    X = np.array([features(ws.aircraft[i].risk) for i in ids], dtype=float)
    probs = load().predict_proba(X)[:, 1]
    out = {}
    for aid, p in zip(ids, probs, strict=True):
        out[aid] = 0.0 if ws.aircraft[aid].status != "serviceable" else round(float(p), 3)
    return out

"""Train the serviceability model offline (needs scikit-learn). Usage: pnpm train

Writes serviceability.json next to model.py: the fitted scaler and logistic-regression numbers
plus test metrics. The API only reads that file, so scikit-learn is not a runtime dependency.
"""

from __future__ import annotations

import json

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.predict.model import FEATURES, MODEL_PATH


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


def train(save: bool = True) -> tuple[dict, dict]:
    X, y = synthetic_training_data()
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=7, stratify=y)
    pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=500))
    pipe.fit(Xtr, ytr)
    prob = pipe.predict_proba(Xte)[:, 1]
    meta = {
        "trained_on": "synthetic data (data generated in app/predict/train.py)",
        "features": FEATURES,
        "n_train": int(len(Xtr)),
        "n_test": int(len(Xte)),
        "test_auc": round(float(roc_auc_score(yte, prob)), 3),
        "test_accuracy": round(float(accuracy_score(yte, prob >= 0.5)), 3),
    }
    scaler, lr = pipe[0], pipe[1]
    model = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coef": lr.coef_[0].tolist(),
        "intercept": float(lr.intercept_[0]),
        "meta": meta,
    }
    if save:
        MODEL_PATH.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    return model, meta


if __name__ == "__main__":
    _, meta = train(save=True)
    print(f"Serviceability model saved to {MODEL_PATH.name} (trained on SYNTHETIC data)")
    for k, v in meta.items():
        print(f"  {k}: {v}")

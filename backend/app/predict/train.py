"""Train the serviceability model offline. Usage: pnpm train"""

from app.predict.model import MODEL_PATH, train

if __name__ == "__main__":
    _, meta = train(save=True)
    print(f"Serviceability model saved to {MODEL_PATH.name} (trained on SYNTHETIC data)")
    for k, v in meta.items():
        print(f"  {k}: {v}")

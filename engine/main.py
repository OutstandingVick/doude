"""Doude engine API (v0.1 stub).

Run from the repo root:
    pip install -r engine/requirements.txt
    uvicorn engine.main:app --reload --port 8000

Until the real engine exists (Days 3-10), /analyze and /readings return the
sample contract files so the app can be built against them.
"""
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
METHOD_VERSION = "doude-method v0.1"

app = FastAPI(title="Doude engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text())


@app.get("/health")
def health():
    return {"status": "ok", "method_version": METHOD_VERSION}


@app.get("/scenario")
def scenario():
    s = load("scenario.json")
    # The app must never see the answers.
    s.pop("ground_truth", None)
    s.pop("leak", None)
    return s

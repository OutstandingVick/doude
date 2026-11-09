"""Doude engine API (v0.1 stub).

Run from the repo root:
    pip install -r engine/requirements.txt
    uvicorn engine.main:app --reload --port 8000

Until the real engine exists (Days 3-10), /analyze and /readings return the
sample contract files so the app can be built against them.
"""
import csv
import json
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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


@app.get("/readings")
def readings(step: int = Query(10, ge=1)):
    path = ROOT / "data" / "readings.csv"
    if not path.exists():
        return JSONResponse(status_code=404, content={
            "error": "readings_not_found",
            "message": "data/readings.csv does not exist. Run: python engine/generate.py"})
    with path.open() as f:
        rows = list(csv.DictReader(f))[::step]
    for r in rows:
        for k in ("p_in_bar", "p_out_bar", "q_in_m3s", "q_out_m3s"):
            r[k] = float(r[k])
    return {"pipeline_id": load("scenario.json")["pipeline"]["id"], "step": step, "readings": rows}


@app.post("/analyze")
def analyze():
    # TODO Days 5-10: run baseline -> detect -> locate -> quantify -> impact -> report.
    return load("contracts/analyze_response.sample.json")


@app.exception_handler(FileNotFoundError)
def missing_file(_, exc):
    return JSONResponse(status_code=404, content={"error": "file_not_found", "message": str(exc)})

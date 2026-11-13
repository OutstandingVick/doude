"""Doude engine API.

Run from the repo root:
    pip install -r engine/requirements.txt
    uvicorn engine.main:app --reload --port 8000
"""
import csv
import json
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from engine import forms, locate, pdf_report, report

ROOT = Path(__file__).resolve().parent.parent
METHOD_VERSION = "doude-method v0.1"
READINGS = ROOT / "data" / "readings.csv"

app = FastAPI(title="Doude engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text())


def _readings_missing():
    return JSONResponse(status_code=404, content={
        "error": "readings_not_found",
        "message": "data/readings.csv does not exist. Run: python engine/generate.py"})


def _new_temp_pdf() -> Path:
    fd, name = tempfile.mkstemp(suffix=".pdf", prefix="doude-")
    os.close(fd)
    return Path(name)


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
    if not READINGS.exists():
        return _readings_missing()
    with READINGS.open() as f:
        rows = list(csv.DictReader(f))[::step]
    for r in rows:
        for k in ("p_in_bar", "p_out_bar", "q_in_m3s", "q_out_m3s"):
            r[k] = float(r[k])
    return {"pipeline_id": load("scenario.json")["pipeline"]["id"], "step": step, "readings": rows}


@app.post("/analyze")
def analyze():
    if not READINGS.exists():
        return _readings_missing()
    return report.analyze()


@app.get("/verify")
def verify():
    if not READINGS.exists():
        return _readings_missing()
    first = report.analyze()
    second = report.analyze()
    repeatable = (
        first["report"]["report_hash"] == second["report"]["report_hash"]
        and report.verify(first)
    )
    return {"repeatable": repeatable, "report_hash": first["report"]["report_hash"]}


@app.get("/report.pdf")
def report_pdf():
    if not READINGS.exists():
        return _readings_missing()
    response = report.analyze()
    scenario = locate.load_scenario()
    path = _new_temp_pdf()
    pdf_report.build_spill_report(response, scenario, path)
    return FileResponse(path, media_type="application/pdf",
                        filename="doude-spill-report-SPL-0001.pdf")


@app.get("/forms/a.pdf")
def form_a_pdf():
    if not READINGS.exists():
        return _readings_missing()
    response = report.analyze()
    scenario = locate.load_scenario()
    path = _new_temp_pdf()
    forms.build_form_a(response, scenario, path)
    return FileResponse(path, media_type="application/pdf",
                        filename="doude-form-a-SPL-0001-draft.pdf")


@app.get("/forms/a")
def form_a_json():
    if not READINGS.exists():
        return _readings_missing()
    response = report.analyze()
    scenario = locate.load_scenario()
    return forms.form_a_data(response, scenario)


@app.exception_handler(FileNotFoundError)
def missing_file(_, exc):
    return JSONResponse(status_code=404, content={"error": "file_not_found", "message": str(exc)})

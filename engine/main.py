"""Doude engine API.

Run from the repo root:
    pip install -r engine/requirements.txt
    uvicorn engine.main:app --reload --port 8000
"""
import csv
import json
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Iterator, Optional

from fastapi import Depends, FastAPI, File, Form, Header, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from engine import db, forms, locate, pdf_report, report

ROOT = Path(__file__).resolve().parent.parent
METHOD_VERSION = "doude-method v0.1"
READINGS = ROOT / "data" / "readings.csv"


@asynccontextmanager
async def lifespan(_app):
    conn = db.connect()
    try:
        db.init_db(conn)
        db.upsert_pipeline_from_scenario(conn, locate.load_scenario())
    finally:
        conn.close()
    yield


app = FastAPI(title="Doude engine", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn() -> Iterator:
    """Request-scoped database connection; never shared across requests.

    FastAPI may open the dependency and run a sync endpoint on different
    worker threads, so same-thread checking is relaxed. The connection is
    still used by one request at a time and closed when it finishes.
    """
    conn = db.connect(check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()


class StatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None


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


def _analysis_for(spill_id: Optional[str]):
    if not spill_id:
        return report.analyze()
    conn = db.connect()
    try:
        spill = db.get_spill(conn, spill_id)
    finally:
        conn.close()
    if spill is None:
        return None
    return spill.get("analysis")


def _spill_not_found():
    return JSONResponse(status_code=404, content={
        "error": "spill_not_found", "message": "unknown spill id"})


@app.get("/health")
def health():
    return {"status": "ok", "method_version": METHOD_VERSION}


@app.get("/scenario")
def scenario():
    s = load("scenario.json")
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
def analyze(x_doude_actor: str = Header(default="demo-regulator"), conn=Depends(get_conn)):
    if not READINGS.exists():
        return _readings_missing()
    response = report.analyze()
    spill_id = db.save_analysis(conn, response, x_doude_actor)
    result = dict(response)
    result["spill_id"] = spill_id
    return result


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


@app.get("/pipelines")
def pipelines(conn=Depends(get_conn)):
    rows = conn.execute(
        "SELECT id, name, type, length_m, inner_diameter_m, terrain_at_leak, created_at"
        " FROM pipelines ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.get("/spills")
def spills(pipeline_id: Optional[str] = None, conn=Depends(get_conn)):
    result = db.list_spills(conn, pipeline_id)
    return result


@app.get("/spills/{spill_id}")
def get_spill(spill_id: str, conn=Depends(get_conn)):
    spill = db.get_spill(conn, spill_id)
    if spill is None:
        return _spill_not_found()
    return spill


@app.post("/spills/{spill_id}/status")
def set_status(spill_id: str, update: StatusUpdate,
               x_doude_actor: str = Header(default="demo-regulator"),
               conn=Depends(get_conn)):
    try:
        db.set_status(conn, spill_id, update.status, x_doude_actor, update.note)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={
            "error": "invalid_transition", "message": str(exc)})
    return {"spill_id": spill_id, "status": update.status}


@app.post("/spills/{spill_id}/evidence")
async def add_evidence(spill_id: str, file: UploadFile = File(...),
                       note: Optional[str] = Form(None),
                       x_doude_actor: str = Header(default="demo-regulator"),
                       conn=Depends(get_conn)):
    data = await file.read()
    if len(data) > db.MAX_EVIDENCE_BYTES:
        return JSONResponse(status_code=413, content={
            "error": "file_too_large", "message": "evidence exceeds 10 MB"})
    if (file.content_type or "") not in db.ALLOWED_CONTENT_TYPES:
        return JSONResponse(status_code=415, content={
            "error": "unsupported_content_type", "message": "unsupported file type"})
    evidence = db.add_evidence(conn, spill_id, file.filename or "file",
                               file.content_type or "", data, note, x_doude_actor)
    return evidence


@app.get("/spills/{spill_id}/evidence/{evidence_id}")
def get_evidence(spill_id: str, evidence_id: int, conn=Depends(get_conn)):
    row = conn.execute(
        "SELECT * FROM evidence WHERE id = ? AND spill_id = ?",
        (evidence_id, spill_id)).fetchone()
    if row is None:
        return JSONResponse(status_code=404, content={
            "error": "evidence_not_found", "message": "unknown evidence id"})
    return FileResponse(row["stored_path"], media_type=row["content_type"],
                        filename=row["filename"])


@app.get("/spills/{spill_id}/audit")
def get_audit(spill_id: str, conn=Depends(get_conn)):
    rows = conn.execute(
        "SELECT * FROM audit_log WHERE spill_id = ? ORDER BY id",
        (spill_id,)).fetchall()
    return [dict(r) for r in rows]


@app.get("/audit/verify")
def audit_verify(conn=Depends(get_conn)):
    result = db.verify_audit_chain(conn)
    return result


@app.get("/report.pdf")
def report_pdf(spill_id: Optional[str] = None):
    if not READINGS.exists():
        return _readings_missing()
    response = _analysis_for(spill_id)
    if response is None:
        return _spill_not_found()
    scenario = locate.load_scenario()
    path = _new_temp_pdf()
    pdf_report.build_spill_report(response, scenario, path)
    return FileResponse(path, media_type="application/pdf",
                        filename="doude-spill-report-%s.pdf" % (spill_id or "SPL-0001"))


@app.get("/forms/a.pdf")
def form_a_pdf(spill_id: Optional[str] = None):
    if not READINGS.exists():
        return _readings_missing()
    response = _analysis_for(spill_id)
    if response is None:
        return _spill_not_found()
    scenario = locate.load_scenario()
    path = _new_temp_pdf()
    forms.build_form_a(response, scenario, path)
    return FileResponse(path, media_type="application/pdf",
                        filename="doude-form-a-%s-draft.pdf" % (spill_id or "SPL-0001"))


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
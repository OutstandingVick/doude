"""Feasibility3D engine API.

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
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from engine import db, forms, locate, pdf_report, report, reports, written

ROOT = Path(__file__).resolve().parent.parent
METHOD_VERSION = "feasibility3d-method v0.1"
READINGS = ROOT / "data" / "readings.csv"


@asynccontextmanager
async def lifespan(_app):
    conn = db.connect()
    try:
        db.init_db(conn)
        written.init_tables(conn)
        db.upsert_pipeline_from_scenario(conn, locate.load_scenario())
    finally:
        conn.close()
    yield


app = FastAPI(title="Feasibility3D engine", version="0.1.0", lifespan=lifespan)
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


class FormAFiled(BaseModel):
    reference: str
    filed_at: Optional[str] = None


class ContactIn(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None


def load(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text())


def _readings_missing():
    return JSONResponse(status_code=404, content={
        "error": "readings_not_found",
        "message": "data/readings.csv does not exist. Run: python engine/generate.py"})


def _new_temp_pdf() -> Path:
    fd, name = tempfile.mkstemp(suffix=".pdf", prefix="feasibility3d-")
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
def analyze(x_feasibility3d_actor: str = Header(default="demo-regulator"), conn=Depends(get_conn)):
    if not READINGS.exists():
        return _readings_missing()
    response = report.analyze()
    spill_id = db.save_analysis(conn, response, x_feasibility3d_actor)
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
               x_feasibility3d_actor: str = Header(default="demo-regulator"),
               conn=Depends(get_conn)):
    try:
        db.set_status(conn, spill_id, update.status, x_feasibility3d_actor, update.note)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={
            "error": "invalid_transition", "message": str(exc)})
    return {"spill_id": spill_id, "status": update.status}


@app.post("/spills/{spill_id}/evidence")
async def add_evidence(spill_id: str, file: UploadFile = File(...),
                       note: Optional[str] = Form(None),
                       x_feasibility3d_actor: str = Header(default="demo-regulator"),
                       conn=Depends(get_conn)):
    data = await file.read()
    if len(data) > db.MAX_EVIDENCE_BYTES:
        return JSONResponse(status_code=413, content={
            "error": "file_too_large", "message": "evidence exceeds 10 MB"})
    if (file.content_type or "") not in db.ALLOWED_CONTENT_TYPES:
        return JSONResponse(status_code=415, content={
            "error": "unsupported_content_type", "message": "unsupported file type"})
    evidence = db.add_evidence(conn, spill_id, file.filename or "file",
                               file.content_type or "", data, note, x_feasibility3d_actor)
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


@app.post("/spills/{spill_id}/forms/a/filed")
def file_form_a(spill_id: str, body: FormAFiled,
                x_feasibility3d_actor: str = Header(default="demo-regulator"),
                conn=Depends(get_conn)):
    try:
        return db.file_form_a(conn, spill_id, x_feasibility3d_actor, body.reference, body.filed_at)
    except ValueError as exc:
        return _spill_not_found()


@app.get("/notifications")
def notifications(conn=Depends(get_conn)):
    return db.notifications(conn)


@app.get("/contacts")
def list_contacts(conn=Depends(get_conn)):
    return db.list_contacts(conn)


@app.post("/contacts")
def add_contact(body: ContactIn,
                x_feasibility3d_actor: str = Header(default="demo-regulator"),
                conn=Depends(get_conn)):
    if not body.name.strip():
        return JSONResponse(status_code=400, content={
            "error": "invalid_contact", "message": "name is required"})
    return db.add_contact(conn, body.name.strip(), body.email, body.phone, x_feasibility3d_actor)


@app.delete("/contacts/{contact_id}")
def remove_contact(contact_id: int,
                   x_feasibility3d_actor: str = Header(default="demo-regulator"),
                   conn=Depends(get_conn)):
    try:
        db.remove_contact(conn, contact_id, x_feasibility3d_actor)
    except ValueError:
        return JSONResponse(status_code=404, content={
            "error": "contact_not_found", "message": "unknown contact id"})
    return {"id": contact_id, "removed": True}


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
                        filename="feasibility3d-spill-report-%s.pdf" % (spill_id or "SPL-0001"))


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
                        filename="feasibility3d-form-a-%s-draft.pdf" % (spill_id or "SPL-0001"))


@app.get("/forms/a")
def form_a_json():
    if not READINGS.exists():
        return _readings_missing()
    response = report.analyze()
    scenario = locate.load_scenario()
    return forms.form_a_data(response, scenario)


@app.get("/reports/types")
def report_types():
    return reports.REPORT_TYPES


@app.get("/reports/history")
def report_history(limit: int = Query(50, ge=1, le=500), conn=Depends(get_conn)):
    return db.report_history(conn, limit)


@app.get("/reports/history/{entry_id}.pdf")
def report_history_file(entry_id: int, conn=Depends(get_conn)):
    path = db.report_file(conn, entry_id)
    if path is None:
        return JSONResponse(status_code=404, content={
            "error": "report_not_found", "message": "no stored PDF for this entry"})
    item = next((h for h in db.report_history(conn, 500) if h["id"] == entry_id), {})
    return FileResponse(path, media_type="application/pdf",
                        filename=_report_filename(item.get("type") or "report", item.get("params") or {}))


def _report_filename(report_type: str, params: dict) -> str:
    parts = ["feasibility3d", report_type]
    for key in ("spill_id", "pipeline_id", "from", "to"):
        if params.get(key):
            parts.append(str(params[key]))
    return "-".join(parts) + ".pdf"


class WrittenReportIn(BaseModel):
    kind: str
    spill_id: str
    title: Optional[str] = None
    fields: dict = {}
    sections: list = []
    template_id: Optional[int] = None


class TemplateIn(BaseModel):
    name: str
    kind: str
    fields: dict = {}
    sections: list = []


def _form_error(exc):
    return JSONResponse(status_code=exc.status, content={
        "error": "invalid_report", "message": str(exc), "fields": exc.fields})


@app.get("/reports/forms")
def report_forms():
    return {"forms": written.form_list(), "sections": written.SECTIONS}


@app.get("/reports/forms/{kind}/prefill")
def report_prefill(kind: str, spill_id: str, conn=Depends(get_conn)):
    try:
        return written.prefill(conn, kind, spill_id, locate.load_scenario())
    except written.FormError as exc:
        return _form_error(exc)


@app.post("/reports/written")
def create_written_report(body: WrittenReportIn,
                          x_feasibility3d_actor: str = Header(default="demo-regulator"),
                          conn=Depends(get_conn)):
    try:
        return written.create_report(conn, body.kind, body.spill_id, body.fields, body.sections,
                                     body.title, x_feasibility3d_actor, locate.load_scenario(),
                                     body.template_id)
    except written.FormError as exc:
        return _form_error(exc)


@app.get("/reports/written")
def list_written_reports(spill_id: Optional[str] = None, conn=Depends(get_conn)):
    return written.list_reports(conn, spill_id)


@app.get("/reports/written/{report_id}")
def get_written_report(report_id: int, conn=Depends(get_conn)):
    item = written.get_report(conn, report_id)
    if item is None:
        return JSONResponse(status_code=404, content={
            "error": "report_not_found", "message": "unknown report"})
    return item


@app.get("/reports/templates")
def list_report_templates(conn=Depends(get_conn)):
    return written.list_templates(conn)


@app.post("/reports/templates")
def save_report_template(body: TemplateIn,
                         x_feasibility3d_actor: str = Header(default="demo-regulator"),
                         conn=Depends(get_conn)):
    try:
        return written.save_template(conn, body.name, body.kind, body.fields, body.sections,
                                     x_feasibility3d_actor)
    except written.FormError as exc:
        return _form_error(exc)


@app.delete("/reports/templates/{template_id}")
def delete_report_template(template_id: int,
                           x_feasibility3d_actor: str = Header(default="demo-regulator"),
                           conn=Depends(get_conn)):
    try:
        written.delete_template(conn, template_id, x_feasibility3d_actor)
    except written.FormError as exc:
        return _form_error(exc)
    return {"id": template_id, "deleted": True}


@app.get("/reports/{report_type}.pdf")
def report_pdf_typed(
    report_type: str,
    spill_id: Optional[str] = None,
    pipeline_id: Optional[str] = None,
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    download: bool = False,
    x_feasibility3d_actor: str = Header(default="demo-regulator"),
    conn=Depends(get_conn),
):
    if report_type not in reports.REPORT_TYPE_IDS:
        return JSONResponse(status_code=404, content={
            "error": "unknown_report_type", "message": "unknown report type"})
    try:
        data, params = reports.generate(
            conn, report_type, locate.load_scenario(), spill_id=spill_id,
            pipeline_id=pipeline_id, date_from=date_from, date_to=date_to)
    except reports.ReportError as exc:
        return JSONResponse(status_code=exc.status, content={
            "error": "invalid_report_request", "message": str(exc)})
    entry = db.record_report(conn, report_type, params, data, x_feasibility3d_actor)
    disposition = "attachment" if download else "inline"
    return Response(content=data, media_type="application/pdf", headers={
        "Content-Disposition": '%s; filename="%s"' % (disposition, _report_filename(report_type, params)),
        "X-Report-Sha256": entry["sha256"],
        "X-Report-Entry": str(entry["id"]),
        "Access-Control-Expose-Headers": "X-Report-Sha256, X-Report-Entry",
    })


@app.exception_handler(FileNotFoundError)
def missing_file(_, exc):
    return JSONResponse(status_code=404, content={"error": "file_not_found", "message": str(exc)})
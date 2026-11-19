"""Tests for written Form A/B/C reports, custom builds and templates."""

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from engine import db, reports, written
from engine.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FEASIBILITY3D_DB", str(tmp_path / "written.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    monkeypatch.setattr(db, "REPORTS_DIR", tmp_path / "reports")
    with TestClient(app) as c:
        c.spill_id = c.post("/analyze").json()["spill_id"]
        yield c


def _pdf_text(content: bytes) -> str:
    assert content.startswith(b"%PDF")
    return "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(content)).pages)


FORM_A = {
    "company_name": "Test Operator Ltd", "address": "12 Oilfield Road, Port Harcourt",
    "reported_by": "A. Inspector", "extent_of_pollution": "Sheen on creek, ~1 km",
}


def test_forms_schema(client):
    data = client.get("/reports/forms").json()
    assert [f["id"] for f in data["forms"]] == ["form-a", "form-b", "form-c", "custom"]
    assert {s["id"] for s in data["sections"]} >= {"summary", "audit", "evidence"}


def test_prefill_form_a_from_spill(client):
    pre = client.get("/reports/forms/form-a/prefill", params={"spill_id": client.spill_id}).json()
    spill = client.get("/spills/%s" % client.spill_id).json()
    assert pre["date_observed"] == spill["detected_at"]
    assert pre["estimated_volume_bbl"] == spill["volume_bbl"]
    assert pre["latitude"] and pre["longitude"]
    assert client.get("/reports/forms/form-a/prefill",
                      params={"spill_id": "SPL-9999"}).status_code == 404


def test_create_form_a_logs_and_downloads(client):
    pre = client.get("/reports/forms/form-a/prefill", params={"spill_id": client.spill_id}).json()
    r = client.post("/reports/written", json={
        "kind": "form-a", "spill_id": client.spill_id, "fields": dict(pre, **FORM_A)})
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["kind"] == "form-a" and item["fields"]["company_name"] == "Test Operator Ltd"
    history = client.get("/reports/history").json()[0]
    assert history["type"] == "written-form-a" and history["sha256"] == item["sha256"]
    pdf = client.get("/reports/history/%s.pdf" % history["id"]).content
    assert reports.sha256_hex(pdf) == item["sha256"]
    text = _pdf_text(pdf)
    assert "Form A" in text and "Test Operator Ltd" in text and "Sheen on creek" in text
    actions = [a["action"] for a in client.get("/spills/%s/audit" % client.spill_id).json()]
    assert "report_created" in actions and "report_generated" in actions
    assert client.get("/audit/verify").json()["ok"] is True


def test_required_fields_and_validation(client):
    r = client.post("/reports/written", json={
        "kind": "form-b", "spill_id": client.spill_id, "fields": {"cause": "Aliens"}})
    assert r.status_code == 400
    body = r.json()
    assert "cause_details" in body["fields"] or "cause" in body["fields"]
    assert client.post("/reports/written", json={
        "kind": "form-z", "spill_id": client.spill_id, "fields": {}}).status_code == 404


def test_form_b_and_c(client):
    b = client.post("/reports/written", json={"kind": "form-b", "spill_id": client.spill_id, "fields": {
        "cause": "Corrosion", "cause_details": "External corrosion at weld",
        "volume_spilled_bbl": 28880, "impact_description": "Creek and mangrove affected",
        "containment_measures": "Booms deployed", "prepared_by": "A. Inspector"}})
    assert b.status_code == 200, b.text
    c = client.post("/reports/written", json={"kind": "form-c", "spill_id": client.spill_id, "fields": {
        "cleanup_completed": "2026-11-20T12:00", "methods_used": "Skimming, bioremediation",
        "volume_recovered_bbl": 20000, "waste_generated": "Oily waste to licensed facility",
        "remediation_status": "Monitoring", "certified_by": "B. Officer"}})
    assert c.status_code == 200, c.text
    assert len(client.get("/reports/written", params={"spill_id": client.spill_id}).json()) == 2


def test_custom_report_sections(client):
    r = client.post("/reports/written", json={
        "kind": "custom", "spill_id": client.spill_id, "title": "Board briefing",
        "fields": {"prepared_by": "A. Inspector", "summary": "Short briefing."},
        "sections": ["evidence", "summary", "audit", "bogus"]})
    assert r.status_code == 200, r.text
    assert r.json()["sections"] == ["summary", "audit", "evidence"]
    pdf = client.get("/reports/history/%s.pdf" % r.json()["history_id"]).content
    text = _pdf_text(pdf)
    assert "Board briefing" in text and "Audit log" in text and "spill_recorded" in text
    empty = client.post("/reports/written", json={
        "kind": "custom", "spill_id": client.spill_id, "fields": {"prepared_by": "X"}})
    assert empty.status_code == 400


def test_templates_save_list_delete(client):
    t = client.post("/reports/templates", json={
        "name": "Operator defaults", "kind": "form-a",
        "fields": {"company_name": "Test Operator Ltd", "not_a_field": "x"}})
    assert t.status_code == 200, t.text
    tpl = t.json()
    assert tpl["fields"] == {"company_name": "Test Operator Ltd"}
    assert [x["name"] for x in client.get("/reports/templates").json()] == ["Operator defaults"]
    assert client.post("/reports/templates", json={"name": " ", "kind": "form-a"}).status_code == 400
    assert client.delete("/reports/templates/%s" % tpl["id"]).status_code == 200
    assert client.get("/reports/templates").json() == []
    assert client.delete("/reports/templates/%s" % tpl["id"]).status_code == 404
    assert client.get("/audit/verify").json()["ok"] is True


def test_no_ground_truth_in_written_source():
    assert "ground_truth" not in Path(written.__file__).read_text()

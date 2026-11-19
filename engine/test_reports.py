"""Tests for the /reports endpoints and generated PDFs."""

import io
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from engine import db, reports
from engine.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FEASIBILITY3D_DB", str(tmp_path / "reports.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    monkeypatch.setattr(db, "REPORTS_DIR", tmp_path / "reports")
    with TestClient(app) as test_client:
        spill_id = test_client.post("/analyze").json()["spill_id"]
        test_client.post("/spills/%s/evidence" % spill_id,
                         files={"file": ("readings.csv", b"t,p\n1,2\n", "text/csv")})
        test_client.spill_id = spill_id
        yield test_client


def _text(response) -> str:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(response.content))
    return "\n".join(page.extract_text() for page in reader.pages)


def _chain_ok(client):
    assert client.get("/audit/verify").json()["ok"] is True


def test_report_types(client):
    types = client.get("/reports/types").json()
    assert [t["id"] for t in types] == ["spill", "form-a", "compliance", "audit", "period"]
    for t in types:
        assert t["name"] and t["description"] and t["scope"] in ("spill", "pipeline", "period")
        assert isinstance(t["params"], list)


def test_spill_report(client):
    text = _text(client.get("/reports/spill.pdf", params={"spill_id": client.spill_id}))
    assert "Spill Report" in text and "Report hash" in text


def test_form_a_report(client):
    text = _text(client.get("/reports/form-a.pdf", params={"spill_id": client.spill_id}))
    assert "Form A" in text


def test_compliance_report(client):
    text = _text(client.get("/reports/compliance.pdf"))
    assert "Compliance Status Report" in text
    assert client.spill_id in text
    assert "OVERDUE" in text  # scenario detection is weeks in the past
    client.post("/spills/%s/forms/a/filed" % client.spill_id,
                json={"reference": "NOS-TEST-1", "filed_at": "2026-11-04T10:00:00Z"})
    text = _text(client.get("/reports/compliance.pdf"))
    assert "Filed 04 Nov 2026" in text
    pipeline = client.get("/pipelines").json()[0]["id"]
    text = _text(client.get("/reports/compliance.pdf", params={"pipeline_id": pipeline}))
    assert "Pipeline %s" % pipeline in text


def test_audit_report(client):
    spill = client.get("/spills/%s" % client.spill_id).json()
    text = _text(client.get("/reports/audit.pdf", params={"spill_id": client.spill_id}))
    assert "Audit & Integrity Report" in text
    assert "spill_recorded" in text and "evidence_added" in text
    assert "readings.csv" in text
    assert spill["evidence"][0]["sha256"][:20] in text.replace("\n", "")
    assert spill["input_hash"] in text.replace("\n", "")
    assert "Verified" in text


def test_period_report(client):
    spill = client.get("/spills/%s" % client.spill_id).json()
    day = spill["detected_at"][:10]
    text = _text(client.get("/reports/period.pdf", params={"from": day, "to": day}))
    assert "Period Summary" in text
    assert "By pipeline" in text and "By terrain" in text
    assert "{:,}".format(spill["volume_bbl"]) in text
    empty = _text(client.get("/reports/period.pdf", params={"from": "2001-01-01", "to": "2001-01-31"}))
    assert "No spills detected in this period." in empty


def test_bad_params(client):
    assert client.get("/reports/spill.pdf").status_code == 400
    assert client.get("/reports/audit.pdf", params={"spill_id": "SPL-9999"}).status_code == 404
    assert client.get("/reports/period.pdf", params={"from": "2026-11-10"}).status_code == 400
    assert client.get("/reports/nope.pdf").status_code == 404


def test_reports_logged_and_redownloadable(client):
    response = client.get("/reports/audit.pdf", params={"spill_id": client.spill_id})
    sha = response.headers["x-report-sha256"]
    history = client.get("/reports/history").json()
    assert history[0]["type"] == "audit"
    assert history[0]["sha256"] == sha
    assert history[0]["params"] == {"spill_id": client.spill_id}
    again = client.get("/reports/history/%s.pdf" % history[0]["id"])
    assert again.status_code == 200
    assert reports.sha256_hex(again.content) == sha
    _chain_ok(client)


def test_every_report_keeps_audit_chain_valid(client):
    day = client.get("/spills/%s" % client.spill_id).json()["detected_at"][:10]
    for path, params in [("spill", {"spill_id": client.spill_id}),
                         ("form-a", {"spill_id": client.spill_id}),
                         ("compliance", {}), ("audit", {"spill_id": client.spill_id}),
                         ("period", {"from": day, "to": day})]:
        assert client.get("/reports/%s.pdf" % path, params=params).status_code == 200
    assert len(client.get("/reports/history").json()) == 5
    _chain_ok(client)


def test_compliance_rules():
    spill = {"detected_at": "2026-11-03T14:05:00Z", "shut_in_at": "2026-11-05T10:10:00Z",
             "status": "detected"}
    now = datetime(2026, 11, 18, tzinfo=timezone.utc)
    c = reports.compliance_items(spill, [], now)
    by_name = {i["name"]: i for i in c["items"]}
    assert by_name["Form A"]["overdue"] and by_name["JIV"]["overdue"]
    assert by_name["Form B"]["overdue"] and not by_name["Form C"]["overdue"]
    assert c["days_open"] == 14
    filed = {"filed": True, "filed_at": "2026-11-05T09:00:00Z", "reference": "NOS-1"}
    audit = [{"action": "status_changed", "at": "2026-11-06T09:00:00Z",
              "detail_json": '{"from": "detected", "to": "jiv"}'}]
    c = reports.compliance_items(dict(spill, status="jiv"), audit, now, filed)
    form_a, jiv = c["items"][0], c["items"][1]
    assert form_a["done"] and form_a["late"] and not form_a["overdue"]
    assert jiv["done"] and not jiv["late"]


def test_no_ground_truth_in_report_source():
    for module in (reports,):
        assert "ground_truth" not in Path(module.__file__).read_text()

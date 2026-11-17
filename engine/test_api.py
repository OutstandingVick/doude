"""Tests for the Doude FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from engine import db
from engine.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DOUDE_DB", str(tmp_path / "api.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    with TestClient(app) as test_client:
        yield test_client


def test_analyze_returns_detected(client):
    response = client.post("/analyze")
    assert response.status_code == 200
    assert response.json()["detected"] is True


def test_verify_repeatable(client):
    response = client.get("/verify")
    assert response.status_code == 200
    assert response.json()["repeatable"] is True


def test_report_pdf(client):
    response = client.get("/report.pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_form_a_pdf(client):
    response = client.get("/forms/a.pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_form_a_json(client):
    response = client.get("/forms/a")
    assert response.status_code == 200
    body = response.json()
    assert body["draft"] is True
    assert "deadline_utc" in body["incident"]


def test_analyze_persists_and_lists(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    assert spill_id == "SPL-0001"

    spills = client.get("/spills").json()
    assert any(s["id"] == spill_id for s in spills)

    detail = client.get(f"/spills/{spill_id}")
    assert detail.status_code == 200
    assert detail.json()["id"] == spill_id


def test_unknown_spill_404(client):
    assert client.get("/spills/SPL-9999").status_code == 404


def test_status_transition(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    ok = client.post(f"/spills/{spill_id}/status", json={"status": "jiv", "note": "JIV done"})
    assert ok.status_code == 200
    bad = client.post(f"/spills/{spill_id}/status", json={"status": "closed", "note": "skip"})
    assert bad.status_code == 400


def test_evidence_upload(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 16
    ok = client.post(
        f"/spills/{spill_id}/evidence",
        files={"file": ("photo.png", png, "image/png")},
        data={"note": "field photo"},
    )
    assert ok.status_code == 200

    bad = client.post(
        f"/spills/{spill_id}/evidence",
        files={"file": ("notes.txt", b"hi", "text/plain")},
    )
    assert bad.status_code == 415


def test_audit_verify(client):
    client.post("/analyze")
    response = client.get("/audit/verify")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_cors_allows_local_origin_on_any_port(client):
    response = client.get("/health", headers={"Origin": "http://localhost:3002"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3002"
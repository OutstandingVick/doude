"""Tests for the Feasibility3D FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from engine import db
from engine.main import app

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin-pass-123"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Authenticated client: COOKIE_SECRET set + first admin bootstrapped."""
    monkeypatch.setenv("FEASIBILITY3D_DB", str(tmp_path / "api.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    monkeypatch.setenv("COOKIE_SECRET", "test-cookie-secret")
    monkeypatch.setenv("COOKIE_SECURE", "false")  # allow the cookie over http:// in tests
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASSWORD)
    with TestClient(app) as test_client:
        login = test_client.post("/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert login.status_code == 200
        yield test_client


@pytest.fixture()
def open_client(tmp_path, monkeypatch):
    """Open-mode client: no COOKIE_SECRET, so auth is not enforced."""
    monkeypatch.setenv("FEASIBILITY3D_DB", str(tmp_path / "open.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    monkeypatch.delenv("COOKIE_SECRET", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
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


def test_notifications_lists_audit_and_deadline(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    items = client.get("/notifications").json()
    assert any(n["kind"] == "audit" and n["title"] == "Spill recorded" for n in items)
    assert any(n["kind"] == "deadline" and n["title"] == "Form A due (24 h)"
               and n["overdue"] is True for n in items)
    # newest first
    assert items[0]["id"].startswith(("audit-", "deadline-"))


def _detected_at(client, spill_id):
    return client.get(f"/spills/{spill_id}").json()["detected_at"]


def _shift(iso, hours):
    from datetime import datetime, timedelta
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (d + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")


def test_notifications_deadline_cleared_after_filing(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    client.post(f"/spills/{spill_id}/forms/a/filed",
                json={"reference": "SPL-0001-A", "filed_at": _shift(_detected_at(client, spill_id), 1)})
    items = client.get("/notifications").json()
    assert not any(n["kind"] == "deadline" and n["spill_id"] == spill_id for n in items)
    assert any(n["title"] == "Form A filed" for n in items)


def test_file_form_a(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    # file 25 h after detection → late
    filed_at = _shift(_detected_at(client, spill_id), 25)
    ok = client.post(f"/spills/{spill_id}/forms/a/filed",
                     json={"reference": "SPL-0001-A", "filed_at": filed_at})
    assert ok.status_code == 200
    body = ok.json()
    assert body["filed"] is True
    assert body["late"] is True  # filed 24 h+ after detection

    detail = client.get(f"/spills/{spill_id}").json()
    assert detail["form_a"]["filed"] is True
    assert detail["form_a"]["late"] is True

    # chain still valid
    assert client.get("/audit/verify").json()["ok"] is True


def test_file_form_a_unknown_spill_404(client):
    assert client.post("/spills/SPL-9999/forms/a/filed",
                       json={"reference": "X"}).status_code == 404


def test_file_form_a_on_time_not_late(client):
    spill_id = client.post("/analyze").json()["spill_id"]
    # file within 24 h of detection → on time
    filed_at = _shift(_detected_at(client, spill_id), 1)
    body = client.post(f"/spills/{spill_id}/forms/a/filed",
                       json={"reference": "SPL-0001-A", "filed_at": filed_at}).json()
    assert body["late"] is False


def test_contacts_crud(client):
    assert client.get("/contacts").json() == []

    added = client.post("/contacts", json={"name": "Ada", "email": "ada@n.com", "phone": "1"}).json()
    assert added["name"] == "Ada"

    listed = client.get("/contacts").json()
    assert len(listed) == 1
    assert listed[0]["id"] == added["id"]

    # logged to audit chain
    assert client.get("/audit/verify").json()["ok"] is True
    audit = client.get("/notifications").json()
    assert any(n["title"] == "Contact added" and n["detail"] == "Ada" for n in audit)

    removed = client.delete(f"/contacts/{added['id']}")
    assert removed.status_code == 200
    assert removed.json() == {"id": added["id"], "removed": True}
    assert client.get("/contacts").json() == []


def test_contact_requires_name(client):
    assert client.post("/contacts", json={"name": "  "}).status_code == 400


def test_contact_remove_unknown_404(client):
    assert client.delete("/contacts/999").status_code == 404


# --- Authentication --------------------------------------------------------

def test_admin_bootstrapped_from_env(client):
    me = client.get("/me").json()
    assert me["user"]["email"] == ADMIN_EMAIL
    assert me["user"]["role"] == "admin"


def test_health_reports_auth_enabled(client):
    assert client.get("/health").json()["auth_enabled"] is True


def test_login_wrong_password_401(client):
    r = client.post("/login", json={"email": ADMIN_EMAIL, "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"] == "invalid_credentials"


def test_login_unknown_user_401(client):
    assert client.post("/login", json={"email": "ghost@x.com", "password": "x"}).status_code == 401


def test_protected_endpoint_requires_session(tmp_path, monkeypatch):
    """A fresh client that has not logged in gets 401 on data routes."""
    monkeypatch.setenv("FEASIBILITY3D_DB", str(tmp_path / "auth.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    monkeypatch.setenv("COOKIE_SECRET", "test-cookie-secret")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("ADMIN_EMAIL", ADMIN_EMAIL)
    monkeypatch.setenv("ADMIN_PASSWORD", ADMIN_PASSWORD)
    with TestClient(app) as c:
        assert c.get("/health").status_code == 200          # exempt
        assert c.get("/spills").status_code == 401          # protected
        assert c.get("/me").status_code == 401              # protected
        # logging in unlocks it
        assert c.post("/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).status_code == 200
        assert c.get("/spills").status_code == 200


def test_logout_clears_session(client):
    assert client.get("/me").status_code == 200
    client.post("/logout")
    # a fresh client with no cookie is 401; the logged-in client's cookie is gone
    assert client.cookies.get("feasibility3d_session") is None


def test_open_mode_without_secret(open_client):
    """No COOKIE_SECRET → data routes are open (dev/demo mode)."""
    assert open_client.get("/health").json()["auth_enabled"] is False
    assert open_client.get("/spills").status_code == 200
    assert open_client.post("/analyze").status_code == 200

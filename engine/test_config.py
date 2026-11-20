"""Production-safety checks: the engine refuses unsafe configurations."""

import pytest
from fastapi.testclient import TestClient

from engine import db
from engine.main import app


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("FEASIBILITY3D_DB", str(tmp_path / "cfg.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    for k in ("APP_ENV", "COOKIE_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


@pytest.mark.parametrize("missing", ["COOKIE_SECRET", "ADMIN_PASSWORD"])
def test_production_refuses_to_start_without_secret(env, missing):
    env.setenv("APP_ENV", "production")
    env.setenv("COOKIE_SECRET", "s3cret")
    env.setenv("ADMIN_EMAIL", "admin@example.com")
    env.setenv("ADMIN_PASSWORD", "pw-123456")
    env.delenv(missing)
    with pytest.raises(RuntimeError, match=missing):
        with TestClient(app):
            pass


def test_production_starts_when_configured(env):
    env.setenv("APP_ENV", "production")
    env.setenv("COOKIE_SECRET", "s3cret")
    env.setenv("ADMIN_EMAIL", "admin@example.com")
    env.setenv("ADMIN_PASSWORD", "pw-123456")
    with TestClient(app) as c:
        assert c.get("/health").json()["auth_enabled"] is True
        assert c.get("/spills").status_code == 401


@pytest.mark.parametrize("app_env", [None, "staging", "production"])
def test_open_mode_refused_outside_development(env, app_env):
    if app_env:
        env.setenv("APP_ENV", app_env)
    with pytest.raises(RuntimeError, match="COOKIE_SECRET"):
        with TestClient(app):
            pass


def test_open_mode_allowed_in_development(env):
    env.setenv("APP_ENV", "development")
    with TestClient(app) as c:
        assert c.get("/spills").status_code == 200


def test_cookie_is_first_party_by_default(env):
    env.setenv("APP_ENV", "production")
    env.setenv("COOKIE_SECRET", "s3cret")
    env.setenv("ADMIN_EMAIL", "admin@example.com")
    env.setenv("ADMIN_PASSWORD", "pw-123456")
    with TestClient(app, base_url="https://testserver") as c:
        r = c.post("/login", json={"email": "admin@example.com", "password": "pw-123456"})
        cookie = r.headers["set-cookie"].lower()
        assert "samesite=lax" in cookie and "secure" in cookie and "httponly" in cookie

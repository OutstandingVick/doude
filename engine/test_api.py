"""Tests for the Doude FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from engine.main import app


@pytest.fixture(scope="module")
def client():
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

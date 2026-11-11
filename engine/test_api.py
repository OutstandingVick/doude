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

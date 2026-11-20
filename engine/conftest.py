import pytest


@pytest.fixture(autouse=True)
def _development_env(monkeypatch):
    """Tests run in development mode (open mode allowed) unless they override APP_ENV."""
    monkeypatch.setenv("APP_ENV", "development")

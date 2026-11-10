"""Tests for the Doude leak and shut-in detection engine."""

import pytest

from engine import detect


@pytest.fixture(scope="module")
def rows():
    """Load the real readings file once for the whole module."""
    return detect.load_readings(detect.DATA_FILE)


@pytest.fixture(scope="module")
def result(rows):
    """Run the full detection once for the whole module."""
    return detect.detect(rows)


def test_detected(result):
    assert result["detected"] is True


def test_detected_at_within_window(result):
    assert "2026-11-03T14:00:00Z" <= result["detected_at"] <= "2026-11-03T14:15:00Z"


def test_no_alert_before_leak(result):
    assert result["estimated_start"] >= "2026-11-03T14:00:00Z"


def test_shut_in_within_window(result):
    assert "2026-11-05T10:00:00Z" <= result["shut_in_at"] <= "2026-11-05T10:15:00Z"


def test_duration_hours(result):
    assert abs(result["duration_hours"] - 44.0) <= 0.5


def test_deterministic(rows):
    assert detect.detect(rows) == detect.detect(rows)


def test_no_false_alarm_before_leak(rows):
    baseline = detect.compute_baseline(rows)
    before_leak = [row for row in rows if row["timestamp"] < "2026-11-03T14:00:00Z"]
    assert detect.detect_leak(before_leak, baseline) is None

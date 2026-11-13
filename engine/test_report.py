"""Tests for the Doude tamper-evident report."""

import hashlib
from datetime import datetime

import pytest

from engine import locate, report


def _parse_ts(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@pytest.fixture(scope="module")
def scenario():
    return locate.load_scenario()


@pytest.fixture(scope="module")
def response():
    return report.analyze()


def test_top_level_keys(response):
    assert set(response.keys()) == {
        "detected",
        "pipeline_id",
        "baseline",
        "leak",
        "quantification",
        "impact",
        "report",
    }


def test_report_hash_repeatable():
    first = report.analyze()
    second = report.analyze()
    assert first["report"]["report_hash"] == second["report"]["report_hash"]


def test_verify_and_tamper(response):
    assert report.verify(response) is True
    tampered = {k: v for k, v in response.items()}
    tampered["quantification"] = dict(response["quantification"])
    tampered["quantification"]["volume_m3"] = response["quantification"]["volume_m3"] + 1.0
    assert report.verify(tampered) is False


def test_input_hash(response):
    expected = "sha256:" + hashlib.sha256(report.DATA_FILE.read_bytes()).hexdigest()
    assert response["report"]["input_hash"] == expected


def test_pass_criteria(response, scenario):
    detected = _parse_ts(response["leak"]["detected_at"])
    leak_start = _parse_ts(scenario["timeline"]["leak_start"])
    assert detected >= leak_start
    assert (detected - leak_start).total_seconds() <= 15 * 60

    assert abs(response["leak"]["location_m"] - scenario["leak"]["location_m"]) <= 500

    volume = response["quantification"]["volume_m3"]
    truth = scenario["ground_truth"]["volume_released_m3"]
    assert abs(volume - truth) / truth * 100.0 <= 15.0

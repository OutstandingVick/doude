"""Tests that every scenario meets its own pass criteria."""

import json
from datetime import datetime
from pathlib import Path

import pytest

from engine import generate, report

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS = ["scenario_01", "scenario_02"]


def _parse(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


@pytest.mark.parametrize("name", SCENARIOS)
def test_scenario_pass_criteria(name, tmp_path):
    scenario_path = ROOT / "scenarios" / (name + ".json")
    scenario = json.loads(scenario_path.read_text())

    rows = generate.generate(scenario)
    csv_path = tmp_path / "readings.csv"
    generate.write_csv(rows, csv_path)

    result = report.analyze(csv_path, scenario_path)
    again = report.analyze(csv_path, scenario_path)

    # Repeatable: identical report hash across runs.
    assert result["report"]["report_hash"] == again["report"]["report_hash"]

    pc = scenario["pass_criteria"]
    gt = scenario["ground_truth"]

    assert result["detected"] is True, f"{name} was not detected"
    assert result["leak"] is not None

    detected = _parse(result["leak"]["detected_at"])
    leak_start = _parse(scenario["timeline"]["leak_start"])
    assert detected >= leak_start
    detect_minutes = (detected - leak_start).total_seconds() / 60
    assert detect_minutes <= pc["detect_within_minutes"], (
        f"{name}: detected {detect_minutes:.1f} min after leak, "
        f"limit {pc['detect_within_minutes']} min"
    )

    location = result["leak"]["location_m"]
    truth_location = scenario["leak"]["location_m"]
    location_error = abs(location - truth_location)
    assert location_error <= pc["location_tolerance_m"], (
        f"{name}: location error {location_error:.1f} m, "
        f"limit {pc['location_tolerance_m']} m"
    )

    volume = result["quantification"]["volume_m3"]
    truth_volume = gt["volume_released_m3"]
    volume_error_pct = abs(volume - truth_volume) / truth_volume * 100
    assert volume_error_pct <= pc["volume_tolerance_pct"], (
        f"{name}: volume error {volume_error_pct:.1f}%, "
        f"limit {pc['volume_tolerance_pct']}%"
    )
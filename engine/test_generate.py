"""Phase 1 checks. Run: python -m pytest engine -q"""
import csv
from statistics import mean

import pytest

from engine import generate as g


@pytest.fixture(scope="module")
def scenario():
    return g.load_scenario()


@pytest.fixture(scope="module")
def rows(tmp_path_factory, scenario):
    path = tmp_path_factory.mktemp("data") / "readings.csv"
    g.write_csv(g.generate(scenario), path)
    with path.open() as f:
        return list(csv.DictReader(f))


def window(rows, start, end):
    return [r for r in rows if start <= r["timestamp"] < end]


def imbalance(rs):
    return mean(float(r["q_in_m3s"]) - float(r["q_out_m3s"]) for r in rs)


def test_shape(rows):
    assert len(rows) == 7201
    assert list(rows[0]) == g.COLUMNS
    assert rows[0]["timestamp"] == "2026-11-01T00:00:00Z"
    assert rows[-1]["timestamp"] == "2026-11-06T00:00:00Z"


def test_no_gaps(rows):
    ts = [g.parse(r["timestamp"]) for r in rows]
    assert all((b - a).total_seconds() == 60 for a, b in zip(ts, ts[1:]))


def test_balanced_before_leak(rows):
    assert abs(imbalance(window(rows, "2026-11-01", "2026-11-03T14:00"))) < 0.0002


def test_leak_rate_during_leak(rows, scenario):
    truth = scenario["ground_truth"]["during_leak"]["q_leak_m3s"]
    got = imbalance(window(rows, "2026-11-03T14:05", "2026-11-05T10:00"))
    assert got == pytest.approx(truth, rel=0.02)


def test_inlet_pressure_drops(rows, scenario):
    before = mean(float(r["p_in_bar"]) for r in window(rows, "2026-11-03T12:00", "2026-11-03T14:00"))
    after = mean(float(r["p_in_bar"]) for r in window(rows, "2026-11-03T14:05", "2026-11-03T16:00"))
    assert before - after == pytest.approx(
        scenario["normal_operation"]["p_in_bar"] - scenario["ground_truth"]["during_leak"]["p_in_bar"], abs=0.05)


def test_zero_flow_after_shut_in(rows):
    after = window(rows, "2026-11-05T10:15", "2026-11-06T00:01")
    assert all(float(r["q_in_m3s"]) == 0 and float(r["q_out_m3s"]) == 0 for r in after)


def test_deterministic(tmp_path, scenario):
    a = g.write_csv(g.generate(scenario), tmp_path / "a.csv")
    b = g.write_csv(g.generate(scenario), tmp_path / "b.csv")
    assert a == b

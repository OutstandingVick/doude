"""Tests for the Doude environmental-impact engine."""

import math
from pathlib import Path

import pytest

from engine import detect, impact, locate, quantify


@pytest.fixture(scope="module")
def rows():
    return detect.load_readings(detect.DATA_FILE)


@pytest.fixture(scope="module")
def scenario():
    return locate.load_scenario()


@pytest.fixture(scope="module")
def detection(rows):
    return detect.detect(rows)


@pytest.fixture(scope="module")
def location(rows, detection, scenario):
    return locate.locate_leak(rows, detection, scenario)


@pytest.fixture(scope="module")
def quant(rows, detection, location, scenario):
    return quantify.quantify(rows, detection, location, scenario)


@pytest.fixture(scope="module")
def impact_result(detection, location, quant, scenario):
    return impact.estimate_impact(detection, location, quant, scenario)


def test_radius_increases_with_volume():
    assert impact.slick_radius_m(1000, 6, 850) > impact.slick_radius_m(500, 6, 850)


def test_radius_increases_with_hours():
    assert impact.slick_radius_m(500, 6, 850) > impact.slick_radius_m(500, 3, 850)


def test_radius_zero_for_zero_volume():
    assert impact.slick_radius_m(0.0, 6.0, 850.0) == 0.0


def test_polygon_closed_and_size():
    poly = impact.slick_polygon([6.0, 4.0], 500.0)
    assert len(poly) == impact.POLYGON_POINTS + 1
    assert poly[0] == poly[-1]


def test_drifted_center_distance(impact_result, location):
    distance = impact.drift_m(6)
    center = impact_result["center_lonlat"]
    lon1, lat1 = location["location_lonlat"]
    lon2, lat2 = center
    dlat = (lat2 - lat1) * 110540.0
    dlon = (lon2 - lon1) * 111320.0 * math.cos(math.radians(lat1))
    moved = math.hypot(dlon, dlat)
    assert abs(moved - distance) / distance <= 0.05


def test_area_within_range(impact_result):
    assert 0.5 <= impact_result["slick_area_m2"] / 1e6 <= 10.0


def test_none_when_not_detected(scenario):
    assert impact.estimate_impact({"detected": False}, None, None, scenario) is None


def test_no_ground_truth_in_source():
    text = Path(impact.__file__).read_text()
    assert "ground_truth" not in text

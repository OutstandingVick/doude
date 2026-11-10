"""Tests for the Doude leak-location engine."""

import pytest

from engine import detect, locate


@pytest.fixture(scope="module")
def rows():
    """Load the real readings file once for the whole module."""
    return detect.load_readings(detect.DATA_FILE)


@pytest.fixture(scope="module")
def scenario():
    """Load the scenario once for the whole module."""
    return locate.load_scenario()


@pytest.fixture(scope="module")
def detection(rows):
    """Run detection once for the whole module."""
    return detect.detect(rows)


@pytest.fixture(scope="module")
def result(rows, detection, scenario):
    """Run leak location once for the whole module."""
    return locate.locate_leak(rows, detection, scenario)


def test_location_m(result):
    assert abs(result["location_m"] - 13400) <= 500


def test_location_lonlat(result):
    lonlat = result["location_lonlat"]
    assert isinstance(lonlat, list) and len(lonlat) == 2
    assert all(isinstance(value, float) for value in lonlat)
    lon, lat = lonlat
    assert 6.20 <= lon <= 6.28
    assert 4.77 <= lat <= 4.93


def test_point_along_route_endpoints(scenario):
    route = scenario["pipeline"]["route_lonlat"]
    assert locate.point_along_route(0, scenario) == [
        round(float(route[0][0]), 5),
        round(float(route[0][1]), 5),
    ]
    assert locate.point_along_route(20000, scenario) == [
        round(float(route[-1][0]), 5),
        round(float(route[-1][1]), 5),
    ]


def test_pressure_gradient_increases_with_flow(scenario):
    assert locate.pressure_gradient(0.12, scenario) > locate.pressure_gradient(0.10, scenario)


def test_locate_leak_none_when_not_detected(rows, scenario):
    assert locate.locate_leak(rows, {"detected": False}, scenario) is None


def test_deterministic(rows, detection, scenario):
    first = locate.locate_leak(rows, detection, scenario)
    second = locate.locate_leak(rows, detection, scenario)
    assert first == second

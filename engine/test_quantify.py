"""Tests for the Doude volume-quantification engine."""

import pytest

from engine import detect, locate, quantify


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
def result(rows, detection, location, scenario):
    return quantify.quantify(rows, detection, location, scenario)


def test_volume_accuracy(result, scenario):
    truth = scenario["ground_truth"]["volume_released_m3"]
    assert abs(result["volume_m3"] - truth) / truth * 100.0 <= 15.0

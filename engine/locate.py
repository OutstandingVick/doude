"""Locate a leak along the pipeline from steady-state pressure gradients.

Averages the inlet/outlet pressure and flow over the steady leak period,
applies the gradient-intersection method to get a distance from the inlet,
then maps that distance onto the pipeline's geographic route.
"""

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
SCENARIO_FILE = ROOT / "scenario.json"


def _parse_ts(value: str) -> datetime:
    """Parse an ISO 8601 UTC timestamp (ending in ``Z``) into an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_scenario(path=SCENARIO_FILE) -> Dict:
    """Load the scenario JSON holding pipeline geometry and fluid properties."""
    with open(path) as handle:
        return json.load(handle)


def pressure_gradient(q, scenario) -> float:
    """Return the steady-state pressure gradient (bar per metre) for flow ``q``.

    Computes velocity v = Q/A, the Reynolds number, the Swamee-Jain
    friction factor, and the Darcy-Weisbach gradient in bar per metre.
    """
    if q <= 0:
        return 0.0
    pipe = scenario["pipeline"]
    fluid = scenario["fluid"]
    diameter = pipe["inner_diameter_m"]
    roughness = pipe["roughness_m"]
    density = fluid["density_kg_m3"]
    viscosity = fluid["viscosity_pa_s"]
    area = math.pi * diameter ** 2 / 4.0
    velocity = q / area
    reynolds = density * velocity * diameter / viscosity
    friction = 0.25 / (
        math.log10(roughness / (3.7 * diameter) + 5.74 / reynolds ** 0.9)
    ) ** 2
    return friction / diameter * density * velocity ** 2 / 2.0 / 1e5


def steady_window(
    rows: List[Dict], estimated_start: str, shut_in_at: str, settle_minutes: int = 15
) -> List[Dict]:
    """Return the steady leak-period rows, skipping transients at each end.

    Keeps rows with ``estimated_start + settle_minutes <= t < shut_in_at - settle_minutes``.
    """
    start_dt = _parse_ts(estimated_start) + timedelta(minutes=settle_minutes)
    end_dt = _parse_ts(shut_in_at) - timedelta(minutes=settle_minutes)
    return [row for row in rows if start_dt <= row["t"] < end_dt]


def point_along_route(x, scenario) -> List[float]:
    """Interpolate the [lon, lat] route point at distance ``x`` metres from the inlet.

    Each route segment's share of the total straight-line length (in degrees)
    is treated as its share of the pipeline length; the point is linearly
    interpolated and rounded to 5 decimal places.
    """
    route = scenario["pipeline"]["route_lonlat"]
    length = scenario["pipeline"]["length_m"]
    if x <= 0:
        return [round(float(route[0][0]), 5), round(float(route[0][1]), 5)]
    if x >= length:
        return [round(float(route[-1][0]), 5), round(float(route[-1][1]), 5)]
    segment_lengths = []
    total = 0.0
    for i in range(len(route) - 1):
        lon1, lat1 = route[i]
        lon2, lat2 = route[i + 1]
        distance = math.hypot(lon2 - lon1, lat2 - lat1)
        segment_lengths.append(distance)
        total += distance
    target = (x / length) * total
    accumulated = 0.0
    for i in range(len(route) - 1):
        distance = segment_lengths[i]
        if accumulated + distance >= target:
            fraction = 0.0 if distance == 0 else (target - accumulated) / distance
            lon1, lat1 = route[i]
            lon2, lat2 = route[i + 1]
            lon = lon1 + fraction * (lon2 - lon1)
            lat = lat1 + fraction * (lat2 - lat1)
            return [round(float(lon), 5), round(float(lat), 5)]
        accumulated += distance
    return [round(float(route[-1][0]), 5), round(float(route[-1][1]), 5)]


def _location_m(p_in, p_out, g_in, g_out, length) -> float:
    """Gradient-intersection leak distance (metres from the inlet), unclamped."""
    return (p_in - p_out - g_out * length) / (g_in - g_out)


def locate_leak(rows, detection, scenario) -> Optional[Dict]:
    """Locate the leak from steady leak-period averages.

    Returns ``None`` when ``detection["detected"]`` is false. Otherwise
    averages pressures and flows over the steady window, applies the
    gradient-intersection formula (clamped to [0, L]), and reports the
    location, its route position, an uncertainty estimate, and the window.
    """
    if not detection["detected"]:
        return None
    window = steady_window(
        rows, detection["estimated_start"], detection["shut_in_at"]
    )
    count = len(window)
    p_in = sum(row["p_in_bar"] for row in window) / count
    p_out = sum(row["p_out_bar"] for row in window) / count
    q_in = sum(row["q_in_m3s"] for row in window) / count
    q_out = sum(row["q_out_m3s"] for row in window) / count
    length = scenario["pipeline"]["length_m"]
    g_in = pressure_gradient(q_in, scenario)
    g_out = pressure_gradient(q_out, scenario)
    x = _location_m(p_in, p_out, g_in, g_out, length)
    x = max(0.0, min(length, x))
    uncertainty = 0.0
    for dp_in in (-0.05, 0.05):
        for dp_out in (-0.05, 0.05):
            alt = _location_m(p_in + dp_in, p_out + dp_out, g_in, g_out, length)
            alt = max(0.0, min(length, alt))
            uncertainty = max(uncertainty, abs(alt - x))
    return {
        "location_m": round(x, 1),
        "location_lonlat": point_along_route(x, scenario),
        "location_uncertainty_m": round(uncertainty),
        "averages": {
            "p_in_bar": p_in,
            "p_out_bar": p_out,
            "q_in_m3s": q_in,
            "q_out_m3s": q_out,
        },
        "window_start": window[0]["timestamp"],
        "window_end": window[-1]["timestamp"],
    }


if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(ROOT))
    from engine import detect

    rows = detect.load_readings(detect.DATA_FILE)
    scenario = load_scenario()
    detection = detect.detect(rows)
    result = locate_leak(rows, detection, scenario)
    print(json.dumps(result, indent=2))

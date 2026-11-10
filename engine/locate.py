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



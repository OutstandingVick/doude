"""Quantify the volume of oil released by a detected leak.

Combines a minute-by-minute mass balance over the leak window with a
steady-state cross-check, back-calculates the equivalent orifice diameter,
and produces an uncertainty band for the released volume.
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Optional

BBL_PER_M3 = 6.28981
DISCHARGE_COEFF = 0.61

ROOT = Path(__file__).resolve().parent.parent
SCENARIO_FILE = ROOT / "scenario.json"


def integrated_volume(rows: List[Dict], detection: Dict) -> float:
    """Released volume in m3 by minute-by-minute mass balance over the leak window."""
    imbalance_mean = detection["baseline"]["imbalance_mean"]
    total = 0.0
    for row in rows:
        if detection["estimated_start"] <= row["timestamp"] < detection["shut_in_at"]:
            total += (row["q_in_m3s"] - row["q_out_m3s"] - imbalance_mean) * 60.0
    return total


def steady_volume(location: Dict, detection: Dict) -> float:
    """Released volume in m3 from the steady-state average leak rate."""
    imbalance_mean = detection["baseline"]["imbalance_mean"]
    averages = location["averages"]
    leak_rate = averages["q_in_m3s"] - averages["q_out_m3s"] - imbalance_mean
    return leak_rate * detection["duration_hours"] * 3600.0


def pressure_at_leak(location: Dict, scenario: Dict) -> float:
    """Pressure in bar at the leak point, from inlet pressure and gradient."""
    from engine import locate

    averages = location["averages"]
    gradient = locate.pressure_gradient(averages["q_in_m3s"], scenario)
    return averages["p_in_bar"] - gradient * location["location_m"]


def equivalent_hole_diameter(
    leak_rate_m3s: float, p_leak_bar: float, scenario: Dict
) -> float:
    """Equivalent orifice diameter in metres from leak rate and pressure.

    Inverts Q = Cd * A * sqrt(2 P / rho) with P in Pa and A = pi * d^2 / 4.
    Returns 0.0 when the pressure is not positive.
    """
    if p_leak_bar <= 0:
        return 0.0
    density = scenario["fluid"]["density_kg_m3"]
    pressure_pa = p_leak_bar * 1e5
    area = leak_rate_m3s / (DISCHARGE_COEFF * math.sqrt(2.0 * pressure_pa / density))
    return math.sqrt(4.0 * area / math.pi)

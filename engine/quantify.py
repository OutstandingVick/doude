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


def volume_uncertainty_pct(rows: List[Dict], detection: Dict) -> float:
    """Percent uncertainty of the integrated volume.

    Adds flow-meter noise (2 * sd * sqrt(n) * 60) and baseline bias
    (2 * sd / sqrt(n_baseline) * 60 * n), divides by the integrated volume,
    and adds a fixed 5-point model allowance.
    """
    imbalance_std = detection["baseline"]["imbalance_std"]
    window = [
        row for row in rows
        if detection["estimated_start"] <= row["timestamp"] < detection["shut_in_at"]
    ]
    n = len(window)
    n_baseline = 2880
    volume = integrated_volume(rows, detection)
    meter_noise = 2.0 * imbalance_std * math.sqrt(n) * 60.0
    baseline_bias = 2.0 * imbalance_std / math.sqrt(n_baseline) * 60.0 * n
    pct = (meter_noise + baseline_bias) / volume * 100.0 + 5.0
    return round(pct, 1)


def quantify(
    rows: List[Dict], detection: Dict, location: Dict, scenario: Dict
) -> Optional[Dict]:
    """Summarize the released volume, leak rate, hole size, and uncertainty.

    Returns ``None`` when the detection reports no leak.
    """
    if not detection["detected"]:
        return None
    imbalance_mean = detection["baseline"]["imbalance_mean"]
    averages = location["averages"]
    leak_rate = averages["q_in_m3s"] - averages["q_out_m3s"] - imbalance_mean
    volume = integrated_volume(rows, detection)
    volume_m3 = round(volume, 1)
    volume_steady = steady_volume(location, detection)
    p_leak = pressure_at_leak(location, scenario)
    hole = equivalent_hole_diameter(leak_rate, p_leak, scenario)
    uncertainty = volume_uncertainty_pct(rows, detection)
    return {
        "leak_rate_m3s": round(leak_rate, 5),
        "volume_m3": volume_m3,
        "volume_bbl": round(volume_m3 * BBL_PER_M3),
        "volume_steady_m3": round(volume_steady, 1),
        "methods_agree_pct": round(abs(volume - volume_steady) / volume * 100.0, 2),
        "pressure_at_leak_bar": round(p_leak, 2),
        "equivalent_hole_mm": round(hole * 1000.0, 1),
        "uncertainty_pct": uncertainty,
        "volume_range_m3": [
            round(volume * (1.0 - uncertainty / 100.0), 1),
            round(volume * (1.0 + uncertainty / 100.0), 1),
        ],
        "method": "mass_balance",
        "cross_check": "steady_state_average",
    }

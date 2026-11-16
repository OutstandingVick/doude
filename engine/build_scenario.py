"""Doude — Day 1: build a test scenario ("fake world") and its ground truth.

Run:  python engine/build_scenario.py [--name NAME] [--hole-mm MM]
       [--leak-km KM] [--out PATH] [--detect-minutes N] [--location-tolerance-m M]

Writes the scenario JSON (default: scenario.json at the repo root). With no
arguments it regenerates the existing scenario byte-identically.

Physics (steady state, flat swamp terrain, incompressible crude):
  - Friction loss: Darcy-Weisbach, friction factor from Swamee-Jain.
  - Pump at inlet: P_in = P_shutoff - k * Q_in^2   (pressure falls as flow rises)
  - Delivery terminal at the outlet holds a fixed pressure P_out.
  - Leak: orifice equation Q_leak = Cd * A_hole * sqrt(2 * P_leak / rho).
With a leak, we solve for the flows that satisfy all of the above at once.
"""
import argparse
import json
import math
from datetime import datetime
from pathlib import Path

# ---------------- Fixed pipeline / fluid inputs ----------------
L = 20_000.0            # pipeline length, m
D = 0.30                # inner diameter, m (12")
EPS = 4.5e-5            # pipe roughness, m (commercial steel)
RHO = 850.0             # crude density, kg/m3
MU = 0.010              # crude viscosity, Pa.s (10 cP)
Q_NORMAL = 0.10         # normal flow, m3/s
P_IN_NORMAL = 50e5      # normal inlet pressure, Pa (50 bar)
P_SHUTOFF = 60e5        # pump shut-off pressure, Pa
CD = 0.61               # orifice discharge coefficient
LEAK_START = "2026-11-03T14:00:00Z"
SHUT_IN = "2026-11-05T10:00:00Z"   # JIV done, trunk line shut in

# ---------------- Scenario-specific defaults ----------------
DEFAULT_NAME = "Doude test scenario 01 — trunk line leak into creek"
DEFAULT_HOLE_MM = 25.0
DEFAULT_LEAK_KM = 13.4
DEFAULT_DETECT_MINUTES = 15
DEFAULT_LOCATION_TOLERANCE = 500
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "scenario.json"

AREA = math.pi * D**2 / 4
K_PUMP = (P_SHUTOFF - P_IN_NORMAL) / Q_NORMAL**2


def friction_factor(q):
    v = q / AREA
    re = RHO * v * D / MU
    return 0.25 / math.log10(EPS / (3.7 * D) + 5.74 / re**0.9) ** 2


def dp(q, length):
    """Pressure lost to friction over `length` metres at flow q (Pa)."""
    if q <= 0:
        return 0.0
    v = q / AREA
    return friction_factor(q) * (length / D) * RHO * v**2 / 2


# Normal operation sets the terminal (outlet) pressure.
P_OUT = P_IN_NORMAL - dp(Q_NORMAL, L)


def solve_with_leak(hole_d, leak_x):
    """Find Q_in such that the pressure at the outlet equals P_OUT."""
    hole_area = math.pi * hole_d**2 / 4

    def outlet_error(q_in):
        p_in = P_SHUTOFF - K_PUMP * q_in**2
        p_leak = p_in - dp(q_in, leak_x)
        q_leak = CD * hole_area * math.sqrt(2 * max(p_leak, 0) / RHO)
        q_out = q_in - q_leak
        return p_leak - dp(q_out, L - leak_x) - P_OUT, p_in, p_leak, q_leak, q_out

    lo, hi = Q_NORMAL, Q_NORMAL * 1.5
    for _ in range(200):  # bisection
        mid = (lo + hi) / 2
        if outlet_error(mid)[0] > 0:
            lo = mid
        else:
            hi = mid
    _, p_in, p_leak, q_leak, q_out = outlet_error((lo + hi) / 2)
    return dict(q_in=(lo + hi) / 2, p_in=p_in, p_leak=p_leak, q_leak=q_leak, q_out=q_out)


# Illustrative route through Bayelsa creeks (approximate, ~20 km, not a real asset).
route = [[6.2700, 4.9300], [6.2350, 4.8650], [6.2050, 4.7700]]  # [lon, lat]


def point_at(x):
    """Coordinate at distance x along the route (by segment length share)."""
    segs = []
    for a, b in zip(route, route[1:]):
        segs.append(math.dist(a, b))
    target = x / L * sum(segs)
    for (a, b), s in zip(zip(route, route[1:]), segs):
        if target <= s:
            f = target / s
            return [round(a[0] + f * (b[0] - a[0]), 5), round(a[1] + f * (b[1] - a[1]), 5)]
        target -= s
    return route[-1]


bar = lambda pa: round(pa / 1e5, 3)


def build_scenario(name=DEFAULT_NAME, hole_mm=DEFAULT_HOLE_MM, leak_km=DEFAULT_LEAK_KM,
                   detect_minutes=DEFAULT_DETECT_MINUTES,
                   location_tolerance_m=DEFAULT_LOCATION_TOLERANCE):
    """Build a scenario dict for a given hole size and leak position."""
    hole_d = hole_mm / 1000.0
    leak_x = leak_km * 1000.0

    leak = solve_with_leak(hole_d, leak_x)
    t0 = datetime.fromisoformat(LEAK_START.replace("Z", "+00:00"))
    t1 = datetime.fromisoformat(SHUT_IN.replace("Z", "+00:00"))
    duration_s = (t1 - t0).total_seconds()
    volume_m3 = leak["q_leak"] * duration_s
    BBL = 0.158987

    return {
        "name": name,
        "method_version": "doude-method v0.1",
        "pipeline": {
            "id": "BYS-TL-01",
            "type": "trunk_line",
            "note": "Trunk line: keeps flowing until JIV is conducted, then shut in.",
            "length_m": L,
            "inner_diameter_m": D,
            "roughness_m": EPS,
            "terrain_at_leak": "water",
            "route_lonlat": route,
            "route_note": "Illustrative coordinates near Yenagoa, Bayelsa. Not a real asset.",
        },
        "fluid": {"name": "crude oil", "density_kg_m3": RHO, "viscosity_pa_s": MU},
        "sensors": {
            "inlet": {"distance_m": 0, "measures": ["pressure_bar", "flow_m3s"]},
            "outlet": {"distance_m": L, "measures": ["pressure_bar", "flow_m3s"]},
            "sample_interval_s": 60,
            "noise": {"pressure_bar_sd": 0.05, "flow_m3s_sd": 0.0005},
        },
        "normal_operation": {
            "flow_m3s": Q_NORMAL,
            "flow_bbl_day": round(Q_NORMAL * 86400 / BBL),
            "p_in_bar": bar(P_IN_NORMAL),
            "p_out_bar": bar(P_OUT),
            "pump_shutoff_bar": bar(P_SHUTOFF),
        },
        "timeline": {
            "data_start": "2026-11-01T00:00:00Z",
            "leak_start": LEAK_START,
            "shut_in_after_jiv": SHUT_IN,
            "data_end": "2026-11-06T00:00:00Z",
        },
        "leak": {
            "location_m": leak_x,
            "location_lonlat": point_at(leak_x),
            "hole_diameter_m": hole_d,
            "discharge_coefficient": CD,
        },
        "ground_truth": {
            "during_leak": {
                "q_in_m3s": round(leak["q_in"], 5),
                "q_out_m3s": round(leak["q_out"], 5),
                "q_leak_m3s": round(leak["q_leak"], 5),
                "p_in_bar": bar(leak["p_in"]),
                "p_out_bar": bar(P_OUT),
                "p_at_leak_bar": bar(leak["p_leak"]),
            },
            "duration_hours": duration_s / 3600,
            "volume_released_m3": round(volume_m3, 1),
            "volume_released_bbl": round(volume_m3 / BBL),
            "excluded": "Drain-down of the isolated segment after shut-in is not counted in v0.1.",
        },
        "pass_criteria": {
            "detect_within_minutes": detect_minutes,
            "location_tolerance_m": location_tolerance_m,
            "volume_tolerance_pct": 15,
            "repeatable": "Same input data must give an identical report and SHA-256 hash.",
        },
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build a Doude test scenario.")
    parser.add_argument("--name", default=DEFAULT_NAME)
    parser.add_argument("--hole-mm", type=float, default=DEFAULT_HOLE_MM)
    parser.add_argument("--leak-km", type=float, default=DEFAULT_LEAK_KM)
    parser.add_argument("--detect-minutes", type=int, default=DEFAULT_DETECT_MINUTES)
    parser.add_argument("--location-tolerance-m", type=float, default=DEFAULT_LOCATION_TOLERANCE)
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    scenario = build_scenario(
        name=args.name,
        hole_mm=args.hole_mm,
        leak_km=args.leak_km,
        detect_minutes=args.detect_minutes,
        location_tolerance_m=args.location_tolerance_m,
    )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(scenario, indent=2) + "\n")
    print(json.dumps({"name": scenario["name"], "leak": scenario["leak"],
                      "ground_truth": scenario["ground_truth"],
                      "pass_criteria": scenario["pass_criteria"]}, indent=2))


if __name__ == "__main__":
    main()
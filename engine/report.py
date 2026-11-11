"""Tamper-evident spill report and the /analyze response.

Runs the full chain (detect -> locate -> quantify -> impact) and wraps the
results in the API contract shape, with SHA-256 hashes over the input file
and the report so results are repeatable and tamper-evident.
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "readings.csv"
SCENARIO = ROOT / "scenario.json"

if __package__ in (None, ""):
    sys.path.insert(0, str(ROOT))

from engine import detect, locate, quantify, impact


def sha256_file(path) -> str:
    """Return ``sha256:<hex>`` of the file bytes at ``path``."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def canonical_hash(obj) -> str:
    """Return ``sha256:<hex>`` of the canonical JSON encoding of ``obj``."""
    encoded = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _hash_input(response: Dict) -> Dict:
    """Return the response with ``report_hash`` and ``generated_at`` removed."""
    out = {}
    for key, value in response.items():
        if key == "report":
            out[key] = {
                k: v for k, v in value.items()
                if k not in ("report_hash", "generated_at")
            }
        else:
            out[key] = value
    return out


def analyze(readings_path=DATA_FILE, scenario_path=SCENARIO) -> Dict:
    """Run the full chain and return the /analyze contract response."""
    rows = detect.load_readings(readings_path)
    scenario = locate.load_scenario(scenario_path)
    detection = detect.detect(rows)
    location = locate.locate_leak(rows, detection, scenario)
    quant = quantify.quantify(rows, detection, location, scenario)
    impact_result = impact.estimate_impact(detection, location, quant, scenario)

    baseline = detection["baseline"]
    baseline_contract = {
        "q_in_m3s": round(baseline["q_in_mean"], 5),
        "q_out_m3s": round(baseline["q_out_mean"], 5),
        "p_in_bar": round(baseline["p_in_mean"], 3),
        "p_out_bar": round(baseline["p_out_mean"], 3),
        "window_start": baseline["window_start"],
        "window_end": baseline["window_end"],
    }

    leak_contract = None
    if detection["detected"]:
        leak_contract = {
            "detected_at": detection["detected_at"],
            "estimated_start": detection["estimated_start"],
            "shut_in_at": detection["shut_in_at"],
            "duration_hours": round(detection["duration_hours"], 2),
            "location_m": location["location_m"],
            "location_lonlat": location["location_lonlat"],
            "location_uncertainty_m": location["location_uncertainty_m"],
            "pipeline_type": scenario["pipeline"]["type"],
            "terrain": scenario["pipeline"]["terrain_at_leak"],
        }

    quant_contract = None
    if detection["detected"] and quant is not None:
        quant_contract = {
            "leak_rate_m3s": quant["leak_rate_m3s"],
            "volume_m3": quant["volume_m3"],
            "volume_bbl": quant["volume_bbl"],
            "volume_steady_m3": quant["volume_steady_m3"],
            "methods_agree_pct": quant["methods_agree_pct"],
            "equivalent_hole_mm": quant["equivalent_hole_mm"],
            "pressure_at_leak_bar": quant["pressure_at_leak_bar"],
            "uncertainty_pct": quant["uncertainty_pct"],
            "volume_range_m3": quant["volume_range_m3"],
            "method": quant["method"],
            "cross_check": quant["cross_check"],
        }

    response = {
        "detected": detection["detected"],
        "pipeline_id": scenario["pipeline"]["id"],
        "baseline": baseline_contract,
        "leak": leak_contract,
        "quantification": quant_contract,
        "impact": impact_result,
        "report": {
            "method_version": scenario["method_version"],
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "input_hash": sha256_file(readings_path),
            "report_hash": None,
        },
    }
    response["report"]["report_hash"] = canonical_hash(_hash_input(response))
    return response

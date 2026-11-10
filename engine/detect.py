"""Leak and shut-in detection for the Doude oil pipeline.

Reads per-minute sensor readings, establishes a baseline from the first
48 hours of normal operation, then flags a leak (a sustained flow
imbalance) and a shut-in (both flows dropping to zero).
"""

import csv
import json
from datetime import datetime
from pathlib import Path
from statistics import mean, pstdev
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "readings.csv"


def _parse_ts(value: str) -> datetime:
    """Parse an ISO 8601 UTC timestamp (ending in ``Z``) into an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_readings(path) -> List[Dict]:
    """Read a readings CSV into a list of row dicts.

    Keeps ``timestamp`` as the original string, adds ``t`` as a
    timezone-aware UTC datetime, and parses the four numeric columns
    as floats.
    """
    rows: List[Dict] = []
    with open(path, newline="") as handle:
        for record in csv.DictReader(handle):
            rows.append(
                {
                    "timestamp": record["timestamp"],
                    "t": _parse_ts(record["timestamp"]),
                    "p_in_bar": float(record["p_in_bar"]),
                    "p_out_bar": float(record["p_out_bar"]),
                    "q_in_m3s": float(record["q_in_m3s"]),
                    "q_out_m3s": float(record["q_out_m3s"]),
                }
            )
    return rows


def compute_baseline(rows: List[Dict], hours: int = 48) -> Dict:
    """Compute baseline statistics from the first ``hours`` hours of rows.

    Returns the mean and population standard deviation of the flow
    imbalance (q_in - q_out), each flow, and each pressure, together
    with the window start and end timestamps as strings.
    """
    window = rows[: hours * 60]
    imbalances = [row["q_in_m3s"] - row["q_out_m3s"] for row in window]
    q_ins = [row["q_in_m3s"] for row in window]
    q_outs = [row["q_out_m3s"] for row in window]
    p_ins = [row["p_in_bar"] for row in window]
    p_outs = [row["p_out_bar"] for row in window]
    return {
        "imbalance_mean": mean(imbalances),
        "imbalance_std": pstdev(imbalances),
        "q_in_mean": mean(q_ins),
        "q_in_std": pstdev(q_ins),
        "q_out_mean": mean(q_outs),
        "q_out_std": pstdev(q_outs),
        "p_in_mean": mean(p_ins),
        "p_in_std": pstdev(p_ins),
        "p_out_mean": mean(p_outs),
        "p_out_std": pstdev(p_outs),
        "window_start": window[0]["timestamp"],
        "window_end": window[-1]["timestamp"],
    }


def detect_leak(
    rows: List[Dict],
    baseline: Dict,
    k: float = 5.0,
    confirm_minutes: int = 5,
) -> Optional[Dict]:
    """Detect a leak in the rows after the baseline window.

    A row is an alert when its flow imbalance exceeds
    ``imbalance_mean + k * imbalance_std`` and q_in is above 0.001. The
    leak is confirmed once that condition holds for ``confirm_minutes``
    consecutive rows. Returns the start and detection timestamps of the
    first such run, or ``None`` if no leak is detected.
    """
    threshold = baseline["imbalance_mean"] + k * baseline["imbalance_std"]
    window_end = baseline["window_end"]

    start_index: Optional[int] = None
    for index, row in enumerate(rows):
        if row["timestamp"] > window_end:
            start_index = index
            break
    if start_index is None:
        return None

    run_start: Optional[Dict] = None
    run_length = 0
    for row in rows[start_index:]:
        imbalance = row["q_in_m3s"] - row["q_out_m3s"]
        is_alert = imbalance > threshold and row["q_in_m3s"] > 0.001
        if is_alert:
            if run_start is None:
                run_start = row
            run_length += 1
            if run_length >= confirm_minutes:
                return {
                    "detected_at": row["timestamp"],
                    "estimated_start": run_start["timestamp"],
                }
        else:
            run_start = None
            run_length = 0
    return None


def find_shut_in(rows: List[Dict], after_ts: str) -> Optional[str]:
    """Return the first timestamp after ``after_ts`` where both flows are
    below 0.001, or ``None`` if the line never shuts in."""
    for row in rows:
        if (
            row["timestamp"] > after_ts
            and row["q_in_m3s"] < 0.001
            and row["q_out_m3s"] < 0.001
        ):
            return row["timestamp"]
    return None


def detect(rows: List[Dict]) -> Dict:
    """Run baseline, leak, and shut-in detection and summarize the result."""
    baseline = compute_baseline(rows)
    leak = detect_leak(rows, baseline)
    detected = leak is not None
    detected_at = leak["detected_at"] if leak else None
    estimated_start = leak["estimated_start"] if leak else None
    shut_in_at = find_shut_in(rows, estimated_start) if detected else None
    duration_hours: Optional[float] = None
    if detected and shut_in_at is not None:
        duration_hours = (
            _parse_ts(shut_in_at) - _parse_ts(estimated_start)
        ).total_seconds() / 3600.0
    return {
        "detected": detected,
        "baseline": baseline,
        "detected_at": detected_at,
        "estimated_start": estimated_start,
        "shut_in_at": shut_in_at,
        "duration_hours": duration_hours,
    }


if __name__ == "__main__":
    result = detect(load_readings(DATA_FILE))
    print(json.dumps(result, indent=2))

"""Doude — Phase 1: generate the sensor feed for a scenario.

Run from the repo root:
    python engine/generate.py

Reads scenario.json and produces one reading per minute at the inlet and
outlet sensors: normal operation -> leak -> shut-in after JIV.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def fmt(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_scenario(path: Path = ROOT / "scenario.json") -> dict:
    return json.loads(path.read_text())


def timeline(s: dict) -> list[datetime]:
    t = parse(s["timeline"]["data_start"])
    end = parse(s["timeline"]["data_end"])
    step = timedelta(seconds=s["sensors"]["sample_interval_s"])
    out = []
    while t <= end:
        out.append(t)
        t += step
    return out


def true_state(s: dict, t: datetime) -> dict:
    """Noise-free sensor values at time t."""
    n = s["normal_operation"]
    return {"p_in_bar": n["p_in_bar"], "p_out_bar": n["p_out_bar"],
            "q_in_m3s": n["flow_m3s"], "q_out_m3s": n["flow_m3s"]}


def generate(s: dict) -> list[dict]:
    rows = []
    for t in timeline(s):
        r = true_state(s, t)
        rows.append({"timestamp": fmt(t), **{k: round(v, 5) for k, v in r.items()}})
    return rows


def main():
    rows = generate(load_scenario())
    print(f"generated {len(rows)} rows")
    for r in rows[::1440]:
        print(r)


if __name__ == "__main__":
    main()

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


def main():
    ts = timeline(load_scenario())
    print(f"{len(ts)} timestamps: {fmt(ts[0])} -> {fmt(ts[-1])}")


if __name__ == "__main__":
    main()

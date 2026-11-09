"""Doude — Phase 1: generate the sensor feed for a scenario.

Run from the repo root:
    python engine/generate.py

Reads scenario.json and produces one reading per minute at the inlet and
outlet sensors: normal operation -> leak -> shut-in after JIV.
Fixed random seed, so the same scenario always gives a byte-identical file.
"""
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = 42
ONSET_MINUTES = 2        # leak opens over 2 minutes
SHUT_IN_MINUTES = 10     # valves close over 10 minutes
STATIC_BAR = 2.0         # pressure left in the isolated, depressurised line
DEMAND_SWING = 0.005     # +/-0.5% daily throughput swing (same at both ends)

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


def blend(a: float, b: float, f: float) -> float:
    return a + (b - a) * min(max(f, 0.0), 1.0)


def true_state(s: dict, t: datetime) -> dict:
    """Noise-free sensor values at time t."""
    n = s["normal_operation"]
    leak = s["ground_truth"]["during_leak"]
    t_leak = parse(s["timeline"]["leak_start"])
    t_shut = parse(s["timeline"]["shut_in_after_jiv"])

    normal = {"p_in_bar": n["p_in_bar"], "p_out_bar": n["p_out_bar"],
              "q_in_m3s": n["flow_m3s"], "q_out_m3s": n["flow_m3s"]}
    leaking = {"p_in_bar": leak["p_in_bar"], "p_out_bar": leak["p_out_bar"],
               "q_in_m3s": leak["q_in_m3s"], "q_out_m3s": leak["q_out_m3s"]}
    static = {"p_in_bar": STATIC_BAR, "p_out_bar": STATIC_BAR,
              "q_in_m3s": 0.0, "q_out_m3s": 0.0}

    if t < t_leak:
        state = dict(normal)
        # Daily demand swing: changes throughput but not the in/out balance.
        hours = (t - parse(s["timeline"]["data_start"])).total_seconds() / 3600
        k = 1 + DEMAND_SWING * math.sin(2 * math.pi * hours / 24)
        state["q_in_m3s"] *= k
        state["q_out_m3s"] *= k
        return state
    if t < t_shut:
        f = (t - t_leak).total_seconds() / 60 / ONSET_MINUTES
        return {k: blend(normal[k], leaking[k], f) for k in normal}
    f = (t - t_shut).total_seconds() / 60 / SHUT_IN_MINUTES
    return {k: blend(leaking[k], static[k], f) for k in normal}


def add_noise(state: dict, s: dict, rng: random.Random) -> dict:
    sd_p = s["sensors"]["noise"]["pressure_bar_sd"]
    sd_q = s["sensors"]["noise"]["flow_m3s_sd"]
    out = {}
    for k, v in state.items():
        if k.startswith("p_"):
            out[k] = v + rng.gauss(0, sd_p)
        else:
            # A meter on a stopped line reads zero, not negative flow.
            out[k] = 0.0 if v == 0.0 else max(v + rng.gauss(0, sd_q), 0.0)
    return out


def generate(s: dict) -> list[dict]:
    rng = random.Random(SEED)
    rows = []
    for t in timeline(s):
        r = add_noise(true_state(s, t), s, rng)
        rows.append({"timestamp": fmt(t), **{k: round(v, 5) for k, v in r.items()}})
    return rows


def main():
    rows = generate(load_scenario())
    print(f"generated {len(rows)} rows")
    for r in rows[::1440]:
        print(r)


if __name__ == "__main__":
    main()

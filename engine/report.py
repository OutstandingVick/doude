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

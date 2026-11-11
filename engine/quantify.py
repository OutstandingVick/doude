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

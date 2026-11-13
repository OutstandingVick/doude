"""EGASPIN Form A draft (notification) generated from sensor analysis.

This is a DRAFT to help the operator prepare the official NOSDRA/NUPRC
Form A within 24 hours. It must be verified against the official template
before submission, and does not claim to be the official form.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SLATE = colors.HexColor("#111827")
BODY = colors.HexColor("#374151")
MUTED = colors.HexColor("#6B7280")
TEAL = colors.HexColor("#14B8A6")
AMBER = colors.HexColor("#F59E0B")
RULE = colors.HexColor("#E5E7EB")

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_STYLES = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=SLATE),
    "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=SLATE),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=13, textColor=BODY),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED),
    "mono": ParagraphStyle("mono", fontName="Courier", fontSize=7, leading=9, textColor=SLATE),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=BODY),
    "cell_bold": ParagraphStyle("cell_bold", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=SLATE),
    "banner": ParagraphStyle("banner", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.HexColor("#92400E")),
}


def _parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _fmt_utc(value):
    d = _parse_ts(value)
    if d is None:
        return str(value)
    return "%02d %s %d, %02d:%02d UTC" % (
        d.day, _MONTHS[d.month - 1], d.year, d.hour, d.minute,
    )


def _fmt_int(value):
    return "{:,}".format(int(round(value)))


def _fmt_num(value, dp=1):
    return "{:,.{digits}f}".format(value, digits=dp)


def _deadline_utc(detected_at):
    d = _parse_ts(detected_at)
    if d is None:
        return None
    d = d.astimezone(timezone.utc) + timedelta(hours=24)
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def _P(text, style):
    return Paragraph(text, _STYLES[style])


def form_a_data(response, scenario) -> Dict:
    """Return Form A draft fields as JSON data."""
    leak = response.get("leak") or {}
    quant = response.get("quantification") or {}
    pipeline = scenario.get("pipeline") or {}
    fluid = scenario.get("fluid") or {}
    lonlat = leak.get("location_lonlat") or [None, None]
    detected_at = leak.get("detected_at")

    return {
        "draft": True,
        "reference": "SPL-0001-A",
        "spill_id": "SPL-0001",
        "pipeline": {
            "id": response.get("pipeline_id", ""),
            "type": leak.get("pipeline_type") or pipeline.get("type", ""),
            "fluid": fluid.get("name", ""),
            "length_m": pipeline.get("length_m"),
            "diameter_m": pipeline.get("inner_diameter_m"),
        },
        "incident": {
            "spill_began_utc": leak.get("estimated_start"),
            "detected_utc": detected_at,
            "shut_in_utc": leak.get("shut_in_at"),
            "deadline_utc": _deadline_utc(detected_at),
        },
        "location": {
            "distance_m": leak.get("location_m"),
            "latitude": lonlat[1],
            "longitude": lonlat[0],
            "terrain": leak.get("terrain"),
            "uncertainty_m": leak.get("location_uncertainty_m"),
        },
        "quantity": {
            "volume_bbl": quant.get("volume_bbl"),
            "volume_m3": quant.get("volume_m3"),
            "volume_range_m3": quant.get("volume_range_m3"),
            "method": "pressure/flow mass balance, doude-method v0.1",
            "uncertainty_pct": quant.get("uncertainty_pct"),
        },
        "cause": "Under investigation — to be established at JIV",
        "immediate_actions": "Line shut in at %s" % leak.get("shut_in_at"),
        "integrity": {
            "report_hash": response.get("report", {}).get("report_hash", ""),
            "input_hash": response.get("report", {}).get("input_hash", ""),
        },
    }

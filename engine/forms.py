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


def _banner() -> List[Flowable]:
    text = ("DRAFT — verify against the official NOSDRA/NUPRC Form A "
            "template before submission")
    t = Table([[_P(text, "banner")]], colWidths=[A4[0] - 36 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
        ("BOX", (0, 0), (-1, -1), 0.5, AMBER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [t, Spacer(1, 6 * mm)]


def _section_heading(text) -> List[Flowable]:
    rule = Table([[""]], colWidths=[A4[0] - 36 * mm], rowHeights=[1])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TEAL)]))
    return [_P(text, "h2"), rule, Spacer(1, 2 * mm)]


def _pairs(pairs) -> Table:
    rows = [[_P(k, "cell"), _P(v, "cell_bold")] for k, v in pairs]
    t = Table(rows, colWidths=[70 * mm, A4[0] - 36 * mm - 70 * mm])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


class BlankLines(Flowable):
    def __init__(self, n=3, h=9 * mm):
        super().__init__()
        self.n = n
        self.line_h = h

    def wrap(self, availWidth, availHeight):
        return (availWidth, self.n * self.line_h)

    def draw(self):
        c = self.canv
        c.saveState()
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        for i in range(self.n):
            y = self.height - (i + 1) * self.line_h
            c.line(0, y, self.width, y)
        c.restoreState()


def _signature_block() -> List[Flowable]:
    fields = ["Name", "Designation", "Organisation", "Signature", "Date"]
    rows = [[_P(f, "cell")] for f in fields]
    t = Table(rows, colWidths=[A4[0] - 36 * mm])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return [t, Spacer(1, 6 * mm)]


def build_form_a(response, scenario, out_path) -> Path:
    """Build the Form A draft PDF and return its path."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = form_a_data(response, scenario)
    pipeline = data["pipeline"]
    incident = data["incident"]
    location = data["location"]
    quantity = data["quantity"]

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Doude Form A (Draft)",
    )

    story: List[Flowable] = []
    story.append(_P("Oil Spill Notification — Form A (Draft)", "title"))
    story.append(_P("Reference %s" % data["reference"], "subtitle"))
    story.append(Spacer(1, 3 * mm))
    story += _banner()

    story += _section_heading("1 · Facility / asset")
    story.append(_pairs([
        ("Pipeline id", pipeline["id"]),
        ("Pipeline type", pipeline["type"]),
        ("Fluid", pipeline["fluid"]),
        ("Length", "%s km" % _fmt_num((pipeline["length_m"] or 0) / 1000.0, 1)),
        ("Diameter", "%s m" % pipeline["diameter_m"]),
    ]))
    story.append(Spacer(1, 4 * mm))

    story += _section_heading("2 · Incident")
    story.append(_pairs([
        ("Spill began", _fmt_utc(incident["spill_began_utc"])),
        ("Detected", _fmt_utc(incident["detected_utc"])),
        ("Line shut in", _fmt_utc(incident["shut_in_utc"])),
    ]))
    story.append(Spacer(1, 1 * mm))
    deadline = _fmt_utc(incident["deadline_utc"])
    dl = Table([[_P("Notification deadline", "cell_bold"), _P(deadline, "cell_bold")]],
               colWidths=[70 * mm, A4[0] - 36 * mm - 70 * mm])
    dl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
        ("BOX", (0, 0), (-1, -1), 0.5, AMBER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(dl)
    story.append(Spacer(1, 4 * mm))

    story += _section_heading("3 · Location")
    story.append(_pairs([
        ("KM along pipeline", "%.2f" % ((location["distance_m"] or 0) / 1000.0)),
        ("Coordinates (lat, lon)", "%.5f, %.5f" % (
            location["latitude"] or 0, location["longitude"] or 0)),
        ("Terrain", location["terrain"] or ""),
        ("Uncertainty", "±%s m" % _fmt_int(location["uncertainty_m"] or 0)),
    ]))
    story.append(Spacer(1, 4 * mm))

    story += _section_heading("4 · Estimated quantity")
    story.append(_pairs([
        ("Volume", "%s bbl (%s m³)" % (_fmt_int(quantity["volume_bbl"]), _fmt_num(quantity["volume_m3"]))),
        ("Range", "%s – %s m³" % (
            _fmt_num(quantity["volume_range_m3"][0]), _fmt_num(quantity["volume_range_m3"][1]))),
        ("Method", quantity["method"]),
        ("Uncertainty", "±%s%%" % quantity["uncertainty_pct"]),
    ]))
    story.append(Spacer(1, 4 * mm))

    story += _section_heading("5 · Cause")
    story.append(_P(data["cause"], "body"))
    story.append(Spacer(1, 2 * mm))
    story.append(BlankLines(3))
    story.append(Spacer(1, 4 * mm))

    story += _section_heading("6 · Immediate actions")
    story.append(_P(data["immediate_actions"], "body"))
    story.append(Spacer(1, 2 * mm))
    story.append(BlankLines(2))
    story.append(Spacer(1, 4 * mm))

    story += _section_heading("7 · Integrity")
    story.append(_P("Report hash", "cell_bold"))
    story.append(_P(data["integrity"]["report_hash"], "mono"))
    story.append(Spacer(1, 1 * mm))
    story.append(_P("Input hash", "cell_bold"))
    story.append(_P(data["integrity"]["input_hash"], "mono"))
    story.append(Spacer(1, 6 * mm))

    story += _section_heading("Signature")
    story += _signature_block()

    doc.build(story)
    return out_path
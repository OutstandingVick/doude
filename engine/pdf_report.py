"""Spill report PDF generator (reportlab).

Builds a clean, professional A4 portrait PDF from the ``/analyze`` response,
with a tamper-evident integrity section and a page footer.
"""

from datetime import datetime
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
from reportlab.pdfgen import canvas

SLATE = colors.HexColor("#111827")
BODY = colors.HexColor("#374151")
MUTED = colors.HexColor("#6B7280")
TEAL = colors.HexColor("#14B8A6")
RED = colors.HexColor("#EF4444")
AMBER = colors.HexColor("#F59E0B")
RULE = colors.HexColor("#E5E7EB")

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

_STYLES = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=SLATE),
    "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=SLATE),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=13, textColor=BODY),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED),
    "mono": ParagraphStyle("mono", fontName="Courier", fontSize=7, leading=9, textColor=SLATE),
    "kpi_label": ParagraphStyle("kpi_label", fontName="Helvetica", fontSize=7.5, leading=10, textColor=MUTED),
    "kpi_value": ParagraphStyle("kpi_value", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=SLATE),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=BODY),
    "cell_bold": ParagraphStyle("cell_bold", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=SLATE),
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


def _minutes_between(a, b):
    da, db = _parse_ts(a), _parse_ts(b)
    if da is None or db is None:
        return None
    return int((db - da).total_seconds() // 60)


def _P(text, style):
    return Paragraph(text, _STYLES[style])


def _section_heading(text) -> List[Flowable]:
    rule = Table(
        [[""]], colWidths=[A4[0] - 36 * mm],
        rowHeights=[1],
    )
    rule.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL),
    ]))
    return [_P(text, "h2"), rule, Spacer(1, 3 * mm)]


def _header_band(response, scenario) -> List[Flowable]:
    pipeline = scenario.get("pipeline", {})
    generated = response.get("report", {}).get("generated_at", "")
    out = []
    out.append(_P("DOUDE — Spill Report", "title"))
    out.append(Spacer(1, 1 * mm))
    out.append(_P(
        "<font color='#14B8A6'>SPL-0001</font> · %s · %s · generated %s"
        % (response.get("pipeline_id", ""), pipeline.get("type", ""), _fmt_utc(generated)),
        "subtitle",
    ))
    out.append(Spacer(1, 1 * mm))
    out.append(_P("Every spill found, measured and recorded.", "subtitle"))
    out.append(Spacer(1, 4 * mm))
    return out


def _summary_box(response) -> List[Flowable]:
    leak = response.get("leak") or {}
    quant = response.get("quantification") or {}
    lonlat = leak.get("location_lonlat") or [None, None]
    minutes = _minutes_between(leak.get("estimated_start"), leak.get("detected_at"))
    figures = [
        ("VOLUME RELEASED",
         "%s bbl" % _fmt_int(quant.get("volume_bbl", 0)),
         "%s m³ · ±%s%%" % (_fmt_num(quant.get("volume_m3", 0)), quant.get("uncertainty_pct", 0))),
        ("LOCATION",
         "KM %.2f ±%s m" % (leak.get("location_m", 0) / 1000.0, _fmt_int(leak.get("location_uncertainty_m", 0))),
         "%.5f, %.5f" % (lonlat[0] or 0, lonlat[1] or 0)),
        ("DETECTED",
         _fmt_utc(leak.get("detected_at")),
         "%s min after deviation" % (minutes if minutes is not None else "—")),
        ("RELEASE DURATION",
         "%.1f h" % leak.get("duration_hours", 0),
         "Shut in %s" % _fmt_utc(leak.get("shut_in_at"))),
    ]
    data = []
    for label, value, sub in figures:
        data.append([_P(label, "kpi_label"), _P(value, "kpi_value"), _P(sub, "small")])
    t = Table(data, colWidths=[(A4[0] - 36 * mm) / 4.0] * 4)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [t, Spacer(1, 6 * mm)]


def _label_value_pairs(pairs) -> Table:
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


def _timeline_section(response) -> List[Flowable]:
    baseline = response.get("baseline") or {}
    leak = response.get("leak") or {}
    pairs = [
        ("Baseline window", "%s → %s" % (_fmt_utc(baseline.get("window_start")), _fmt_utc(baseline.get("window_end")))),
        ("Deviation began", _fmt_utc(leak.get("estimated_start"))),
        ("Detected", _fmt_utc(leak.get("detected_at"))),
        ("Line shut in", _fmt_utc(leak.get("shut_in_at"))),
    ]
    return [_label_value_pairs(pairs), Spacer(1, 6 * mm)]


_QUANT_ROWS = [
    ("Mean leak rate", lambda q: "%s m³/s" % _fmt_num(q["leak_rate_m3s"], 5), "Average inflow minus outflow over the leak window."),
    ("Volume (mass balance)", lambda q: "%s m³" % _fmt_num(q["volume_m3"], 1), "Total released from deviation start to shut-in."),
    ("Steady-state cross-check", lambda q: "%s m³" % _fmt_num(q["volume_steady_m3"], 1), "Mean leak rate times duration, for cross-checking."),
    ("Methods agree", lambda q: "%s%%" % q["methods_agree_pct"], "Agreement between mass balance and steady-state methods."),
    ("Pressure at leak", lambda q: "%s bar" % _fmt_num(q["pressure_at_leak_bar"], 2), "Pressure at the breach point, from the inlet gradient."),
    ("Equivalent hole diameter", lambda q: "%s mm" % _fmt_num(q["equivalent_hole_mm"], 1), "Diameter of a round hole that would leak at this rate."),
    ("Uncertainty", lambda q: "±%s%%" % q["uncertainty_pct"], "Meter noise plus baseline bias plus a model allowance."),
    ("Volume range", lambda q: "%s – %s m³" % (_fmt_num(q["volume_range_m3"][0], 1), _fmt_num(q["volume_range_m3"][1], 1)), "Low and high bound of the uncertainty band."),
]


def _quantification_section(response) -> List[Flowable]:
    q = response.get("quantification") or {}
    if not q:
        return [_P("No quantification available.", "body")]
    header = [_P("Field", "cell_bold"), _P("Value", "cell_bold"), _P("Meaning", "cell_bold")]
    rows = [header]
    for label, render, note in _QUANT_ROWS:
        rows.append([_P(label, "cell"), _P(render(q), "cell_bold"), _P(note, "small")])
    t = Table(rows, colWidths=[40 * mm, 60 * mm, A4[0] - 36 * mm - 100 * mm])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 1, SLATE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return [t, Spacer(1, 6 * mm)]


class PipelineDrawing(Flowable):
    def __init__(self, location_m, uncertainty_m, length_m):
        super().__init__()
        self.location_m = location_m
        self.uncertainty_m = uncertainty_m
        self.length_m = length_m or 1.0

    def wrap(self, availWidth, availHeight):
        return (availWidth, 34 * mm)

    def draw(self):
        c = self.canv
        w = self.width
        x0, x1 = 6, w - 6
        y = 14 * mm
        c.saveState()
        c.setStrokeColor(SLATE)
        c.setLineWidth(3)
        c.line(x0, y, x1, y)
        c.setFont("Helvetica", 8.5)
        c.setFillColor(SLATE)
        c.drawString(x0, y + 3 * mm, "Inlet (0.0 km)")
        c.drawRightString(x1, y + 3 * mm, "Outlet (%.1f km)" % (self.length_m / 1000.0))
        frac = self.location_m / self.length_m
        x = x0 + frac * (x1 - x0)
        half = (self.uncertainty_m / self.length_m) * (x1 - x0)
        c.setStrokeColor(AMBER)
        c.setLineWidth(7)
        c.setLineCap(1)
        c.line(max(x0, x - half), y, min(x1, x + half), y)
        c.setStrokeColor(RED)
        c.setLineWidth(2)
        c.line(x, y - 3.5 * mm, x, y + 3.5 * mm)
        c.setFillColor(RED)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawCentredString(x, y - 6 * mm, "%.1f km" % (self.location_m / 1000.0))
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawCentredString(x, y - 11 * mm, "±%s m" % _fmt_int(self.uncertainty_m))
        c.restoreState()


def _location_section(response, scenario) -> List[Flowable]:
    leak = response.get("leak") or {}
    length_m = scenario.get("pipeline", {}).get("length_m", 20000.0)
    drawing = PipelineDrawing(leak.get("location_m", 0), leak.get("location_uncertainty_m", 0), length_m)
    return [drawing, Spacer(1, 6 * mm)]


def _impact_section(response) -> List[Flowable]:
    impact = response.get("impact") or {}
    if not impact or not impact.get("polygon_lonlat"):
        return [_P("Impact not modelled for this terrain.", "body")]
    area_km2 = impact.get("slick_area_m2", 0) / 1e6
    pairs = [
        ("Terrain", str(impact.get("type", ""))),
        ("Model", impact.get("model", "")),
        ("Hours modelled", "%s h" % impact.get("hours_modelled", "")),
        ("Slick area", "%.2f km²" % area_km2),
        ("Slick radius", "%s m" % _fmt_int(impact.get("slick_radius_m", 0))),
        ("Volume spread", "%s m³" % _fmt_num(impact.get("volume_spread_m3", 0))),
    ]
    out = [_label_value_pairs(pairs), Spacer(1, 2 * mm)]
    out.append(_P(
        "Snapshot %s h after leak start. Full-duration spreading is not modelled in v0.1."
        % impact.get("hours_modelled", ""), "small"))
    out.append(Spacer(1, 6 * mm))
    return out


def build_spill_report(response, scenario, out_path) -> Path:
    """Build the spill-report PDF and return its path."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="Doude Spill Report",
        author="Doude",
    )

    story = _header_band(response, scenario)
    if response.get("detected"):
        story += _summary_box(response)
        story += _section_heading("Timeline")
        story += _timeline_section(response)
        story += _section_heading("Quantification")
        story += _quantification_section(response)
        story += _section_heading("Location")
        story += _location_section(response, scenario)
        story += _section_heading("Impact")
        story += _impact_section(response)
    else:
        story += _P("No spill detected", "h2")

    doc.build(story)
    return out_path

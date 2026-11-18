"""Regulator reports for Doude (reportlab PDFs).

Adds three reports alongside the existing spill report and Form A draft:

* compliance status (per pipeline or all spills),
* audit & integrity (per spill),
* period summary (date range).

All reports are built from stored spill records and the audit log only. They
reuse the spill report's styles, colours and numbered footer, and format every
number through :func:`engine.fmt.round_half_up`.
"""

import hashlib
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle

from engine import db, forms, pdf_report
from engine.fmt import round_half_up
from engine.pdf_report import (
    AMBER,
    MUTED,
    RED,
    RULE,
    SLATE,
    TEAL,
    _P,
    _fmt_int,
    _fmt_num,
    _fmt_utc,
    _label_value_pairs,
    _parse_ts,
    _section_heading,
)

METHOD_VERSION = "doude-method v0.1"
CONTENT_WIDTH = A4[0] - 36 * mm
M3_PER_BBL = 0.158987294928

_STATUS_ORDER = ["detected", "jiv", "cleanup", "closed"]
_STATUS_LABEL = {"detected": "Detected", "jiv": "JIV", "cleanup": "Clean-up", "closed": "Closed"}

REPORT_TYPES = [
    {
        "id": "spill",
        "name": "Spill report",
        "description": "Volume, location, timeline, impact and method for one spill.",
        "scope": "spill",
        "params": ["spill_id"],
    },
    {
        "id": "form-a",
        "name": "Form A draft",
        "description": "Pre-filled NOSDRA Form A notification draft for one spill.",
        "scope": "spill",
        "params": ["spill_id"],
    },
    {
        "id": "compliance",
        "name": "Compliance status",
        "description": "Form A, JIV, Form B/C deadlines and overdue items per spill.",
        "scope": "pipeline",
        "params": ["pipeline_id?"],
    },
    {
        "id": "audit",
        "name": "Audit & integrity",
        "description": "Full audit log, evidence fingerprints and hash-chain verification.",
        "scope": "spill",
        "params": ["spill_id"],
    },
    {
        "id": "period",
        "name": "Period summary",
        "description": "Spills, volume and time to detect for a date range, by pipeline and terrain.",
        "scope": "period",
        "params": ["from", "to"],
    },
]
REPORT_TYPE_IDS = [t["id"] for t in REPORT_TYPES]


class ReportError(ValueError):
    """Raised for missing or invalid report parameters (HTTP 400/404)."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- helpers


def _utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return _utc(dt).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _fmt_day(dt: Optional[datetime]) -> str:
    if dt is None:
        return "—"
    return "%02d %s %d" % (dt.day, pdf_report._MONTHS[dt.month - 1], dt.year)


def _doc(buffer, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=18 * mm, title=title, author="Doude",
    )


def _header(title: str, subtitle: str, generated_at: datetime) -> List:
    return [
        _P("DOUDE — %s" % title, "title"),
        Spacer(1, 1 * mm),
        _P("%s · generated %s" % (subtitle, _fmt_utc(_iso(generated_at))), "subtitle"),
        Spacer(1, 1 * mm),
        _P("Every spill found, measured and recorded.", "subtitle"),
        Spacer(1, 4 * mm),
    ]


def _kpi_box(figures: List[Tuple[str, str, str]]) -> List:
    row = [[[_P(label, "kpi_label"), _P(value, "kpi_value"), _P(sub, "small")]
            for label, value, sub in figures]]
    t = Table(row, colWidths=[CONTENT_WIDTH / len(figures)] * len(figures))
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


def _grid(header: List[str], rows: List[List], widths: List[float],
          highlight_rows: Optional[List[int]] = None) -> Table:
    data = [[_P(h, "cell_bold") for h in header]]
    for r in rows:
        data.append([c if not isinstance(c, str) else _P(c, "cell") for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 1, SLATE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in highlight_rows or []:
        style.append(("BACKGROUND", (0, i + 1), (-1, i + 1), colors.HexColor("#FEF2F2")))
    t.setStyle(TableStyle(style))
    return t


def _build(story: List, title: str, fingerprint: str) -> bytes:
    buffer = io.BytesIO()
    _doc(buffer, title).build(
        story, canvasmaker=pdf_report._make_canvas(fingerprint, METHOD_VERSION))
    return buffer.getvalue()


def _short(h: Optional[str], n: int = 16) -> str:
    if not h:
        return "—"
    return h.replace("sha256:", "")[:n]


# ---------------------------------------------------------- compliance


def _status_reached_at(audit: List[Dict], status: str) -> Optional[datetime]:
    for entry in audit:
        if entry.get("action") != "status_changed":
            continue
        detail = json.loads(entry["detail_json"]) if entry.get("detail_json") else {}
        if detail.get("to") == status:
            return _parse_ts(entry.get("at"))
    return None


def compliance_items(spill: Dict, audit: List[Dict], now: datetime,
                     form_a: Optional[Dict] = None) -> Dict:
    """Return the regulatory obligations for one spill.

    Due dates follow the dashboard's regulatory timeline: Form A 24 h after
    detection, JIV one day after shut-in, Form B 14 days and Form C 30 days
    after detection. Form A is met when its filing is recorded
    (``form_a_filed``). Forms B/C and the JIV are not filed separately in
    Doude v0.1, so they count as met when the spill status reaches the
    matching stage (JIV, clean-up, closed).
    """
    detected = _parse_ts(spill.get("detected_at"))
    shut_in = _parse_ts(spill.get("shut_in_at"))
    status = spill.get("status") or "detected"
    idx = _STATUS_ORDER.index(status) if status in _STATUS_ORDER else 0

    def item(name, due, met_status):
        met_idx = _STATUS_ORDER.index(met_status)
        done_at = _status_reached_at(audit, met_status) if idx >= met_idx else None
        done = idx >= met_idx
        late = bool(due and ((done_at and done_at > due) or (not done and now > due)))
        overdue = bool(due and not done and now > due)
        return {"name": name, "due": due, "done": done, "done_at": done_at,
                "late": late, "overdue": overdue}

    form_a_due = detected + timedelta(hours=24) if detected else None
    filed_at = _parse_ts(form_a.get("filed_at")) if form_a else None
    items = [
        {"name": "Form A", "due": form_a_due, "done": bool(form_a), "done_at": filed_at,
         "late": bool(form_a_due and ((filed_at and filed_at > form_a_due)
                                      or (not form_a and now > form_a_due))),
         "overdue": bool(form_a_due and not form_a and now > form_a_due),
         "reference": (form_a or {}).get("reference")},
        item("JIV", shut_in + timedelta(days=1) if shut_in else None, "jiv"),
        item("Form B", detected + timedelta(days=14) if detected else None, "cleanup"),
        item("Form C", detected + timedelta(days=30) if detected else None, "closed"),
    ]
    end = _status_reached_at(audit, "closed") if status == "closed" else now
    days_open = int((end - detected).total_seconds() // 86400) if detected and end else None
    return {"items": items, "days_open": days_open, "status": status}


def _item_cell(it: Dict) -> str:
    if it["done"]:
        when = _fmt_day(it["done_at"]) if it["done_at"] else "done"
        text = "%s %s" % ("Filed" if it["name"] == "Form A" else "Done", when)
        if it.get("reference"):
            text += "<br/>ref %s" % _escape(str(it["reference"]))
        return text + (" <font color='#EF4444'>(late)</font>" if it["late"] else "")
    due = "due %s" % _fmt_day(it["due"])
    if it["overdue"]:
        return "<font color='#EF4444'><b>OVERDUE</b> · %s</font>" % due
    return "Pending · %s" % due


def build_compliance(conn, pipeline_id: Optional[str], now: Optional[datetime] = None) -> bytes:
    now = _utc(now or datetime.now(timezone.utc))
    spills = db.list_spills(conn, pipeline_id)
    rows, highlight, overdue_total = [], [], 0
    for i, s in enumerate(sorted(spills, key=lambda x: x["id"])):
        audit = [dict(a) for a in conn.execute(
            "SELECT action, at, detail_json FROM audit_log WHERE spill_id = ? ORDER BY id",
            (s["id"],)).fetchall()]
        c = compliance_items(s, audit, now, db.form_a_status(conn, s["id"]))
        overdue = sum(1 for it in c["items"] if it["overdue"])
        overdue_total += overdue
        if overdue:
            highlight.append(i)
        rows.append(
            ["<b>%s</b><br/>%s" % (s["id"], s.get("pipeline_id") or ""),
             _STATUS_LABEL.get(c["status"], c["status"]),
             "%s d" % c["days_open"] if c["days_open"] is not None else "—"]
            + [_item_cell(it) for it in c["items"]])

    scope = "Pipeline %s" % pipeline_id if pipeline_id else "All pipelines"
    story = _header("Compliance Status Report", scope, now)
    open_count = sum(1 for s in spills if s.get("status") != "closed")
    story += _kpi_box([
        ("SPILLS", str(len(spills)), scope),
        ("OPEN", str(open_count), "not yet closed"),
        ("OVERDUE ITEMS", str(overdue_total), "past due and not met"),
        ("AS OF", _fmt_day(now), _fmt_utc(_iso(now))),
    ])
    story += _section_heading("Obligations by spill")
    if rows:
        w = CONTENT_WIDTH
        story.append(_grid(
            ["Spill", "Status", "Open", "Form A (24 h)", "JIV", "Form B (14 d)", "Form C (30 d)"],
            rows, [w * 0.14, w * 0.09, w * 0.07, w * 0.175, w * 0.175, w * 0.175, w * 0.175],
            highlight))
    else:
        story.append(_P("No spills recorded for this scope.", "body"))
    story += [Spacer(1, 4 * mm), _P(
        "Due dates: Form A 24 h after detection; JIV 1 day after shut-in; Form B 14 days and "
        "Form C 30 days after detection. Form A is met when its filing is recorded in Doude. "
        "JIV, Form B and Form C are not filed separately in v0.1: they count as met when the "
        "spill status reaches JIV, clean-up or closed. Rows with overdue items are "
        "highlighted.", "small")]
    return _build(story, "Doude Compliance Status Report", "compliance")


# --------------------------------------------------------------- audit


def build_audit(conn, spill_id: str, now: Optional[datetime] = None) -> bytes:
    now = _utc(now or datetime.now(timezone.utc))
    spill = db.get_spill(conn, spill_id)
    if spill is None:
        raise ReportError("unknown spill id", 404)
    chain = db.verify_audit_chain(conn)
    report_hash = spill.get("report_hash") or ""

    story = _header("Audit & Integrity Report",
                    "<font color='#14B8A6'>%s</font> · %s" % (spill_id, spill.get("pipeline_id", "")),
                    now)
    chain_text = ("<font color='#14B8A6'>Verified</font>" if chain["ok"]
                  else "<font color='#EF4444'>Broken at entry %s</font>" % chain["broken_at"])
    story += _kpi_box([
        ("AUDIT CHAIN", chain_text, "%s entries checked" % chain["entries"]),
        ("SPILL ENTRIES", str(len(spill["audit"])), "for %s" % spill_id),
        ("EVIDENCE FILES", str(len(spill["evidence"])), "SHA-256 fingerprinted"),
        ("STATUS", _STATUS_LABEL.get(spill.get("status"), spill.get("status") or "—"),
         "updated %s" % _fmt_utc(spill.get("updated_at"))),
    ])

    story += _section_heading("Integrity")
    story.append(_label_value_pairs([
        ("Input hash", "<font name='Courier' size='7'>%s</font>" % (spill.get("input_hash") or "—")),
        ("Report hash", "<font name='Courier' size='7'>%s</font>" % (report_hash or "—")),
        ("Audit chain verification",
         "OK — %s entries, no breaks" % chain["entries"] if chain["ok"]
         else "FAILED — first break at entry %s of %s" % (chain["broken_at"], chain["entries"])),
    ]))
    story += [Spacer(1, 2 * mm), _P(
        "Each audit entry stores the SHA-256 of the previous entry plus its own content. "
        "Verification recomputes every hash from the first entry; any edited, removed or "
        "reordered entry breaks the chain.", "small"), Spacer(1, 6 * mm)]

    story += _section_heading("Audit log")
    w = CONTENT_WIDTH
    rows = []
    for a in spill["audit"]:
        detail = a.get("detail_json") or ""
        rows.append([_fmt_utc(a.get("at")), a.get("actor") or "", a.get("action") or "",
                     "<font name='Courier' size='6.5'>%s</font>" % _escape(detail),
                     "<font name='Courier' size='6.5'>%s</font>" % _short(a.get("entry_hash"), 12)])
    story.append(_grid(["Time", "Actor", "Action", "Detail", "Entry hash"], rows,
                       [w * 0.2, w * 0.15, w * 0.18, w * 0.33, w * 0.14])
                 if rows else _P("No audit entries.", "body"))
    story.append(Spacer(1, 6 * mm))

    story += _section_heading("Evidence")
    ev_rows = [[e.get("filename") or "", e.get("content_type") or "",
                _fmt_size(e.get("size_bytes") or 0),
                e.get("uploaded_by") or "", _fmt_utc(e.get("uploaded_at")),
                "<font name='Courier' size='6'>%s</font>" % (e.get("sha256") or "")]
               for e in spill["evidence"]]
    story.append(_grid(["File", "Type", "Size", "By", "Uploaded", "SHA-256"], ev_rows,
                       [w * 0.15, w * 0.11, w * 0.08, w * 0.12, w * 0.16, w * 0.38])
                 if ev_rows else _P("No evidence files uploaded.", "body"))
    return _build(story, "Doude Audit & Integrity Report", report_hash or spill_id)


def _fmt_size(n: int) -> str:
    if n < 1024:
        return "%s B" % _fmt_int(n)
    return "%s KB" % _fmt_num(n / 1024.0, 1)


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# -------------------------------------------------------------- period


def _parse_day(value: Optional[str], name: str) -> datetime:
    if not value:
        raise ReportError("%s is required (YYYY-MM-DD)" % name)
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise ReportError("%s must be a date (YYYY-MM-DD)" % name)


def period_summary(conn, date_from: str, date_to: str) -> Dict:
    start = _parse_day(date_from, "from")
    end = _parse_day(date_to, "to") + timedelta(days=1)  # inclusive end day
    if end <= start:
        raise ReportError("'to' must be on or after 'from'")
    spills = []
    for s in db.list_spills(conn):
        d = _parse_ts(s.get("detected_at"))
        if d and start <= _utc(d) < end:
            spills.append(s)

    def group(key_fn):
        out = {}
        for s in spills:
            g = out.setdefault(key_fn(s), {"count": 0, "bbl": 0, "m3": 0.0, "detect_min": []})
            g["count"] += 1
            g["bbl"] += s.get("volume_bbl") or 0
            g["m3"] += s.get("volume_m3") or 0.0
            m = _detect_minutes(s)
            if m is not None:
                g["detect_min"].append(m)
        return out

    terrain = {}
    for row in conn.execute("SELECT id, terrain_at_leak FROM pipelines").fetchall():
        terrain[row["id"]] = row["terrain_at_leak"] or "unknown"
    total = group(lambda s: "all").get("all", {"count": 0, "bbl": 0, "m3": 0.0, "detect_min": []})
    return {
        "from": start, "to": end - timedelta(days=1), "spills": spills, "total": total,
        "by_pipeline": group(lambda s: s.get("pipeline_id") or "unknown"),
        "by_terrain": group(lambda s: terrain.get(s.get("pipeline_id"), "unknown")),
    }


def _detect_minutes(s: Dict) -> Optional[float]:
    a, b = _parse_ts(s.get("estimated_start")), _parse_ts(s.get("detected_at"))
    if a is None or b is None:
        return None
    return (b - a).total_seconds() / 60.0


def _avg(values: List[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


def _fmt_minutes(value: Optional[float]) -> str:
    return "—" if value is None else "%s min" % _fmt_num(value, 1)


def _bar_chart(groups: Dict) -> Drawing:
    names = sorted(groups)
    values = [round_half_up(groups[n]["bbl"]) for n in names]
    width, height = CONTENT_WIDTH, 60 * mm
    d = Drawing(width, height)
    chart = VerticalBarChart()
    chart.x, chart.y = 40, 22
    chart.width, chart.height = width - 60, height - 40
    chart.data = [values or [0]]
    chart.categoryAxis.categoryNames = names or ["—"]
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7.5
    chart.categoryAxis.labels.fillColor = MUTED
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = MUTED
    chart.valueAxis.labelTextFormat = lambda v: "{:,}".format(int(round_half_up(v)))
    chart.valueAxis.strokeColor = RULE
    chart.categoryAxis.strokeColor = RULE
    chart.bars[0].fillColor = TEAL
    chart.bars[0].strokeColor = None
    chart.barWidth = 6
    chart.groupSpacing = 6 * max(1, 6 - len(names))  # keep bars slim when few groups
    chart.barLabelFormat = lambda v: "{:,}".format(int(round_half_up(v)))
    chart.barLabels.fontName = "Helvetica-Bold"
    chart.barLabels.fontSize = 7
    chart.barLabels.fillColor = colors.HexColor("#111827")
    chart.barLabels.nudge = 6
    d.add(chart)
    d.add(String(0, height - 8, "Volume released by pipeline (bbl)",
                 fontName="Helvetica-Bold", fontSize=8.5, fillColor=SLATE))
    return d


def _group_rows(groups: Dict) -> List[List[str]]:
    rows = []
    for name in sorted(groups):
        g = groups[name]
        rows.append([name, str(g["count"]), _fmt_int(g["bbl"]), _fmt_num(g["m3"], 1),
                     _fmt_minutes(_avg(g["detect_min"]))])
    return rows


def build_period(conn, date_from: str, date_to: str, now: Optional[datetime] = None) -> bytes:
    now = _utc(now or datetime.now(timezone.utc))
    p = period_summary(conn, date_from, date_to)
    span = "%s – %s" % (_fmt_day(p["from"]), _fmt_day(p["to"]))
    total = p["total"]
    story = _header("Period Summary", span, now)
    story += _kpi_box([
        ("SPILLS", str(total["count"]), span),
        ("VOLUME RELEASED", "%s bbl" % _fmt_int(total["bbl"]),
         "%s m³" % _fmt_num(total["m3"], 1)),
        ("AVG TIME TO DETECT", _fmt_minutes(_avg(total["detect_min"])), "deviation → detection"),
        ("PIPELINES", str(len(p["by_pipeline"])), "with spills in period"),
    ])
    w = CONTENT_WIDTH
    widths = [w * 0.3, w * 0.12, w * 0.18, w * 0.18, w * 0.22]
    header = ["Group", "Spills", "Volume (bbl)", "Volume (m³)", "Avg time to detect"]
    if total["count"]:
        story.append(_bar_chart(p["by_pipeline"]))
        story.append(Spacer(1, 4 * mm))
    story += _section_heading("By pipeline")
    story.append(_grid(header, _group_rows(p["by_pipeline"]), widths)
                 if p["by_pipeline"] else _P("No spills detected in this period.", "body"))
    story.append(Spacer(1, 6 * mm))
    story += _section_heading("By terrain")
    story.append(_grid(header, _group_rows(p["by_terrain"]), widths)
                 if p["by_terrain"] else _P("No spills detected in this period.", "body"))
    story.append(Spacer(1, 6 * mm))
    story += _section_heading("Spills in period")
    rows = [[s["id"], s.get("pipeline_id") or "", _fmt_utc(s.get("detected_at")),
             _fmt_int(s.get("volume_bbl") or 0), _fmt_minutes(_detect_minutes(s)),
             _STATUS_LABEL.get(s.get("status"), s.get("status") or "")]
            for s in sorted(p["spills"], key=lambda x: x["id"])]
    story.append(_grid(["Spill", "Pipeline", "Detected", "bbl", "Time to detect", "Status"], rows,
                       [w * 0.13, w * 0.17, w * 0.25, w * 0.12, w * 0.18, w * 0.15])
                 if rows else _P("No spills detected in this period.", "body"))
    return _build(story, "Doude Period Summary", "period")


# ------------------------------------------------------- spill + form A


def _spill_analysis(conn, spill_id: Optional[str]) -> Tuple[Dict, str]:
    if not spill_id:
        raise ReportError("spill_id is required")
    spill = db.get_spill(conn, spill_id)
    if spill is None:
        raise ReportError("unknown spill id", 404)
    if not spill.get("analysis"):
        raise ReportError("spill has no stored analysis", 404)
    return spill["analysis"], spill_id


def _file_bytes(builder, *args) -> bytes:
    import os
    import tempfile
    fd, name = tempfile.mkstemp(suffix=".pdf", prefix="doude-")
    os.close(fd)
    try:
        builder(*(args + (name,)))
        with open(name, "rb") as f:
            return f.read()
    finally:
        os.unlink(name)


# ---------------------------------------------------------------- entry


def generate(conn, report_type: str, scenario: Dict, spill_id: Optional[str] = None,
             pipeline_id: Optional[str] = None, date_from: Optional[str] = None,
             date_to: Optional[str] = None) -> Tuple[bytes, Dict]:
    """Build a report and return ``(pdf_bytes, params)``.

    ``params`` holds only the parameters that apply to this report type.
    """
    if report_type == "spill":
        analysis, sid = _spill_analysis(conn, spill_id)
        return _file_bytes(pdf_report.build_spill_report, analysis, scenario), {"spill_id": sid}
    if report_type == "form-a":
        analysis, sid = _spill_analysis(conn, spill_id)
        return _file_bytes(forms.build_form_a, analysis, scenario), {"spill_id": sid}
    if report_type == "compliance":
        return build_compliance(conn, pipeline_id or None), {"pipeline_id": pipeline_id or None}
    if report_type == "audit":
        if not spill_id:
            raise ReportError("spill_id is required")
        return build_audit(conn, spill_id), {"spill_id": spill_id}
    if report_type == "period":
        return build_period(conn, date_from, date_to), {"from": date_from, "to": date_to}
    raise ReportError("unknown report type", 404)


def sha256_hex(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()

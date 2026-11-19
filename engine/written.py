"""Regulator-authored reports: Form A/B/C, custom builds and saved templates.

* **Form A** — spill notification, due within 24 hours of detection.
* **Form B** — spill response report, due within 2 weeks (cause, impact,
  initial clean-up).
* **Form C** — clean-up completion report.
* **Custom** — a PDF assembled from chosen sections of a spill's record.

Field schemas live here so the API, the app and the PDF share one
definition. Fields are pre-filled from the stored spill record where Feasibility3D
knows the answer; everything else is typed by the regulator. Saved reports
are immutable: editing creates a new report, and each one is logged to the
audit chain with the SHA-256 of its PDF.
"""

import io
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Spacer, Table, TableStyle

from engine import db, pdf_report, reports
from engine.pdf_report import _P, _fmt_int, _fmt_num, _fmt_utc, _section_heading

FORM_KINDS = ["form-a", "form-b", "form-c", "custom"]


def _f(key, label, kind="text", required=False, options=None, hint=None):
    out = {"key": key, "label": label, "type": kind, "required": required}
    if options:
        out["options"] = options
    if hint:
        out["hint"] = hint
    return out


FORMS = {
    "form-a": {
        "id": "form-a",
        "name": "Form A — Spill notification",
        "description": "Alert the regulator within 24 hours of a spill.",
        "due": "24 hours after detection",
        "fields": [
            _f("company_name", "Company name", required=True),
            _f("address", "Company address", required=True),
            _f("facility", "Facility or equipment", required=True),
            _f("location", "Location", required=True),
            _f("coordinate_format", "Coordinate format", "select",
               options=["Decimal degrees (DD)", "Degrees minutes seconds (DMS)"]),
            _f("latitude", "Latitude", "number", required=True),
            _f("longitude", "Longitude", "number", required=True),
            _f("date_observed", "Date observed", "datetime", required=True),
            _f("terrain", "Terrain", "select", options=["Land", "Swamp", "Water", "Offshore"]),
            _f("estimated_volume_bbl", "Estimated volume (bbl)", "number"),
            _f("extent_of_pollution", "Extent of pollution", "textarea", required=True),
            _f("suspected_cause", "Suspected cause", "textarea"),
            _f("immediate_actions", "Immediate actions taken", "textarea"),
            _f("reported_by", "Reported by", required=True),
        ],
    },
    "form-b": {
        "id": "form-b",
        "name": "Form B — Spill response",
        "description": "Cause, impact and initial clean-up, within 2 weeks.",
        "due": "14 days after detection",
        "fields": [
            _f("cause", "Cause of spill", "select", required=True,
               options=["Equipment failure", "Corrosion", "Sabotage / third-party interference",
                        "Operational error", "Natural cause", "Under investigation"]),
            _f("cause_details", "Cause details", "textarea", required=True),
            _f("jiv_date", "JIV date", "datetime"),
            _f("jiv_participants", "JIV participants", "textarea",
               hint="Regulator, operator, community and security representatives present."),
            _f("volume_spilled_bbl", "Volume spilled (bbl)", "number", required=True),
            _f("volume_recovered_bbl", "Volume recovered so far (bbl)", "number"),
            _f("area_affected_m2", "Area affected (m²)", "number"),
            _f("impact_description", "Impact on environment and communities", "textarea",
               required=True),
            _f("containment_measures", "Containment measures", "textarea", required=True),
            _f("cleanup_started", "Clean-up started", "datetime"),
            _f("cleanup_contractor", "Clean-up contractor"),
            _f("prepared_by", "Prepared by", required=True),
        ],
    },
    "form-c": {
        "id": "form-c",
        "name": "Form C — Clean-up report",
        "description": "Clean-up completion, recovery and remediation status.",
        "due": "After clean-up is completed",
        "fields": [
            _f("cleanup_completed", "Clean-up completed", "datetime", required=True),
            _f("methods_used", "Clean-up methods used", "textarea", required=True),
            _f("volume_recovered_bbl", "Total volume recovered (bbl)", "number", required=True),
            _f("waste_generated", "Waste generated and disposal", "textarea", required=True),
            _f("area_remediated_m2", "Area remediated (m²)", "number"),
            _f("remediation_status", "Remediation status", "select", required=True,
               options=["Completed", "Ongoing", "Monitoring", "Not started"]),
            _f("post_cleanup_inspection", "Post clean-up inspection", "textarea"),
            _f("certified_by", "Certified by", required=True),
        ],
    },
    "custom": {
        "id": "custom",
        "name": "Custom report",
        "description": "Pick sections from the spill record and add your own notes.",
        "due": None,
        "fields": [
            _f("summary", "Summary / notes", "textarea"),
            _f("prepared_by", "Prepared by", required=True),
        ],
    },
}

SECTIONS = [
    {"id": "summary", "name": "Key figures"},
    {"id": "timeline", "name": "Timeline"},
    {"id": "quantification", "name": "Quantification"},
    {"id": "location", "name": "Location"},
    {"id": "impact", "name": "Impact"},
    {"id": "compliance", "name": "Compliance status"},
    {"id": "audit", "name": "Audit log"},
    {"id": "evidence", "name": "Evidence"},
    {"id": "method", "name": "Method & integrity"},
]
SECTION_IDS = [s["id"] for s in SECTIONS]

SCHEMA = """
CREATE TABLE IF NOT EXISTS written_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spill_id TEXT REFERENCES spills(id),
    kind TEXT NOT NULL,
    title TEXT,
    fields_json TEXT,
    sections_json TEXT,
    template_id INTEGER,
    sha256 TEXT,
    created_by TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS report_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    fields_json TEXT,
    sections_json TEXT,
    created_by TEXT,
    created_at TEXT,
    deleted_at TEXT
);
"""


class FormError(ValueError):
    def __init__(self, message: str, status: int = 400, fields: Optional[List[str]] = None):
        super().__init__(message)
        self.status = status
        self.fields = fields or []


def init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


def form_list() -> List[Dict]:
    return [FORMS[k] for k in FORM_KINDS]


def _kind(kind: str) -> Dict:
    if kind not in FORMS:
        raise FormError("unknown form type", 404)
    return FORMS[kind]


# ------------------------------------------------------------ prefill


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def prefill(conn: sqlite3.Connection, kind: str, spill_id: str, scenario: Dict) -> Dict:
    """Return field values Feasibility3D can fill from the stored spill record."""
    _kind(kind)
    spill = db.get_spill(conn, spill_id)
    if spill is None:
        raise FormError("unknown spill id", 404)
    analysis = spill.get("analysis") or {}
    leak = analysis.get("leak") or {}
    quant = analysis.get("quantification") or {}
    impact = analysis.get("impact") or {}
    pipeline = scenario.get("pipeline") or {}
    fluid = (scenario.get("fluid") or {}).get("name", "")
    lon, lat = (leak.get("location_lonlat") or [None, None])[:2]
    km = leak.get("location_m")
    terrain = (leak.get("terrain") or pipeline.get("terrain_at_leak") or "").capitalize()
    volume = quant.get("volume_bbl")

    if kind == "form-a":
        return {
            "facility": "%s (%s, %s)" % (spill.get("pipeline_id"), (pipeline.get("type") or "")
                                         .replace("_", " "), fluid),
            "location": "KM %s on %s" % (_fmt_num(km / 1000.0, 2), spill.get("pipeline_id"))
            if km is not None else "",
            "coordinate_format": "Decimal degrees (DD)",
            "latitude": round(lat, 5) if lat is not None else None,
            "longitude": round(lon, 5) if lon is not None else None,
            "date_observed": spill.get("detected_at"),
            "terrain": terrain if terrain in ("Land", "Swamp", "Water", "Offshore") else None,
            "estimated_volume_bbl": volume,
            "extent_of_pollution": (
                "Modelled slick of %s km² after %s h (%s)." % (
                    _fmt_num((impact.get("slick_area_m2") or 0) / 1e6, 2),
                    impact.get("hours_modelled"), impact.get("model"))
                if impact.get("slick_area_m2") else ""),
            "suspected_cause": "Under investigation — to be established at JIV",
            "immediate_actions": "Line shut in at %s" % _fmt_utc(spill.get("shut_in_at"))
            if spill.get("shut_in_at") else "",
        }
    if kind == "form-b":
        jiv = reports._status_reached_at(
            [dict(a) for a in spill.get("audit", [])], "jiv")
        return {
            "cause": "Under investigation",
            "jiv_date": _iso(jiv),
            "volume_spilled_bbl": volume,
            "area_affected_m2": round(impact["slick_area_m2"]) if impact.get("slick_area_m2") else None,
        }
    if kind == "form-c":
        return {}
    return {"summary": ""}


# ------------------------------------------------------------ validate


def _clean(kind: str, fields: Dict) -> Dict:
    schema = _kind(kind)["fields"]
    out, missing, bad = {}, [], []
    for f in schema:
        value = fields.get(f["key"])
        if isinstance(value, str):
            value = value.strip()
        if value in ("", None):
            if f["required"]:
                missing.append(f["key"])
            continue
        if f["type"] == "number":
            try:
                value = float(value)
            except (TypeError, ValueError):
                bad.append(f["key"])
                continue
        elif f["type"] == "select" and value not in f["options"]:
            bad.append(f["key"])
            continue
        elif f["type"] == "datetime" and pdf_report._parse_ts(value) is None:
            bad.append(f["key"])
            continue
        else:
            value = str(value)[:5000]
        out[f["key"]] = value
    if missing:
        raise FormError("missing required fields: %s" % ", ".join(missing), 400, missing)
    if bad:
        raise FormError("invalid values for: %s" % ", ".join(bad), 400, bad)
    return out


def _clean_sections(sections) -> List[str]:
    sections = [s for s in (sections or []) if s in SECTION_IDS]
    return [s for s in SECTION_IDS if s in sections]  # canonical order, deduplicated


# ----------------------------------------------------------------- PDF


def _value_text(field: Dict, value) -> str:
    if value is None:
        return "<font color='#9CA3AF'>—</font>"
    if field["type"] == "number":
        if field["key"].endswith("_bbl") or field["key"].endswith("_m2"):
            return _fmt_int(value)
        return _fmt_num(value, 5) if field["key"] in ("latitude", "longitude") else _fmt_num(value, 1)
    if field["type"] == "datetime":
        return _fmt_utc(value)
    return reports._escape(str(value)).replace("\n", "<br/>")


def _sections_story(conn, spill: Dict, analysis: Dict, scenario: Dict, sections: List[str]) -> List:
    story = []
    for sid in sections:
        name = next(s["name"] for s in SECTIONS if s["id"] == sid)
        if sid == "summary" and analysis.get("leak"):
            story += pdf_report._summary_box(analysis)
            continue
        story += _section_heading(name)
        if sid == "timeline":
            story += pdf_report._timeline_section(analysis)
        elif sid == "quantification":
            story += pdf_report._quantification_section(analysis)
        elif sid == "location" and analysis.get("leak"):
            story += pdf_report._location_section(analysis, scenario)
        elif sid == "impact":
            story += pdf_report._impact_section(analysis)
        elif sid == "method":
            story += pdf_report._method_integrity_section(analysis)
        elif sid == "compliance":
            audit = [dict(a) for a in spill["audit"]]
            c = reports.compliance_items(spill, audit, datetime.now(timezone.utc),
                                         db.form_a_status(conn, spill["id"]))
            rows = [[it["name"], reports._fmt_day(it["due"]), reports._item_cell(it)]
                    for it in c["items"]]
            story.append(reports._grid(["Obligation", "Due", "Status"], rows,
                                       [reports.CONTENT_WIDTH * x for x in (0.25, 0.25, 0.5)]))
            story.append(Spacer(1, 6 * mm))
        elif sid == "audit":
            rows = [[_fmt_utc(a.get("at")), a.get("actor") or "", a.get("action") or "",
                     "<font name='Courier' size='6.5'>%s</font>" % reports._escape(a.get("detail_json") or "")]
                    for a in spill["audit"]]
            story.append(reports._grid(["Time", "Actor", "Action", "Detail"], rows,
                                       [reports.CONTENT_WIDTH * x for x in (0.22, 0.16, 0.2, 0.42)])
                         if rows else _P("No audit entries.", "body"))
            story.append(Spacer(1, 6 * mm))
        elif sid == "evidence":
            rows = [[e.get("filename") or "", e.get("content_type") or "",
                     "<font name='Courier' size='6'>%s</font>" % (e.get("sha256") or "")]
                    for e in spill["evidence"]]
            story.append(reports._grid(["File", "Type", "SHA-256"], rows,
                                       [reports.CONTENT_WIDTH * x for x in (0.25, 0.15, 0.6)])
                         if rows else _P("No evidence files uploaded.", "body"))
            story.append(Spacer(1, 6 * mm))
        else:
            story.append(_P("Not available for this spill.", "body"))
            story.append(Spacer(1, 6 * mm))
    return story


def build_pdf(conn, kind: str, spill_id: str, title: str, fields: Dict, sections: List[str],
              author: str, scenario: Dict, created_at: Optional[datetime] = None) -> bytes:
    form = _kind(kind)
    spill = db.get_spill(conn, spill_id)
    if spill is None:
        raise FormError("unknown spill id", 404)
    analysis = spill.get("analysis") or {}
    created_at = created_at or datetime.now(timezone.utc)

    story = reports._header(
        title or form["name"],
        "<font color='#14B8A6'>%s</font> · %s · %s" % (
            spill_id, spill.get("pipeline_id") or "", form["name"]),
        created_at)
    if kind != "custom":
        detected = pdf_report._parse_ts(spill.get("detected_at"))
        offsets = {"form-a": timedelta(hours=24), "form-b": timedelta(days=14)}
        due = detected + offsets[kind] if detected and kind in offsets else None
        banner = Table([[
            _P("<b>Prepared by %s</b> · %s" % (reports._escape(author), _fmt_utc(_iso(created_at))),
               "cell"),
            _P("Due: <b>%s</b>" % (reports._fmt_day(due) if due else form["due"]), "cell"),
        ]], colWidths=[reports.CONTENT_WIDTH * 0.62, reports.CONTENT_WIDTH * 0.38])
        banner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
            ("BOX", (0, 0), (-1, -1), 0.5, pdf_report.RULE),
            ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story += [banner, Spacer(1, 6 * mm)]

    filled = [f for f in form["fields"] if not (kind == "custom" and f["key"] == "summary")]
    story += _section_heading("Details" if kind == "custom" else "Form fields")
    story.append(pdf_report._label_value_pairs(
        [(f["label"], _value_text(f, fields.get(f["key"]))) for f in filled]))
    story.append(Spacer(1, 6 * mm))
    if kind == "custom" and fields.get("summary"):
        story += _section_heading("Summary")
        story.append(_P(_value_text(FORMS["custom"]["fields"][0], fields["summary"]), "body"))
        story.append(Spacer(1, 6 * mm))

    story += _sections_story(conn, spill, analysis, scenario, sections)

    fingerprint = "sha256:" + __import__("hashlib").sha256(
        json.dumps({"kind": kind, "spill_id": spill_id, "fields": fields, "sections": sections},
                   sort_keys=True).encode("utf-8")).hexdigest()
    story += [Spacer(1, 2 * mm), _P(
        "Content fingerprint %s. Saved reports cannot be edited; any change is saved as a "
        "new report and recorded in the audit chain." % fingerprint, "small")]
    buffer = io.BytesIO()
    reports._doc(buffer, title or form["name"]).build(
        story, canvasmaker=pdf_report._make_canvas(fingerprint, reports.METHOD_VERSION))
    return buffer.getvalue()


# ---------------------------------------------------------- persistence


def _row(row) -> Dict:
    item = dict(row)
    item["fields"] = json.loads(item.pop("fields_json") or "{}")
    item["sections"] = json.loads(item.pop("sections_json") or "[]")
    return item


def create_report(conn, kind: str, spill_id: str, fields: Dict, sections, title: Optional[str],
                  actor: str, scenario: Dict, template_id: Optional[int] = None) -> Dict:
    """Validate, render, store and audit-log a written report."""
    clean = _clean(kind, fields or {})
    sections = _clean_sections(sections)
    if kind == "custom" and not sections and not clean.get("summary"):
        raise FormError("choose at least one section or write a summary")
    if db.get_spill(conn, spill_id) is None:
        raise FormError("unknown spill id", 404)
    title = (title or "").strip()[:200] or "%s · %s" % (FORMS[kind]["name"], spill_id)
    now = datetime.now(timezone.utc)
    pdf = build_pdf(conn, kind, spill_id, title, clean, sections, actor, scenario, now)
    sha = reports.sha256_hex(pdf)
    with db.write_transaction(conn):
        cur = conn.execute(
            "INSERT INTO written_reports (spill_id, kind, title, fields_json, sections_json,"
            " template_id, sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (spill_id, kind, title, json.dumps(clean, sort_keys=True), json.dumps(sections),
             template_id, sha, actor, _iso(now)))
        report_id = cur.lastrowid
        db.log(conn, spill_id, "report_created", actor,
               {"report_id": report_id, "kind": kind, "title": title, "sha256": sha})
        entry = db.record_report(conn, "written-" + kind,
                                 {"spill_id": spill_id, "report_id": report_id},
                                 pdf, actor)
    item = get_report(conn, report_id)
    item["history_id"] = entry["id"]
    return item


def get_report(conn, report_id: int) -> Optional[Dict]:
    row = conn.execute("SELECT * FROM written_reports WHERE id = ?", (report_id,)).fetchone()
    return _row(row) if row else None


def list_reports(conn, spill_id: Optional[str] = None) -> List[Dict]:
    q, p = "SELECT * FROM written_reports", []
    if spill_id:
        q += " WHERE spill_id = ?"
        p.append(spill_id)
    return [_row(r) for r in conn.execute(q + " ORDER BY id DESC", p).fetchall()]


def save_template(conn, name: str, kind: str, fields: Dict, sections, actor: str) -> Dict:
    name = (name or "").strip()[:120]
    if not name:
        raise FormError("template name is required", 400, ["name"])
    schema = {f["key"]: f for f in _kind(kind)["fields"]}
    defaults = {k: v for k, v in (fields or {}).items() if k in schema and v not in ("", None)}
    sections = _clean_sections(sections)
    with db.write_transaction(conn):
        cur = conn.execute(
            "INSERT INTO report_templates (name, kind, fields_json, sections_json, created_by,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (name, kind, json.dumps(defaults, sort_keys=True), json.dumps(sections), actor,
             _iso(datetime.now(timezone.utc))))
        db.log(conn, None, "template_saved", actor,
               {"template_id": cur.lastrowid, "name": name, "kind": kind})
    return _row(conn.execute("SELECT * FROM report_templates WHERE id = ?",
                             (cur.lastrowid,)).fetchone())


def list_templates(conn) -> List[Dict]:
    rows = conn.execute(
        "SELECT * FROM report_templates WHERE deleted_at IS NULL ORDER BY name").fetchall()
    return [_row(r) for r in rows]


def delete_template(conn, template_id: int, actor: str) -> None:
    """Archive a template (kept for the audit trail, hidden from lists)."""
    with db.write_transaction(conn):
        row = conn.execute("SELECT name FROM report_templates WHERE id = ? AND deleted_at IS NULL",
                           (template_id,)).fetchone()
        if row is None:
            raise FormError("unknown template", 404)
        conn.execute("UPDATE report_templates SET deleted_at = ? WHERE id = ?",
                     (_iso(datetime.now(timezone.utc)), template_id))
        db.log(conn, None, "template_deleted", actor, {"template_id": template_id,
                                                         "name": row["name"]})

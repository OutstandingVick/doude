"""Persistent data management for Doude (SQLite, standard library).

Stores pipelines, spill records, evidence files and a tamper-evident audit
log. The database lives at ``data/doude.db`` (gitignored) and can be
overridden for tests via the ``DOUDE_DB`` environment variable.
"""

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "doude.db"
EVIDENCE_DIR = ROOT / "data" / "evidence"

MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf", "text/csv"}

_STATUS_FLOW = {
    "detected": "jiv",
    "jiv": "cleanup",
    "cleanup": "closed",
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection to the Doude database (row factory + foreign keys)."""
    db_path = path or os.environ.get("DOUDE_DB") or str(DEFAULT_DB)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create the pipelines, spills, evidence and audit_log tables if missing."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS pipelines (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT,
            length_m REAL,
            inner_diameter_m REAL,
            terrain_at_leak TEXT,
            route_json TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS spills (
            id TEXT PRIMARY KEY,
            pipeline_id TEXT REFERENCES pipelines(id),
            status TEXT CHECK (status IN ('detected','jiv','cleanup','closed')),
            detected_at TEXT,
            estimated_start TEXT,
            shut_in_at TEXT,
            location_m REAL,
            location_lon REAL,
            location_lat REAL,
            volume_m3 REAL,
            volume_bbl INTEGER,
            uncertainty_pct REAL,
            input_hash TEXT,
            report_hash TEXT UNIQUE,
            analysis_json TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spill_id TEXT REFERENCES spills(id),
            filename TEXT,
            content_type TEXT,
            size_bytes INTEGER,
            sha256 TEXT,
            stored_path TEXT,
            note TEXT,
            uploaded_by TEXT,
            uploaded_at TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spill_id TEXT,
            action TEXT,
            actor TEXT,
            detail_json TEXT,
            at TEXT,
            prev_hash TEXT,
            entry_hash TEXT
        );
        """
    )
    conn.commit()


def _entry_hash(prev_hash: str, spill_id, action: str, actor: str, detail, at: str) -> str:
    payload = {"spill_id": spill_id, "action": action, "actor": actor, "detail": detail, "at": at}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()


def log(conn: sqlite3.Connection, spill_id, action: str, actor: str, detail) -> None:
    """Append an audit entry, chaining its hash to the previous row."""
    at = _now()
    prev = conn.execute("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
    prev_hash = prev["entry_hash"] if prev else "GENESIS"
    entry = _entry_hash(prev_hash, spill_id, action, actor, detail, at)
    conn.execute(
        "INSERT INTO audit_log (spill_id, action, actor, detail_json, at, prev_hash, entry_hash)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (spill_id, action, actor, json.dumps(detail, sort_keys=True), at, prev_hash, entry),
    )
    conn.commit()


def verify_audit_chain(conn: sqlite3.Connection) -> Dict:
    """Return ``{ok, entries, broken_at}`` after recomputing the hash chain."""
    rows = conn.execute("SELECT * FROM audit_log ORDER BY id").fetchall()
    prev_hash = "GENESIS"
    for row in rows:
        detail = json.loads(row["detail_json"]) if row["detail_json"] else None
        expected = _entry_hash(prev_hash, row["spill_id"], row["action"], row["actor"], detail, row["at"])
        if expected != row["entry_hash"]:
            return {"ok": False, "entries": len(rows), "broken_at": row["id"]}
        prev_hash = row["entry_hash"]
    return {"ok": True, "entries": len(rows), "broken_at": None}


def upsert_pipeline_from_scenario(conn: sqlite3.Connection, scenario: Dict) -> None:
    """Insert or update the pipeline row from a scenario dict."""
    pipeline = scenario.get("pipeline") or {}
    route_json = json.dumps(pipeline.get("route_lonlat") or [])
    conn.execute(
        "INSERT INTO pipelines (id, name, type, length_m, inner_diameter_m,"
        " terrain_at_leak, route_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (pipeline.get("id"), scenario.get("name"), pipeline.get("type"),
         pipeline.get("length_m"), pipeline.get("inner_diameter_m"),
         pipeline.get("terrain_at_leak"), route_json, _now()),
    )
    conn.commit()


def _next_spill_id(conn: sqlite3.Connection) -> str:
    last = conn.execute("SELECT id FROM spills ORDER BY id DESC LIMIT 1").fetchone()
    number = int(last["id"].split("-")[1]) + 1 if last else 1
    return "SPL-%04d" % number


def save_analysis(conn: sqlite3.Connection, response: Dict, actor: Optional[str] = None) -> Optional[str]:
    """Persist a detected analysis as a spill record, or return ``None``.

    Idempotent: an identical ``report_hash`` returns the existing spill id
    rather than creating a duplicate. Non-detected analyses are only logged.
    """
    actor = actor or "demo-regulator"
    if not response.get("detected"):
        log(conn, None, "analysis_no_spill", actor, {"pipeline_id": response.get("pipeline_id")})
        return None

    report = response.get("report") or {}
    report_hash = report.get("report_hash")
    existing = conn.execute("SELECT id FROM spills WHERE report_hash = ?", (report_hash,)).fetchone()
    if existing:
        log(conn, existing["id"], "analysis_rerun_identical", actor, {"report_hash": report_hash})
        return existing["id"]

    leak = response.get("leak") or {}
    quant = response.get("quantification") or {}
    lonlat = leak.get("location_lonlat") or [None, None]

    spill_id = _next_spill_id(conn)
    now = _now()
    conn.execute(
        "INSERT INTO spills (id, pipeline_id, status, detected_at, estimated_start,"
        " shut_in_at, location_m, location_lon, location_lat, volume_m3, volume_bbl,"
        " uncertainty_pct, input_hash, report_hash, analysis_json, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (spill_id, response.get("pipeline_id"), "detected",
         leak.get("detected_at"), leak.get("estimated_start"), leak.get("shut_in_at"),
         leak.get("location_m"), lonlat[0], lonlat[1],
         quant.get("volume_m3"), quant.get("volume_bbl"), quant.get("uncertainty_pct"),
         report.get("input_hash"), report_hash, json.dumps(response), now, now),
    )
    log(conn, spill_id, "spill_recorded", actor, {"pipeline_id": response.get("pipeline_id")})
    return spill_id


def _spill_columns():
    return ("id, pipeline_id, status, detected_at, estimated_start, shut_in_at,"
            " location_m, location_lon, location_lat, volume_m3, volume_bbl,"
            " uncertainty_pct, input_hash, report_hash, created_at, updated_at")


def list_spills(conn: sqlite3.Connection, pipeline_id: Optional[str] = None) -> List[Dict]:
    """Return spill records (without ``analysis_json``), newest-ish order."""
    query = "SELECT " + _spill_columns() + " FROM spills"
    params: List = []
    if pipeline_id:
        query += " WHERE pipeline_id = ?"
        params.append(pipeline_id)
    query += " ORDER BY id DESC"
    rows = conn.execute(query, params).fetchall()
    out = []
    for row in rows:
        item = dict(row)
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM evidence WHERE spill_id = ?", (item["id"],)
        ).fetchone()["n"]
        item["evidence_count"] = count
        out.append(item)
    return out


def get_spill(conn: sqlite3.Connection, spill_id: str) -> Optional[Dict]:
    """Return a spill with parsed analysis, evidence and audit entries."""
    row = conn.execute("SELECT * FROM spills WHERE id = ?", (spill_id,)).fetchone()
    if row is None:
        return None
    item = dict(row)
    item["analysis"] = json.loads(item["analysis_json"]) if item.get("analysis_json") else None
    item.pop("analysis_json", None)
    item["evidence"] = [
        dict(e) for e in conn.execute(
            "SELECT * FROM evidence WHERE spill_id = ? ORDER BY id", (spill_id,)
        ).fetchall()
    ]
    item["audit"] = [
        dict(a) for a in conn.execute(
            "SELECT * FROM audit_log WHERE spill_id = ? ORDER BY id", (spill_id,)
        ).fetchall()
    ]
    return item

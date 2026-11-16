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

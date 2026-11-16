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

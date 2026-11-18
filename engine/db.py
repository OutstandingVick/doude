"""Persistent data management for Doude (SQLite, standard library).

Stores pipelines, spill records, evidence files and a tamper-evident audit
log. The database lives at ``data/doude.db`` (gitignored) and can be
overridden for tests via the ``DOUDE_DB`` environment variable.
"""

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterator, List, Optional

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


BUSY_TIMEOUT_MS = 10000


def connect(path: Optional[str] = None, check_same_thread: bool = True) -> sqlite3.Connection:
    """Open a connection to the Doude database.

    The connection runs in autocommit mode (``isolation_level=None``) so that
    writes control their own transactions via :func:`write_transaction`. WAL
    journaling and a busy timeout let concurrent requests wait for the write
    lock instead of failing. Use one connection per request/thread;
    ``check_same_thread=False`` is only for a request-scoped connection that
    the web framework hands between worker threads sequentially.
    """
    db_path = path or os.environ.get("DOUDE_DB") or str(DEFAULT_DB)
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=BUSY_TIMEOUT_MS / 1000.0, isolation_level=None,
                           check_same_thread=check_same_thread)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = %d" % BUSY_TIMEOUT_MS)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def write_transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Run a block inside one ``BEGIN IMMEDIATE`` write transaction.

    ``BEGIN IMMEDIATE`` takes SQLite's write lock up front, so reads made in
    the block (e.g. the last audit ``entry_hash``) cannot go stale before the
    insert. Nested use joins the outer transaction.
    """
    if conn.in_transaction:
        yield conn
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


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


def _canonical(value) -> str:
    """Canonical JSON used both for stored ``detail_json`` and entry hashes."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _entry_hash(prev_hash: str, spill_id, action: str, actor: str, detail, at: str) -> str:
    payload = {"spill_id": spill_id, "action": action, "actor": actor, "detail": detail, "at": at}
    canonical = _canonical(payload)
    return "sha256:" + hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()


def log(conn: sqlite3.Connection, spill_id, action: str, actor: str, detail) -> None:
    """Append an audit entry, chaining its hash to the previous row.

    Reading the previous hash and inserting happen in one immediate write
    transaction, so concurrent writers cannot chain to the same entry.
    """
    # Round-trip detail through canonical JSON so the hashed value is exactly
    # what verify_audit_chain will reload from detail_json.
    detail_json = _canonical(detail)
    detail = json.loads(detail_json)
    with write_transaction(conn):
        at = _now()
        prev = conn.execute("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
        prev_hash = prev["entry_hash"] if prev else "GENESIS"
        entry = _entry_hash(prev_hash, spill_id, action, actor, detail, at)
        conn.execute(
            "INSERT INTO audit_log (spill_id, action, actor, detail_json, at, prev_hash, entry_hash)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (spill_id, action, actor, detail_json, at, prev_hash, entry),
        )


def verify_audit_chain(conn: sqlite3.Connection) -> Dict:
    """Return ``{ok, entries, broken_at}`` after recomputing the hash chain."""
    rows = conn.execute("SELECT * FROM audit_log ORDER BY id").fetchall()
    prev_hash = "GENESIS"
    for row in rows:
        detail = json.loads(row["detail_json"]) if row["detail_json"] else None
        if row["prev_hash"] != prev_hash:
            return {"ok": False, "entries": len(rows), "broken_at": row["id"]}
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
        " terrain_at_leak, route_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type,"
        " length_m=excluded.length_m, inner_diameter_m=excluded.inner_diameter_m,"
        " terrain_at_leak=excluded.terrain_at_leak, route_json=excluded.route_json",
        (pipeline.get("id"), scenario.get("name"), pipeline.get("type"),
         pipeline.get("length_m"), pipeline.get("inner_diameter_m"),
         pipeline.get("terrain_at_leak"), route_json, _now()),
    )


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

    with write_transaction(conn):
        return _save_detected(conn, response, actor)


def _save_detected(conn: sqlite3.Connection, response: Dict, actor: str) -> str:
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


def set_status(conn: sqlite3.Connection, spill_id: str, new_status: str,
               actor: Optional[str] = None, note: Optional[str] = None) -> None:
    """Advance a spill along detected -> jiv -> cleanup -> closed."""
    actor = actor or "demo-regulator"
    with write_transaction(conn):
        _set_status_locked(conn, spill_id, new_status, actor, note)


def _set_status_locked(conn: sqlite3.Connection, spill_id: str, new_status: str,
                       actor: str, note: Optional[str]) -> None:
    row = conn.execute("SELECT status FROM spills WHERE id = ?", (spill_id,)).fetchone()
    if row is None:
        raise ValueError("unknown spill id")
    current = row["status"]
    if new_status not in _STATUS_FLOW.values() and current not in _STATUS_FLOW:
        raise ValueError("invalid status")
    if _STATUS_FLOW.get(current) != new_status:
        raise ValueError("invalid transition from %s to %s" % (current, new_status))
    conn.execute(
        "UPDATE spills SET status = ?, updated_at = ? WHERE id = ?",
        (new_status, _now(), spill_id),
    )
    log(conn, spill_id, "status_changed", actor, {"from": current, "to": new_status, "note": note})


def _safe_filename(filename: str) -> str:
    base = (filename or "").replace("\\", "/").split("/")[-1]
    return base or "file"


def add_evidence(conn: sqlite3.Connection, spill_id: str, filename: str,
                 content_type: str, data_bytes: bytes, note: Optional[str] = None,
                 actor: Optional[str] = None) -> Dict:
    """Store an evidence file (size/type validated) and log it."""
    actor = actor or "demo-regulator"
    if len(data_bytes) > MAX_EVIDENCE_BYTES:
        raise ValueError("file too large")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("unsupported content type")

    safe = _safe_filename(filename)
    sha = hashlib.sha256(data_bytes).hexdigest()
    spill_dir = EVIDENCE_DIR / spill_id
    spill_dir.mkdir(parents=True, exist_ok=True)
    stored_path = spill_dir / ("%s_%s" % (sha, safe))
    stored_path.write_bytes(data_bytes)

    with write_transaction(conn):
        cur = conn.execute(
            "INSERT INTO evidence (spill_id, filename, content_type, size_bytes, sha256,"
            " stored_path, note, uploaded_by, uploaded_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (spill_id, safe, content_type, len(data_bytes), sha, str(stored_path),
             note, actor, _now()),
        )
        log(conn, spill_id, "evidence_added", actor, {"sha256": sha, "filename": safe})
    return dict(conn.execute("SELECT * FROM evidence WHERE id = ?", (cur.lastrowid,)).fetchone())

def reset_dev(db_path: Optional[str] = None, assume_yes: bool = False) -> bool:
    """Delete the local dev database (plus WAL files) and stored evidence.

    Development only: this throws away the audit log rather than repairing it.
    Returns True when files were deleted.
    """
    import shutil

    target = Path(db_path or os.environ.get("DOUDE_DB") or str(DEFAULT_DB))
    paths = [target, Path(str(target) + "-wal"), Path(str(target) + "-shm")]
    print("This permanently deletes:")
    for p in paths + [EVIDENCE_DIR]:
        print("  " + str(p))
    if not assume_yes:
        answer = input("Type 'reset' to continue: ").strip()
        if answer != "reset":
            print("Aborted; nothing deleted.")
            return False
    for p in paths:
        if p.exists():
            p.unlink()
    if EVIDENCE_DIR.exists():
        shutil.rmtree(EVIDENCE_DIR)
    print("Local database and evidence removed. Restart the engine to recreate them.")
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Doude database utilities")
    parser.add_argument("--reset-dev", action="store_true",
                        help="delete data/doude.db and data/evidence (asks for confirmation)")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()
    if args.reset_dev:
        reset_dev(assume_yes=args.yes)
    else:
        parser.print_help()

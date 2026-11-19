"""Persistent data management for Feasibility3D (SQLite, standard library).

Stores pipelines, spill records, evidence files and a tamper-evident audit
log. The database lives at ``data/feasibility3d.db`` (gitignored) and can be
overridden for tests via the ``FEASIBILITY3D_DB`` environment variable.
"""

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterator, List, Optional

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "feasibility3d.db"
EVIDENCE_DIR = ROOT / "data" / "evidence"
REPORTS_DIR = ROOT / "data" / "reports"

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
    """Open a connection to the Feasibility3D database.

    The connection runs in autocommit mode (``isolation_level=None``) so that
    writes control their own transactions via :func:`write_transaction`. WAL
    journaling and a busy timeout let concurrent requests wait for the write
    lock instead of failing. Use one connection per request/thread;
    ``check_same_thread=False`` is only for a request-scoped connection that
    the web framework hands between worker threads sequentially.
    """
    db_path = path or os.environ.get("FEASIBILITY3D_DB") or str(DEFAULT_DB)
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

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            created_at TEXT
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
    item["form_a"] = form_a_status(conn, spill_id)
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


def _parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _form_a_deadline(detected_at):
    d = _parse_ts(detected_at)
    if d is None:
        return None
    return (d.astimezone(timezone.utc) + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_late(detected_at, filed_at):
    d = _parse_ts(detected_at)
    f = _parse_ts(filed_at)
    if d is None or f is None:
        return False
    return f > d.astimezone(timezone.utc) + timedelta(hours=24)


_AUDIT_TITLES = {
    "spill_recorded": "Spill recorded",
    "analysis_rerun_identical": "Analysis re-run (identical)",
    "analysis_no_spill": "Analysis (no spill)",
    "status_changed": "Status changed",
    "evidence_added": "Evidence added",
    "form_a_filed": "Form A filed",
    "contact_added": "Contact added",
    "contact_removed": "Contact removed",
}


def _audit_detail(action, detail):
    if action == "status_changed":
        text = "%s → %s" % (detail.get("from"), detail.get("to"))
        return text + (" · %s" % detail["note"] if detail.get("note") else "")
    if action == "evidence_added":
        return detail.get("filename") or ""
    if action == "analysis_rerun_identical":
        return (detail.get("report_hash") or "").replace("sha256:", "")
    if action == "form_a_filed":
        return detail.get("reference") or ""
    if action in ("contact_added", "contact_removed"):
        return detail.get("name") or ""
    return detail.get("pipeline_id") or ""


def notifications(conn) -> List[Dict]:
    """Build a notification feed from the audit log plus Form A deadlines."""
    now = datetime.now(timezone.utc)
    items = []

    for row in conn.execute("SELECT * FROM audit_log ORDER BY id DESC").fetchall():
        detail = json.loads(row["detail_json"]) if row["detail_json"] else {}
        items.append({
            "id": "audit-%d" % row["id"],
            "kind": "audit",
            "title": _AUDIT_TITLES.get(row["action"], row["action"]),
            "detail": _audit_detail(row["action"], detail),
            "at": row["at"],
            "actor": row["actor"],
            "spill_id": row["spill_id"],
            "link": ("/spills/%s" % row["spill_id"]) if row["spill_id"] else "/",
        })

    for spill in conn.execute("SELECT id, detected_at FROM spills").fetchall():
        deadline = _form_a_deadline(spill["detected_at"])
        if not deadline:
            continue
        if conn.execute(
            "SELECT 1 FROM audit_log WHERE spill_id = ? AND action = 'form_a_filed' LIMIT 1",
            (spill["id"],),
        ).fetchone():
            continue
        items.append({
            "id": "deadline-%s" % spill["id"],
            "kind": "deadline",
            "title": "Form A due (24 h)",
            "detail": "Notification to NOSDRA",
            "at": deadline,
            "actor": None,
            "spill_id": spill["id"],
            "link": "/spills/%s" % spill["id"],
            "overdue": _parse_ts(deadline) < now,
        })

    items.sort(key=lambda n: n["at"], reverse=True)
    return items


def form_a_status(conn, spill_id):
    """Return the Form A filing status for a spill, or ``None`` if not filed."""
    row = conn.execute(
        "SELECT detail_json FROM audit_log WHERE spill_id = ? AND action = 'form_a_filed'"
        " ORDER BY id DESC LIMIT 1",
        (spill_id,),
    ).fetchone()
    if row is None:
        return None
    detail = json.loads(row["detail_json"])
    return {
        "filed": True,
        "late": bool(detail.get("late")),
        "reference": detail.get("reference"),
        "filed_at": detail.get("filed_at"),
    }


def file_form_a(conn, spill_id, actor, reference, filed_at=None):
    """Record that Form A was filed, logging it to the audit chain."""
    actor = actor or "demo-regulator"
    filed_at = filed_at or _now()
    with write_transaction(conn):
        row = conn.execute("SELECT detected_at FROM spills WHERE id = ?", (spill_id,)).fetchone()
        if row is None:
            raise ValueError("unknown spill id")
        late = _is_late(row["detected_at"], filed_at)
        log(conn, spill_id, "form_a_filed", actor,
            {"reference": reference, "filed_at": filed_at, "late": late})
    return {"spill_id": spill_id, "filed": True, "late": late,
            "reference": reference, "filed_at": filed_at}


def list_contacts(conn) -> List[Dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM contacts ORDER BY id").fetchall()]


def add_contact(conn, name, email, phone, actor):
    """Add a notification contact and log it."""
    actor = actor or "demo-regulator"
    with write_transaction(conn):
        cur = conn.execute(
            "INSERT INTO contacts (name, email, phone, created_at) VALUES (?, ?, ?, ?)",
            (name, email, phone, _now()),
        )
        log(conn, None, "contact_added", actor,
            {"name": name, "email": email, "phone": phone})
    return dict(conn.execute("SELECT * FROM contacts WHERE id = ?", (cur.lastrowid,)).fetchone())


def remove_contact(conn, contact_id, actor):
    """Remove a notification contact and log it."""
    actor = actor or "demo-regulator"
    with write_transaction(conn):
        row = conn.execute("SELECT name FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if row is None:
            raise ValueError("unknown contact id")
        conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        log(conn, None, "contact_removed", actor, {"id": contact_id, "name": row["name"]})

def record_report(conn: sqlite3.Connection, report_type: str, params: Dict,
                  pdf_bytes: bytes, actor: Optional[str] = None) -> Dict:
    """Store a generated report PDF and log ``report_generated``.

    The file is kept under ``data/reports/<sha256>.pdf`` so a re-download
    returns exactly the bytes whose fingerprint is in the audit log.
    """
    actor = actor or "demo-regulator"
    sha = hashlib.sha256(pdf_bytes).hexdigest()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / ("%s.pdf" % sha)
    if not path.exists():
        path.write_bytes(pdf_bytes)
    detail = {"type": report_type, "params": params, "sha256": "sha256:" + sha}
    log(conn, params.get("spill_id"), "report_generated", actor, detail)
    row = conn.execute(
        "SELECT * FROM audit_log WHERE action = 'report_generated' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return _history_item(row)


def _history_item(row) -> Dict:
    detail = json.loads(row["detail_json"]) if row["detail_json"] else {}
    return {
        "id": row["id"],
        "type": detail.get("type"),
        "params": detail.get("params") or {},
        "sha256": detail.get("sha256"),
        "actor": row["actor"],
        "at": row["at"],
        "spill_id": row["spill_id"],
    }


def report_history(conn: sqlite3.Connection, limit: int = 50) -> List[Dict]:
    """Return generated reports (newest first) from the audit log."""
    rows = conn.execute(
        "SELECT * FROM audit_log WHERE action = 'report_generated' ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [_history_item(r) for r in rows]


def report_file(conn: sqlite3.Connection, entry_id: int) -> Optional[Path]:
    """Return the stored PDF for a ``report_generated`` audit entry, if present."""
    row = conn.execute(
        "SELECT * FROM audit_log WHERE id = ? AND action = 'report_generated'", (entry_id,)
    ).fetchone()
    if row is None:
        return None
    sha = (_history_item(row).get("sha256") or "").replace("sha256:", "")
    path = REPORTS_DIR / ("%s.pdf" % sha)
    return path if sha and path.exists() else None


def reset_dev(db_path: Optional[str] = None, assume_yes: bool = False) -> bool:
    """Delete the local dev database (plus WAL files) and stored evidence.

    Development only: this throws away the audit log rather than repairing it.
    Returns True when files were deleted.
    """
    import shutil

    target = Path(db_path or os.environ.get("FEASIBILITY3D_DB") or str(DEFAULT_DB))
    paths = [target, Path(str(target) + "-wal"), Path(str(target) + "-shm")]
    print("This permanently deletes:")
    for p in paths + [EVIDENCE_DIR, REPORTS_DIR]:
        print("  " + str(p))
    if not assume_yes:
        answer = input("Type 'reset' to continue: ").strip()
        if answer != "reset":
            print("Aborted; nothing deleted.")
            return False
    for p in paths:
        if p.exists():
            p.unlink()
    for folder in (EVIDENCE_DIR, REPORTS_DIR):
        if folder.exists():
            shutil.rmtree(folder)
    print("Local database and evidence removed. Restart the engine to recreate them.")
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Feasibility3D database utilities")
    parser.add_argument("--reset-dev", action="store_true",
                        help="delete data/feasibility3d.db, data/evidence and data/reports (asks for confirmation)")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()
    if args.reset_dev:
        reset_dev(assume_yes=args.yes)
    else:
        parser.print_help()

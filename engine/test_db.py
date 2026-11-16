"""Tests for the Doude SQLite data layer."""

import hashlib
from pathlib import Path

import pytest

from engine import db, locate, report


@pytest.fixture(scope="module")
def scenario():
    return locate.load_scenario()


@pytest.fixture(scope="module")
def response():
    return report.analyze()


@pytest.fixture()
def conn(tmp_path, monkeypatch, scenario):
    monkeypatch.setenv("DOUDE_DB", str(tmp_path / "doude.db"))
    monkeypatch.setattr(db, "EVIDENCE_DIR", tmp_path / "evidence")
    connection = db.connect()
    db.init_db(connection)
    db.upsert_pipeline_from_scenario(connection, scenario)
    yield connection
    connection.close()


def test_init_db_creates_tables(conn):
    names = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    assert names == {"pipelines", "spills", "evidence", "audit_log"}


def test_save_analysis_idempotent(conn, response):
    first = db.save_analysis(conn, response, "tester")
    assert first == "SPL-0001"
    second = db.save_analysis(conn, response, "tester")
    assert second == "SPL-0001"
    ids = [row["id"] for row in conn.execute("SELECT id FROM spills")]
    assert ids == ["SPL-0001"]


def test_status_workflow(conn, response):
    spill_id = db.save_analysis(conn, response, "tester")
    db.set_status(conn, spill_id, "jiv", "tester", "JIV done")
    db.set_status(conn, spill_id, "cleanup", "tester", "cleanup begun")
    db.set_status(conn, spill_id, "closed", "tester", "resolved")
    assert db.get_spill(conn, spill_id)["status"] == "closed"


def test_status_invalid_transitions(conn, response):
    spill_id = db.save_analysis(conn, response, "tester")
    with pytest.raises(ValueError):
        db.set_status(conn, spill_id, "cleanup", "tester")  # skips jiv
    db.set_status(conn, spill_id, "jiv", "tester")
    with pytest.raises(ValueError):
        db.set_status(conn, spill_id, "detected", "tester")  # goes back


def test_add_evidence(conn, response):
    spill_id = db.save_analysis(conn, response, "tester")
    data = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    ev = db.add_evidence(conn, spill_id, "../../photo.png", "image/png", data, "note", "tester")
    assert ev["filename"] == "photo.png"
    assert ev["sha256"] == hashlib.sha256(data).hexdigest()
    assert ev["size_bytes"] == len(data)
    assert Path(ev["stored_path"]).exists()


def test_add_evidence_rejects(conn, response):
    spill_id = db.save_analysis(conn, response, "tester")
    with pytest.raises(ValueError):
        db.add_evidence(conn, spill_id, "big.png", "image/png",
                        b"x" * (10 * 1024 * 1024 + 1), None, "tester")
    with pytest.raises(ValueError):
        db.add_evidence(conn, spill_id, "data.txt", "text/plain", b"hello", None, "tester")


def test_audit_chain_verify_and_tamper(conn, response):
    db.save_analysis(conn, response, "tester")
    assert db.verify_audit_chain(conn)["ok"] is True

    row = conn.execute("SELECT id FROM audit_log ORDER BY id LIMIT 1").fetchone()
    conn.execute("UPDATE audit_log SET detail_json = ? WHERE id = ?", ('{"tampered": true}', row["id"]))
    conn.commit()

    result = db.verify_audit_chain(conn)
    assert result["ok"] is False
    assert result["broken_at"] == row["id"]


def test_no_ground_truth_in_source():
    assert "ground_truth" not in Path(db.__file__).read_text()
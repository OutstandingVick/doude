"""The audit hash chain must stay intact under concurrent writers."""
import threading

from engine import db

THREADS = 20
WRITES_PER_THREAD = 5


def test_concurrent_log_writes_keep_chain_valid(tmp_path):
    path = str(tmp_path / "concurrent.db")
    setup = db.connect(path)
    db.init_db(setup)
    setup.close()

    barrier = threading.Barrier(THREADS)
    errors = []

    def worker(n):
        conn = db.connect(path)  # one connection per thread
        try:
            barrier.wait()
            for i in range(WRITES_PER_THREAD):
                db.log(conn, "SPL-0001", "analysis_rerun_identical", "thread-%d" % n,
                       {"thread": n, "i": i})
        except Exception as exc:  # pragma: no cover - surfaced by assert below
            errors.append(exc)
        finally:
            conn.close()

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(THREADS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    conn = db.connect(path)
    try:
        result = db.verify_audit_chain(conn)
        prevs = [r["prev_hash"] for r in conn.execute("SELECT prev_hash FROM audit_log")]
    finally:
        conn.close()
    assert result == {"ok": True, "entries": THREADS * WRITES_PER_THREAD, "broken_at": None}
    assert len(prevs) == len(set(prevs))

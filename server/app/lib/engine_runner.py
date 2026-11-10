"""
Runs the print-check engine in background worker processes.

The database is the queue, so nothing is lost on a restart:
  design_versions.reference_status = 'queued'  → reference preparation
  inspections.status = 'queued'                → photo checks

A feeder thread claims queued rows (queued → processing) and hands them to two
process pools: one for photo checks (ENGINE_WORKERS, people are waiting) and one
for reference preparation (ENGINE_REFERENCE_WORKERS, background work such as the
phase 1 backlog), so a long backlog never delays a check.

Switched on by ENGINE_ENABLED=true. Off, uploads still queue their references and
checks are refused, so the engine can be turned on later without losing work.
"""
from __future__ import annotations

import json
import os
import threading
import traceback
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Optional

from .. import db
from ..config import env
from .audit import audit
from .storage import UPLOAD_ROOT, path_for_url

ENGINE_URL_ROOT = "/uploads/_engine"


def engine_enabled() -> bool:
    return env("ENGINE_ENABLED") == "true"


def _int_env(key: str, default: int) -> int:
    try:
        return max(1, int(env(key) or default))
    except ValueError:
        return default


def reference_folder(version_id: int) -> tuple[str, str]:
    """(public URL, disk path) of a design version's reference folder."""
    url = f"{ENGINE_URL_ROOT}/references/v{version_id}"
    return url, str(UPLOAD_ROOT / "_engine" / "references" / f"v{version_id}")


class EngineRunner:
    def __init__(self) -> None:
        self.check_workers = _int_env("ENGINE_WORKERS", 2)
        self.ref_workers = _int_env("ENGINE_REFERENCE_WORKERS", 1)
        self._check_pool: Optional[ProcessPoolExecutor] = None
        self._ref_pool: Optional[ProcessPoolExecutor] = None
        self._checks: set[int] = set()
        self._refs: set[int] = set()
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ── lifecycle ────────────────────────────────────────────────────────────
    def start(self) -> None:
        if not engine_enabled() or self._thread:
            return
        # Work that was running when the API stopped goes back in the queue
        db.execute("UPDATE design_versions SET reference_status = 'queued' WHERE reference_status = 'processing'")
        db.execute("UPDATE inspections SET status = 'queued', started_at = NULL WHERE status = 'processing'")
        self._check_pool = ProcessPoolExecutor(self.check_workers)
        self._ref_pool = ProcessPoolExecutor(self.ref_workers)
        self._thread = threading.Thread(target=self._loop, name="engine-feeder", daemon=True)
        self._thread.start()
        print(f"Print-check engine on: {self.check_workers} check worker(s), {self.ref_workers} reference worker(s)")

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        for pool in (self._check_pool, self._ref_pool):
            if pool:
                pool.shutdown(wait=False, cancel_futures=True)

    def wake(self) -> None:
        """New work was queued: look now instead of at the next tick."""
        self._wake.set()

    def status(self) -> dict:
        counts = db.one("""SELECT
              (SELECT COUNT(*) FROM inspections WHERE status IN ('queued','processing')) AS checks_waiting,
              (SELECT COUNT(*) FROM design_versions WHERE reference_status IN ('queued','processing')) AS references_waiting""")
        return {"enabled": engine_enabled(), "running": bool(self._thread), "check_workers": self.check_workers,
                "reference_workers": self.ref_workers, **{k: int(v) for k, v in counts.items()}}

    # ── feeder ───────────────────────────────────────────────────────────────
    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._feed_checks()
                self._feed_references()
            except Exception:  # noqa: BLE001  the feeder must survive anything
                traceback.print_exc()
            self._wake.wait(1.0)
            self._wake.clear()

    def _claim(self, sql_pick: str, sql_claim: str, free: int) -> list[int]:
        claimed = []
        for row in db.all(sql_pick, (free * 2,)):
            if len(claimed) >= free:
                break
            if db.execute(sql_claim, (row["id"],)) == 1:  # another API process can't take it twice
                claimed.append(row["id"])
        return claimed

    def _feed_checks(self) -> None:
        with self._lock:
            free = self.check_workers - len(self._checks)
        if free <= 0:
            return
        for iid in self._claim(
                "SELECT id FROM inspections WHERE status = 'queued' ORDER BY id LIMIT %s",
                "UPDATE inspections SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = %s AND status = 'queued'",
                free):
            self._submit_check(iid)

    def _feed_references(self) -> None:
        with self._lock:
            free = self.ref_workers - len(self._refs)
        if free <= 0:
            return
        # newest uploads first: they are the designs people will check next
        for vid in self._claim(
                "SELECT id FROM design_versions WHERE reference_status = 'queued' ORDER BY id DESC LIMIT %s",
                "UPDATE design_versions SET reference_status = 'processing', reference_error = NULL WHERE id = %s AND reference_status = 'queued'",
                free):
            self._submit_reference(vid)

    # ── reference preparation ────────────────────────────────────────────────
    def _submit_reference(self, version_id: int) -> None:
        from ..engine.worker import prepare_task

        v = db.one("""SELECT v.id, v.version_no, v.file_path, v.original_path, j.job_number, j.company_id
                      FROM design_versions v JOIN jobs j ON j.id = v.job_id WHERE v.id = %s""", (version_id,))
        design = path_for_url(v["original_path"] or v["file_path"]) if v else None
        if not v or not design or not design.exists():
            self._reference_failed(version_id, v, "The design file could not be found on the server")
            return
        url, folder = reference_folder(version_id)
        with self._lock:
            self._refs.add(version_id)
        try:
            fut = self._ref_pool.submit(prepare_task, str(design), folder, f"{v['job_number']} v{v['version_no']}")
        except (BrokenProcessPool, RuntimeError):
            self._ref_pool = ProcessPoolExecutor(self.ref_workers)
            fut = self._ref_pool.submit(prepare_task, str(design), folder, f"{v['job_number']} v{v['version_no']}")
        fut.add_done_callback(lambda f: self._reference_done(version_id, v, url, f))

    def _reference_done(self, version_id: int, v: dict, url: str, fut: Future) -> None:
        try:
            out = fut.result()
            meta = out["meta"]
            summary = {"panels": meta["panels"], "compare_fraction": meta["compare_fraction"],
                       "work_size": meta["work_size"], "inks": meta["inks"],
                       "preview": f"{url}/{out['preview']}", "clean": f"{url}/{out['clean']}"}
            db.execute("""UPDATE design_versions SET reference_status = 'needs_review', reference_dir = %s,
                          reference_meta = %s, reference_error = NULL, reference_prepared_at = CURRENT_TIMESTAMP,
                          reference_reviewed_by = NULL, reference_reviewed_at = NULL, reference_review_note = NULL
                          WHERE id = %s""", (url, json.dumps(summary), version_id))
            audit(None, "reference.prepared", "design_version", version_id, v["company_id"],
                  {"job_number": v["job_number"], "version": v["version_no"], "panels": meta["panels"],
                   "compare_fraction": meta["compare_fraction"], "inks": len(meta["inks"])})
        except Exception as e:  # noqa: BLE001
            if isinstance(e, BrokenProcessPool):
                self._ref_pool = ProcessPoolExecutor(self.ref_workers)
            self._reference_failed(version_id, v, f"{type(e).__name__}: {e}"[:500])
        finally:
            with self._lock:
                self._refs.discard(version_id)
            self.wake()

    def _reference_failed(self, version_id: int, v: Optional[dict], error: str) -> None:
        db.execute("UPDATE design_versions SET reference_status = 'failed', reference_error = %s WHERE id = %s",
                   (error[:500], version_id))
        audit(None, "reference.failed", "design_version", version_id, v["company_id"] if v else None,
              {"job_number": v["job_number"] if v else None, "error": error[:300]})

    # ── photo checks ─────────────────────────────────────────────────────────
    def _submit_check(self, inspection_id: int) -> None:
        from ..engine.worker import check_task

        i = db.one("""SELECT i.id, i.files_dir, i.photo_path, i.sensitivity, i.company_id, i.job_id, v.reference_dir
                      FROM inspections i JOIN design_versions v ON v.id = i.design_version_id WHERE i.id = %s""",
                   (inspection_id,))
        ref = path_for_url(i["reference_dir"]) if i and i["reference_dir"] else None
        photo = path_for_url(i["photo_path"]) if i else None
        folder = path_for_url(i["files_dir"]) if i else None
        if not i or not ref or not photo or not folder or not photo.exists():
            self._check_failed(inspection_id, i, "The photo or the design reference could not be found on the server")
            return
        with self._lock:
            self._checks.add(inspection_id)
        try:
            fut = self._check_pool.submit(check_task, str(ref), str(photo), str(folder), i["sensitivity"])
        except (BrokenProcessPool, RuntimeError):
            self._check_pool = ProcessPoolExecutor(self.check_workers)
            fut = self._check_pool.submit(check_task, str(ref), str(photo), str(folder), i["sensitivity"])
        fut.add_done_callback(lambda f: self._check_done(inspection_id, i, f))

    def _check_done(self, inspection_id: int, i: dict, fut: Future) -> None:
        try:
            result = fut.result()
            base = i["files_dir"]
            result["images"] = {k: f"{base}/{v}" for k, v in result.get("images", {}).items()}
            for d in result.get("defects", []):
                if d.get("closeup"):
                    d["closeup"] = f"{base}/{d['closeup']}"
            result.pop("ink_measurements", None)
            db.execute("""UPDATE inspections SET status = 'done', verdict = %s, defect_count = %s, result = %s,
                          error = NULL, completed_at = CURRENT_TIMESTAMP WHERE id = %s""",
                       (result["verdict"], len(result.get("defects", [])), json.dumps(result), inspection_id))
            audit(None, "inspection.completed", "inspection", inspection_id, i["company_id"],
                  {"job_id": i["job_id"], "verdict": result["verdict"], "defects": len(result.get("defects", [])),
                   "seconds": result.get("seconds")})
        except Exception as e:  # noqa: BLE001
            if isinstance(e, BrokenProcessPool):
                self._check_pool = ProcessPoolExecutor(self.check_workers)
            self._check_failed(inspection_id, i, f"{type(e).__name__}: {e}"[:500])
        finally:
            with self._lock:
                self._checks.discard(inspection_id)
            self.wake()

    def _check_failed(self, inspection_id: int, i: Optional[dict], error: str) -> None:
        db.execute("UPDATE inspections SET status = 'failed', error = %s, completed_at = CURRENT_TIMESTAMP WHERE id = %s",
                   (error[:500], inspection_id))
        audit(None, "inspection.failed", "inspection", inspection_id, i["company_id"] if i else None, {"error": error[:300]})


runner = EngineRunner()

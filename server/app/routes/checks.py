"""
Print checks: design references (prepare, review) and inspections (check a photo, results).

  GET  /api/engine/status
  GET  /api/jobs/{id}/reference                current version's reference
  POST /api/jobs/{id}/reference/prepare        (re)queue it
  GET  /api/references?status=needs_review     review queue
  POST /api/references/{version_id}/review     approve / reject
  POST /api/references/backlog                 queue designs never prepared (phase 1)
  POST /api/jobs/{id}/inspections              check a photo (multipart: photo, sensitivity, source)
  GET  /api/jobs/{id}/inspections              a job's check history
  GET  /api/inspections                        recent checks
  GET  /api/inspections/{id}                   one check, with its result
"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, Request
from starlette.datastructures import UploadFile

from .. import db
from ..http import fail, ok, read_body
from ..lib.audit import audit
from ..lib.companies import can_see, scope_clause, visible_company_ids
from ..lib.engine_runner import engine_enabled, runner
from ..lib.storage import store_inspection_photo
from ..security import require_roles, signed_in
from ..validate import is_int

router = APIRouter()

CHECKER_ROLES = ("operator", "qc_supervisor", "company_admin", "admin")
REVIEWER_ROLES = ("qc_supervisor", "company_admin", "admin")
checkers = require_roles(*CHECKER_ROLES)
reviewers = require_roles(*REVIEWER_ROLES)

PHOTO_TYPES = ("image/jpeg", "image/png")
MAX_PHOTO_BYTES = 25 * 1024 * 1024

REFERENCE_LABELS = {
    "not_started": "Not prepared yet", "queued": "Waiting to be prepared", "processing": "Being prepared",
    "needs_review": "Waiting for supervisor approval", "approved": "Approved for checks",
    "rejected": "Rejected by a supervisor", "failed": "Could not be prepared",
}


def _json(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _visible_job(user: dict, job_id: str) -> dict:
    if not is_int(job_id):
        raise fail(404, "Job not found")
    job = db.one("SELECT id, job_number, design_name, company_id, status, current_version_id FROM jobs WHERE id = %s", (int(job_id),))
    if not job or not can_see(visible_company_ids(user), job["company_id"]):
        raise fail(404, "Job not found")
    return job


VERSION_SELECT = """
  SELECT v.id AS version_id, v.version_no, v.file_path, v.reference_status, v.reference_meta, v.reference_error,
         v.reference_prepared_at, v.reference_reviewed_at, v.reference_review_note, r.name AS reviewed_by_name,
         j.id AS job_id, j.job_number, j.design_name, j.company_id, c.name AS company_name
  FROM design_versions v
  JOIN jobs j ON j.id = v.job_id
  LEFT JOIN companies c ON c.id = j.company_id
  LEFT JOIN users r ON r.id = v.reference_reviewed_by
  WHERE 1=1"""


def _reference(row: dict) -> dict:
    meta = _json(row.get("reference_meta")) or {}
    return {
        "version_id": row["version_id"], "version_no": row["version_no"], "status": row["reference_status"],
        "status_label": REFERENCE_LABELS.get(row["reference_status"], row["reference_status"]),
        "design_path": row["file_path"], "preview": meta.get("preview"), "clean": meta.get("clean"),
        "panels": meta.get("panels"), "compare_fraction": meta.get("compare_fraction"),
        "inks": [{"name": i["name"], "hex": i["hex"], "is_board": i.get("is_board", False)} for i in meta.get("inks", [])],
        "error": row["reference_error"], "prepared_at": row["reference_prepared_at"],
        "reviewed_at": row["reference_reviewed_at"], "reviewed_by_name": row["reviewed_by_name"],
        "review_note": row["reference_review_note"],
        "job_id": row["job_id"], "job_number": row["job_number"], "design_name": row["design_name"],
        "company_name": row["company_name"],
    }


# ── Engine ───────────────────────────────────────────────────────────────────
@router.get("/engine/status")
def engine_status(_: dict = Depends(signed_in)):
    return ok(data=runner.status())


# ── References ───────────────────────────────────────────────────────────────
@router.get("/jobs/{job_id}/reference")
def job_reference(job_id: str, user: dict = Depends(signed_in)):
    job = _visible_job(user, job_id)
    row = db.one(f"{VERSION_SELECT} AND v.id = %s", (job["current_version_id"],))
    if not row:
        raise fail(404, "This job has no design version")
    return ok(data=_reference(row))


@router.post("/jobs/{job_id}/reference/prepare")
def prepare_job_reference(job_id: str, request: Request, user: dict = Depends(reviewers)):
    """Queue the current design version for (re)preparation, e.g. after a failure or rejection."""
    job = _visible_job(user, job_id)
    row = db.one("SELECT id, reference_status FROM design_versions WHERE id = %s", (job["current_version_id"],))
    if row["reference_status"] in ("queued", "processing"):
        return ok(message="Already being prepared")
    db.execute("""UPDATE design_versions SET reference_status = 'queued', reference_error = NULL,
                  reference_reviewed_by = NULL, reference_reviewed_at = NULL, reference_review_note = NULL WHERE id = %s""",
               (row["id"],))
    audit(request, "reference.queue", "design_version", row["id"], job["company_id"],
          {"job_number": job["job_number"], "previous_status": row["reference_status"]})
    runner.wake()
    return ok(message="Queued for preparation" if engine_enabled() else "Queued: it will be prepared once photo checks are switched on")


@router.get("/references")
def list_references(request: Request, user: dict = Depends(reviewers)):
    """Current design versions by reference status (default: waiting for review), newest first."""
    status = request.query_params.get("status") or "needs_review"
    if status not in REFERENCE_LABELS:
        raise fail(400, "Unknown status")
    scope_sql, params = scope_clause(visible_company_ids(user), "j.company_id")
    rows = db.all(f"""{VERSION_SELECT} AND j.current_version_id = v.id AND j.status = 'active'
                      AND v.reference_status = %s{scope_sql}
                      ORDER BY COALESCE(v.reference_prepared_at, v.created_at) DESC LIMIT 200""", [status] + params)
    counts = db.all(f"""SELECT v.reference_status AS status, COUNT(*) AS n FROM design_versions v JOIN jobs j ON j.id = v.job_id
                        WHERE j.current_version_id = v.id AND j.status = 'active'{scope_sql} GROUP BY v.reference_status""", params)
    return ok(data=[_reference(r) for r in rows], counts={c["status"]: int(c["n"]) for c in counts})


@router.post("/references/{version_id}/review")
async def review_reference(version_id: str, request: Request, user: dict = Depends(reviewers)):
    body = await read_body(request)
    decision = body.get("decision")
    note = (str(body.get("note") or "").strip() or None)
    if decision not in ("approve", "reject"):
        raise fail(400, "decision must be approve or reject")
    if decision == "reject" and not note:
        raise fail(400, "Say why the reference is rejected")
    row = db.one(f"{VERSION_SELECT} AND v.id = %s", (int(version_id),)) if is_int(version_id) else None
    if not row or not can_see(visible_company_ids(user), row["company_id"]):
        raise fail(404, "Reference not found")
    if row["reference_status"] not in ("needs_review", "approved", "rejected"):
        raise fail(409, f"This reference can't be reviewed now: {REFERENCE_LABELS[row['reference_status']].lower()}")

    new_status = "approved" if decision == "approve" else "rejected"
    db.execute("""UPDATE design_versions SET reference_status = %s, reference_reviewed_by = %s,
                  reference_reviewed_at = CURRENT_TIMESTAMP, reference_review_note = %s WHERE id = %s""",
               (new_status, user["id"], (note or "")[:255] or None, row["version_id"]))
    audit(request, f"reference.{'approve' if decision == 'approve' else 'reject'}", "design_version", row["version_id"],
          row["company_id"], {"job_number": row["job_number"], "version": row["version_no"],
                              "previous_status": row["reference_status"], "note": note})
    return ok(message=f"Reference {'approved' if decision == 'approve' else 'rejected'}")


@router.post("/references/backlog")
async def queue_backlog(request: Request, user: dict = Depends(require_roles("admin", "company_admin"))):
    """Queue current designs that were never prepared (phase 1's). Optional { limit }."""
    body = await read_body(request)
    limit = int(body["limit"]) if is_int(body.get("limit")) else 100000
    scope_sql, params = scope_clause(visible_company_ids(user), "j.company_id")
    ids = [r["id"] for r in db.all(f"""SELECT v.id FROM design_versions v JOIN jobs j ON j.current_version_id = v.id
                                       WHERE v.reference_status = 'not_started' AND j.status = 'active'{scope_sql}
                                       ORDER BY v.id DESC LIMIT %s""", params + [max(1, limit)])]
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        db.execute(f"UPDATE design_versions SET reference_status = 'queued' WHERE reference_status = 'not_started' "
                   f"AND id IN ({', '.join(['%s'] * len(chunk))})", chunk)
    audit(request, "reference.backlog", "design_version", None, user.get("company_id"), {"queued": len(ids)})
    runner.wake()
    return ok(message=f"{len(ids)} design(s) queued for preparation", data={"queued": len(ids)})


# ── Inspections ──────────────────────────────────────────────────────────────
INSPECTION_SELECT = """
  SELECT i.id, i.job_id, i.design_version_id, i.company_id, i.status, i.verdict, i.sensitivity, i.source,
         i.photo_path, i.defect_count, i.result, i.error, i.created_at, i.started_at, i.completed_at,
         u.name AS inspected_by_name, j.job_number, j.design_name, v.version_no, c.name AS company_name
  FROM inspections i
  JOIN users u ON u.id = i.inspected_by
  JOIN jobs j ON j.id = i.job_id
  JOIN design_versions v ON v.id = i.design_version_id
  LEFT JOIN companies c ON c.id = i.company_id
  WHERE 1=1"""


def _inspection(row: dict, full: bool = True) -> dict:
    out = {k: row[k] for k in ("id", "job_id", "job_number", "design_name", "version_no", "company_name", "status", "verdict",
                               "sensitivity", "source", "photo_path", "defect_count", "error", "created_at", "started_at",
                               "completed_at", "inspected_by_name")}
    result = _json(row.get("result")) or {}
    out["reasons"] = result.get("reasons", [])
    out["overlay"] = (result.get("images") or {}).get("overlay")
    if full:
        out["result"] = result
    return out


@router.post("/jobs/{job_id}/inspections")
async def create_inspection(job_id: str, request: Request, user: dict = Depends(checkers)):
    if not engine_enabled():
        raise fail(503, "Photo checks are not switched on on this server yet")
    form = await request.form(max_files=2)
    photo: Optional[UploadFile] = next((v for k, v in form.multi_items() if k == "photo" and isinstance(v, UploadFile)), None)
    sensitivity = form.get("sensitivity") or "normal"
    source = form.get("source") or "web"
    if sensitivity not in ("low", "normal", "high"):
        raise fail(400, "Sensitivity must be low, normal or high")
    if source not in ("web", "mobile", "camera"):
        raise fail(400, "Unknown source")
    if not photo:
        raise fail(400, "Take or choose a photo of the printed sheet")
    if photo.content_type not in PHOTO_TYPES:
        raise fail(400, "The photo must be a JPG or PNG image")
    data = await photo.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise fail(400, "The photo is larger than 25 MB")

    job = _visible_job(user, job_id)
    if job["status"] != "active":
        raise fail(409, "This job is archived")
    version = db.one("SELECT id, reference_status, reference_dir FROM design_versions WHERE id = %s", (job["current_version_id"],))
    if version["reference_status"] != "approved":
        raise fail(409, "This design can't be checked yet: " + REFERENCE_LABELS[version["reference_status"]].lower() + ".",
                   code="REFERENCE_NOT_APPROVED", reference_status=version["reference_status"])

    stored = store_inspection_photo(data, photo.content_type)
    new_id = db.execute(
        """INSERT INTO inspections (job_id, design_version_id, company_id, status, sensitivity, source, files_dir, photo_path,
                                    photo_sha256, inspected_by)
           VALUES (%s, %s, %s, 'queued', %s, %s, %s, %s, %s, %s)""",
        (job["id"], version["id"], job["company_id"], sensitivity, source, stored.files_dir, stored.photo_path,
         stored.sha256, user["id"]))
    audit(request, "inspection.create", "inspection", new_id, job["company_id"],
          {"job_number": job["job_number"], "design_version_id": version["id"], "sensitivity": sensitivity,
           "source": source, "photo_sha256": stored.sha256})
    runner.wake()
    return ok(message="Checking the print", data={"id": new_id, "status": "queued"})


@router.get("/inspections/{inspection_id}")
def get_inspection(inspection_id: str, user: dict = Depends(signed_in)):
    row = db.one(f"{INSPECTION_SELECT} AND i.id = %s", (int(inspection_id),)) if is_int(inspection_id) else None
    if not row or not can_see(visible_company_ids(user), row["company_id"]):
        raise fail(404, "Check not found")
    data = _inspection(row)
    if row["status"] in ("queued", "processing"):
        ahead = db.one("SELECT COUNT(*) AS n FROM inspections WHERE status IN ('queued','processing') AND id < %s", (row["id"],))
        data["queue_position"] = int(ahead["n"])
    return ok(data=data)


@router.get("/jobs/{job_id}/inspections")
def job_inspections(job_id: str, user: dict = Depends(signed_in)):
    job = _visible_job(user, job_id)
    rows = db.all(f"{INSPECTION_SELECT} AND i.job_id = %s ORDER BY i.id DESC LIMIT 50", (job["id"],))
    return ok(data=[_inspection(r, full=False) for r in rows])


@router.get("/inspections")
def recent_inspections(request: Request, user: dict = Depends(checkers)):
    """Recent checks in the user's companies. ?verdict=PASS|FAIL|RETAKE &mine=1 &limit=…"""
    scope_sql, params = scope_clause(visible_company_ids(user), "i.company_id")
    sql = f"{INSPECTION_SELECT}{scope_sql}"
    verdict = request.query_params.get("verdict")
    if verdict in ("PASS", "FAIL", "RETAKE"):
        sql += " AND i.verdict = %s"
        params.append(verdict)
    if request.query_params.get("mine") == "1":
        sql += " AND i.inspected_by = %s"
        params.append(user["id"])
    limit = int(request.query_params["limit"]) if is_int(request.query_params.get("limit")) else 100
    rows = db.all(sql + " ORDER BY i.id DESC LIMIT %s", params + [min(max(limit, 1), 500)])
    return ok(data=[_inspection(r, full=False) for r in rows])

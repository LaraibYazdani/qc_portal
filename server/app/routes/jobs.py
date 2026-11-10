"""Jobs and their design versions: search, upload, bulk upload, versions, edit, archive / restore."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Depends, Request
from starlette.datastructures import UploadFile

from .. import db
from ..config import LEGACY_DEFAULT_COMPANY_CODE
from ..http import ApiError, fail, invalid, ok, read_body
from ..lib.audit import audit
from ..lib.companies import (can_see, find_company, find_company_by_code, legal_entity_of, list_companies,
                             scope_clause, visible_company_ids)
from ..lib.job_number import is_usual_job_number, normalise_job_number, parse_design_filename
from ..lib.engine_runner import runner as engine
from ..lib.storage import StoredDesign, discard_stored_design, store_design_version
from ..security import managers, signed_in, uploaders
from ..validate import is_int

router = APIRouter()

MANAGER_ROLES = ("admin", "company_admin")
ALLOWED_MIME = ("image/jpeg", "image/png", "application/pdf")
MAX_FILE_BYTES = 20 * 1024 * 1024
BULK_MAX_FILES = 25

JOB_SELECT = """
  SELECT j.id, j.job_number, j.po_number, j.design_name, j.image_path, j.uploaded_by, j.created_at,
         j.company_id, j.status, j.archived_at, j.archive_reason,
         u.name AS uploaded_by_name, c.code AS company_code, c.name AS company_name,
         v.version_no AS current_version, v.reference_status
  FROM jobs j
  JOIN users u ON j.uploaded_by = u.id
  LEFT JOIN companies c ON j.company_id = c.id
  LEFT JOIN design_versions v ON j.current_version_id = v.id
  WHERE 1=1"""

_JOB_FIELDS = ("id", "job_number", "po_number", "design_name", "image_path", "uploaded_by", "uploaded_by_name",
               "created_at", "company_id", "company_code", "company_name", "status", "current_version",
               "archived_at", "archive_reason", "reference_status")


def to_job(row: dict) -> dict:
    return {k: row.get(k) for k in _JOB_FIELDS}


def _status_clause(status) -> str:
    if status == "archived":
        return " AND j.status = 'archived'"
    if status == "all":
        return ""
    return " AND j.status = 'active'"


def _confirmed(v) -> bool:
    """Multipart fields arrive as strings."""
    return v is True or v in ("true", "1")


# ── Uploaded files ───────────────────────────────────────────────────────────
@dataclass
class Upload:
    buffer: bytes
    mime: str
    filename: str


async def _read_upload(f: UploadFile) -> Upload:
    mime = f.content_type or ""
    if mime not in ALLOWED_MIME:
        raise fail(400, "Invalid file type. Only JPEG, PNG and PDF are allowed.")
    data = await f.read()
    if len(data) > MAX_FILE_BYTES:
        raise fail(400, "File is larger than 20 MB")
    return Upload(data, mime, f.filename or "upload")


async def _form(request: Request):
    """The multipart form: (text fields, files by field name)."""
    form = await request.form(max_files=BULK_MAX_FILES + 5)
    fields: dict = {}
    files: dict[str, list[UploadFile]] = {}
    for k, v in form.multi_items():
        if isinstance(v, UploadFile):
            files.setdefault(k, []).append(v)
        else:
            fields[k] = v
    return fields, files


async def _single_file(files: dict, field: str) -> Optional[Upload]:
    found = files.get(field) or []
    return await _read_upload(found[0]) if found else None


# ── Helpers ──────────────────────────────────────────────────────────────────
def _resolve_upload_company(user: dict, requested) -> dict:
    """The company a new job goes to: the one asked for (if the user may use it), else the user's own."""
    visible = visible_company_ids(user)
    if requested not in (None, ""):
        company = find_company(int(requested)) if is_int(requested) else None
        if not company or not company["is_active"]:
            raise fail(400, "Unknown company")
        if not can_see(visible, company["id"]):
            raise fail(400, "You cannot upload for that company")
        return company
    if user.get("company_id"):
        return find_company(user["company_id"])
    fallback = find_company_by_code(LEGACY_DEFAULT_COMPANY_CODE)
    if not fallback:
        raise fail(400, "Choose a company for this upload")
    return fallback


def _find_job_in_legal_entity(company: dict, job_number: str, conn: Optional[db.Conn] = None) -> Optional[dict]:
    """Existing job with the same number in the same legal entity (archived ones included)."""
    entity = legal_entity_of(list_companies(), company["id"])
    return db.one("SELECT id, status, company_id FROM jobs WHERE legal_entity_id = %s AND job_number = %s",
                  (entity["id"], job_number), conn)


def _load_job_for_user(user: dict, job_id: str) -> dict:
    if not is_int(job_id):
        raise fail(404, "Job not found")
    row = db.one(f"{JOB_SELECT} AND j.id = %s", (int(job_id),))
    if not row or not can_see(visible_company_ids(user), row["company_id"]):
        raise fail(404, "Job not found")
    return row


def save_design(request: Request, conn: db.Conn, company: dict, job_number: str, design_name: Optional[str],
                po_number: Optional[str], file: Upload, existing_job_id: Optional[int] = None,
                change_note: Optional[str] = None, job_number_note: Optional[str] = None) -> tuple[int, int]:
    """
    Create a job with design version 1, or add a new version to an existing job,
    in one transaction together with its audit entry. Returns (job id, version number).
    """
    user = request.state.user
    job_id = existing_job_id
    version_no = 1
    if job_id:
        conn.one("SELECT id FROM jobs WHERE id = %s FOR UPDATE", (job_id,))
        version_no = int(conn.one("SELECT COALESCE(MAX(version_no), 0) AS m FROM design_versions WHERE job_id = %s", (job_id,))["m"]) + 1

    stored: Optional[StoredDesign] = None
    try:
        stored = store_design_version(file.buffer, file.mime, file.filename, company["code"], job_number, version_no)
        if not job_id:
            entity = legal_entity_of(list_companies(), company["id"])
            job_id = conn.execute(
                """INSERT INTO jobs (job_number, company_id, legal_entity_id, po_number, design_name, image_path, uploaded_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (job_number, company["id"], entity["id"], po_number, design_name, stored.file_path, user["id"]))

        version_id = conn.execute(
            # Every new design version is queued for the print-check engine (prepared once the engine is on)
            """INSERT INTO design_versions
                 (job_id, version_no, file_path, original_path, original_filename, mime_type, file_size, sha256, uploaded_by,
                  change_note, reference_status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'queued')""",
            (job_id, version_no, stored.file_path, stored.original_path, file.filename[:255], file.mime,
             stored.size, stored.sha256, user["id"], change_note))

        if existing_job_id:
            conn.execute("UPDATE jobs SET current_version_id = %s, image_path = %s, design_name = COALESCE(%s, design_name) WHERE id = %s",
                         (version_id, stored.file_path, design_name, job_id))
        else:
            conn.execute("UPDATE jobs SET current_version_id = %s, image_path = %s WHERE id = %s",
                         (version_id, stored.file_path, job_id))

        details = {"job_number": job_number, "version": version_no, "file": stored.file_path,
                   "original_filename": file.filename, "sha256": stored.sha256, "note": change_note}
        if job_number_note:
            details["job_number_note"] = job_number_note
        audit(request, "job.create" if version_no == 1 else "job.new_version", "job", job_id, company["id"], details, conn)
        engine.wake()
        return job_id, version_no
    except BaseException:
        if stored:
            discard_stored_design(stored)
        raise


def _is_duplicate(e: Exception) -> bool:
    return getattr(e, "args", [None])[0] == 1062  # ER_DUP_ENTRY


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/search")
def search(request: Request):
    """Public (operator page). Exact match, active jobs only. An empty search returns nothing."""
    job_number, po_number = request.query_params.get("job_number"), request.query_params.get("po_number")
    if not job_number and not po_number:
        return ok(data=[])
    sql, params = f"{JOB_SELECT} AND j.status = 'active'", []
    if job_number:
        sql += " AND j.job_number = %s"
        params.append(job_number.upper())
    if po_number:
        sql += " AND j.po_number = %s"
        params.append(po_number)
    return ok(data=[to_job(r) for r in db.all(sql + " ORDER BY j.created_at DESC", params)])


@router.get("")
@router.get("/")
def list_jobs(request: Request, user: dict = Depends(managers)):
    """Group admin: everything; company admin: their companies. ?status=active (default) | archived | all"""
    scope_sql, params = scope_clause(visible_company_ids(user), "j.company_id")
    rows = db.all(f"{JOB_SELECT}{_status_clause(request.query_params.get('status'))}{scope_sql} ORDER BY j.created_at DESC", params)
    return ok(data=[to_job(r) for r in rows])


@router.get("/my-jobs")
def my_jobs(user: dict = Depends(signed_in)):
    """Uploaders see their own uploads; admins see what they manage."""
    sql, params = f"{JOB_SELECT} AND j.status = 'active'", []
    if user["role"] in MANAGER_ROLES:
        scope_sql, params = scope_clause(visible_company_ids(user), "j.company_id")
        sql += scope_sql
    else:
        sql += " AND j.uploaded_by = %s"
        params.append(user["id"])
    return ok(data=[to_job(r) for r in db.all(sql + " ORDER BY j.created_at DESC", params)])


@router.post("")
@router.post("/")
async def create_job(request: Request, user: dict = Depends(uploaders)):
    fields, files = await _form(request)
    raw_number = (fields.get("job_number") or "").strip()
    if not raw_number:
        raise invalid("Job number required", "job_number")
    if fields.get("company_id") and not is_int(fields["company_id"]):
        raise invalid("Invalid value", "company_id")
    file = await _single_file(files, "design")
    if not file:
        raise fail(400, "Design file required")

    company = _resolve_upload_company(user, fields.get("company_id"))
    job_number = normalise_job_number(raw_number)
    unusual = not is_usual_job_number(job_number)
    if unusual and not _confirmed(fields.get("allow_unusual")):
        raise fail(400, f"\"{job_number}\" doesn't look like a job number (e.g. 267N2943). Check it, or confirm to save it as it is.",
                   code="UNUSUAL_JOB_NUMBER")
    existing = _find_job_in_legal_entity(company, job_number)
    if existing:
        raise fail(400, "Job number already exists (archived). Ask an admin to restore it."
                   if existing["status"] == "archived" else "Job number already exists")
    try:
        with db.transaction() as tx:
            job_id, _ = save_design(request, tx, company, job_number, fields.get("design_name") or None,
                                    fields.get("po_number") or None, file,
                                    job_number_note="Unusual job number confirmed by the uploader" if unusual else None)
    except Exception as e:  # noqa: BLE001
        if _is_duplicate(e):
            raise fail(400, "Job number already exists")
        raise
    return ok(message="Job created successfully", data={"id": job_id})


@router.post("/bulk")
async def bulk_upload(request: Request, user: dict = Depends(uploaders)):
    """
    File names follow JOBNUMBER_DESIGNNAME.ext (see lib/job_number.py for the exceptions).
    Files whose job number looks unusual are only saved when allow_unusual=true.
    """
    fields, files = await _form(request)
    raw_files = files.get("designs") or []
    if len(raw_files) > BULK_MAX_FILES:
        raise fail(400, f"Too many files: at most {BULK_MAX_FILES} per batch")
    uploads = [await _read_upload(f) for f in raw_files]
    if not uploads:
        raise fail(400, "No files provided")

    company = _resolve_upload_company(user, fields.get("company_id"))
    allow_unusual = _confirmed(fields.get("allow_unusual"))
    created_in_batch: dict[str, int] = {}
    results = []

    def result(f: Upload, job, design, status, message):
        results.append({"filename": f.filename, "job_number": job, "design_name": design, "status": status, "message": message})

    for f in uploads:
        parsed = parse_design_filename(f.filename)
        if parsed.error or not parsed.job_number:
            result(f, None, None, "failed", parsed.error or "Invalid file name")
            continue
        job, design = parsed.job_number, parsed.design_name
        if parsed.unusual and not allow_unusual:
            result(f, job, design, "failed", f'{parsed.note} Not uploaded: tick "upload anyway" to confirm.')
            continue
        note = f"Unusual job number confirmed by the uploader. {parsed.note}" if parsed.unusual else parsed.note

        def with_note(msg: str) -> str:
            return f"{msg}. {parsed.note}" if parsed.note and not parsed.unusual else msg

        try:
            if job in created_in_batch:
                # Duplicate within this same batch: the later file becomes a new version
                with db.transaction() as tx:
                    _, version_no = save_design(request, tx, company, job, design, None, f,
                                                existing_job_id=created_in_batch[job],
                                                change_note="Duplicate in the same bulk upload", job_number_note=note)
                result(f, job, design, "updated", with_note(f"Saved as version {version_no} of a job created earlier in this batch"))
                continue
            if _find_job_in_legal_entity(company, job):
                # Existed before this batch: protect it, don't overwrite
                result(f, job, design, "failed", "Job number already exists")
                continue
            with db.transaction() as tx:
                job_id, _ = save_design(request, tx, company, job, design, None, f, job_number_note=note)
            created_in_batch[job] = job_id
            result(f, job, design, "created", with_note("Job created successfully"))
        except Exception as e:  # noqa: BLE001
            print(f"Bulk upload file error: {e!r}")
            result(f, job, design, "failed", "Server error while processing this file")

    return ok(results=results)


@router.get("/{job_id}/versions")
def versions(job_id: str, user: dict = Depends(signed_in)):
    job = _load_job_for_user(user, job_id)
    rows = db.all(
        """SELECT v.*, u.name AS uploaded_by_name, (j.current_version_id = v.id) AS is_current
           FROM design_versions v JOIN users u ON v.uploaded_by = u.id JOIN jobs j ON v.job_id = j.id
           WHERE v.job_id = %s ORDER BY v.version_no DESC""",
        (job["id"],),
    )
    keys = ("id", "version_no", "file_path", "original_path", "original_filename", "mime_type", "file_size",
            "change_note", "reference_status", "uploaded_by", "uploaded_by_name", "created_at")
    return ok(data=[{**{k: r.get(k) for k in keys}, "is_current": bool(r["is_current"])} for r in rows])


@router.post("/{job_id}/versions")
async def new_version(job_id: str, request: Request, user: dict = Depends(uploaders)):
    """Upload a new design version; earlier versions are kept."""
    fields, files = await _form(request)
    file = await _single_file(files, "design")
    if not file:
        raise fail(400, "Design file required")
    job = _load_job_for_user(user, job_id)
    if job["status"] == "archived":
        raise fail(400, "Restore the job before uploading a new version")
    company = find_company(job["company_id"])
    with db.transaction() as tx:
        _, version_no = save_design(request, tx, company, job["job_number"], fields.get("design_name") or None, None, file,
                                    existing_job_id=job["id"], change_note=fields.get("change_note") or None)
    return ok(message=f"Version {version_no} uploaded", data={"version": version_no})


@router.put("/{job_id}")
async def update_job(job_id: str, request: Request, user: dict = Depends(managers)):
    """Edit details and/or replace the design. A replaced design becomes a new version."""
    ctype = request.headers.get("content-type", "")
    if "multipart/form-data" in ctype:
        fields, files = await _form(request)
        file = await _single_file(files, "design")
    else:
        fields, file = await read_body(request), None
    job = _load_job_for_user(user, job_id)
    po_number, design_name = fields.get("po_number") or None, fields.get("design_name") or None
    company = find_company(job["company_id"])

    with db.transaction() as tx:
        if file:
            save_design(request, tx, company, job["job_number"], None, None, file, existing_job_id=job["id"],
                        change_note=fields.get("change_note") or "Replaced by admin")
        tx.execute("UPDATE jobs SET po_number = %s, design_name = %s WHERE id = %s", (po_number, design_name, job["id"]))
        if po_number != job["po_number"] or design_name != job["design_name"]:
            audit(request, "job.update", "job", job["id"], job["company_id"], {
                "before": {"po_number": job["po_number"], "design_name": job["design_name"]},
                "after": {"po_number": po_number, "design_name": design_name},
            }, tx)
    return ok(message="Job updated successfully")


@router.delete("/{job_id}")
async def archive_job(job_id: str, request: Request, user: dict = Depends(managers)):
    """Jobs and their files are never deleted, only hidden from use. Optional reason in body or ?reason="""
    job = _load_job_for_user(user, job_id)
    if job["status"] == "archived":
        return ok(message="Job is already archived")
    body = await read_body(request)
    reason = str(body.get("reason") or request.query_params.get("reason") or "")[:255] or None
    with db.transaction() as tx:
        tx.execute("UPDATE jobs SET status = 'archived', archived_at = CURRENT_TIMESTAMP, archived_by = %s, archive_reason = %s WHERE id = %s",
                   (user["id"], reason, job["id"]))
        audit(request, "job.archive", "job", job["id"], job["company_id"], {"job_number": job["job_number"], "reason": reason}, tx)
    return ok(message="Job archived. It no longer appears in searches and can be restored.")


@router.post("/{job_id}/restore")
def restore_job(job_id: str, request: Request, user: dict = Depends(managers)):
    job = _load_job_for_user(user, job_id)
    if job["status"] != "archived":
        return ok(message="Job is not archived")
    with db.transaction() as tx:
        tx.execute("UPDATE jobs SET status = 'active', archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = %s",
                   (job["id"],))
        audit(request, "job.restore", "job", job["id"], job["company_id"],
              {"job_number": job["job_number"], "was_archived_because": job["archive_reason"]}, tx)
    return ok(message="Job restored")

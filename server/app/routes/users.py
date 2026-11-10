"""User management. Group admins manage everyone; company admins manage users in their own companies."""
from __future__ import annotations

from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, Request

from .. import db
from ..http import ApiError, fail, invalid, ok, read_body
from ..lib.audit import audit
from ..lib.companies import can_see, list_companies, scope_clause, visible_company_ids
from ..lib.sf_sync import place_employee, sf_columns, sync_user
from ..lib.successfactors import SfError, get_business_unit_name, get_employee, is_valid_employee_id, sf_configured
from ..security import ROLES, STATUSES, managers
from ..validate import is_email, is_int, one_of, optional_int, required_text

router = APIRouter()

USER_SELECT = """
  SELECT u.id, u.name, u.email, u.role, u.company_id, u.company_manual, u.sf_employee_id, u.status, u.auth_source,
         u.sf_company_code, u.sf_business_unit, u.sf_division, u.sf_job_title, u.sf_synced_at,
         u.last_login_at, u.created_at, c.code AS company_code, c.name AS company_name
  FROM users u LEFT JOIN companies c ON u.company_id = c.id
  WHERE 1=1"""

_ROLE_MSG = f"Role must be one of: {', '.join(ROLES)}"
_STATUS_MSG = f"Status must be one of: {', '.join(STATUSES)}"
_SF_MISSING = "SuccessFactors is not configured on this server"


def to_user(r: dict) -> dict:
    return {
        "id": r["id"], "name": r["name"], "email": r["email"], "role": r["role"],
        "company_id": r["company_id"], "company_code": r["company_code"], "company_name": r["company_name"],
        "company_manual": bool(r["company_manual"]), "status": r["status"], "created_at": r["created_at"],
        "sf_employee_id": r["sf_employee_id"], "auth_source": r["auth_source"], "last_login_at": r["last_login_at"],
        "sf_job_title": r["sf_job_title"], "sf_company_code": r["sf_company_code"],
        "sf_business_unit": r["sf_business_unit"], "sf_synced_at": r["sf_synced_at"],
    }


def _check_assignment(manager: dict, role: Optional[str], company_id, company_given: bool) -> None:
    """Company admins may not hand out group-admin rights or reach outside their own companies."""
    if manager["role"] == "admin":
        return
    if role == "admin":
        raise fail(403, "Only a group admin can grant group admin access")
    if company_given and (company_id is None or not can_see(visible_company_ids(manager), company_id)):
        raise fail(403, "You can only assign users to your own companies")


def _load_managed_user(manager: dict, user_id: str) -> dict:
    if not is_int(user_id):
        raise fail(404, "User not found")
    row = db.one(f"{USER_SELECT} AND u.id = %s", (int(user_id),))
    if not row or (manager["role"] != "admin" and not can_see(visible_company_ids(manager), row["company_id"])):
        raise fail(404, "User not found")
    return row


def _sf_failure(e: Exception) -> ApiError:
    if isinstance(e, SfError) and not e.status:
        return fail(400, str(e))
    print(f"SuccessFactors error: {e!r}")
    return fail(502, "SuccessFactors could not be reached. Try again shortly.")


@router.get("")
@router.get("/")
def list_users(request: Request, user: dict = Depends(managers)):
    """?status=pending|active|disabled. Waiting users first."""
    scope_sql, params = scope_clause(visible_company_ids(user), "u.company_id")
    status = request.query_params.get("status")
    status = status if status in STATUSES else None
    rows = db.all(f"{USER_SELECT}{scope_sql}{' AND u.status = %s' if status else ''} "
                  "ORDER BY u.status = 'pending' DESC, u.created_at DESC", params + ([status] if status else []))
    return ok(data=[to_user(r) for r in rows])


@router.get("/sf-lookup/{employee_id}")
def sf_lookup(employee_id: str, user: dict = Depends(managers)):
    """Who an employee is, where the rules place them, and whether they already have an account."""
    employee_id = employee_id.strip()
    if not sf_configured():
        raise fail(503, _SF_MISSING)
    if not is_valid_employee_id(employee_id):
        raise fail(400, "Enter a valid employee ID")
    try:
        emp = get_employee(employee_id)
        if not emp:
            raise fail(404, f"No active employee {employee_id} in SuccessFactors")
        company = place_employee(emp)
        existing = db.one(f"{USER_SELECT} AND (u.sf_employee_id = %s OR (u.sf_employee_id IS NULL AND u.email = %s))",
                          (employee_id, emp.email or ""))
        return ok(data={
            "employee": {**emp.as_dict(), "businessUnitName": get_business_unit_name(emp.businessUnit)},
            "company": {k: company[k] for k in ("id", "code", "name")} if company else None,
            "can_assign": bool(company) and can_see(visible_company_ids(user), company["id"]),
            "existing_user": to_user(existing) if existing else None,
        })
    except ApiError:
        raise
    except Exception as e:  # noqa: BLE001
        raise _sf_failure(e)


@router.post("")
@router.post("/")
async def create_local_user(request: Request, user: dict = Depends(managers)):
    """Email + password account. SAP users are added from SuccessFactors or register on first sign-in."""
    body = await read_body(request)
    name = required_text(body, "name", "Name required")
    if not is_email(body.get("email")):
        raise invalid("Valid email required", "email")
    if not isinstance(body.get("password"), str) or len(body["password"]) < 8:
        raise invalid("Password must be at least 8 characters", "password")
    role = one_of(body, "role", ROLES, _ROLE_MSG)
    company_id = optional_int(body, "company_id")

    _check_assignment(user, role, company_id, True)
    if role != "admin" and company_id is None:
        raise fail(400, "Choose a company for this user")
    if db.one("SELECT id FROM users WHERE email = %s", (body["email"],)):
        raise fail(400, "Email already exists")

    hashed = bcrypt.hashpw(body["password"].encode(), bcrypt.gensalt(10)).decode()
    new_id = db.execute("INSERT INTO users (name, email, password, role, company_id) VALUES (%s, %s, %s, %s, %s)",
                        (name, body["email"], hashed, role, None if role == "admin" else company_id))
    audit(request, "user.create", "user", new_id, company_id, {"name": name, "email": body["email"], "role": role})
    return ok(message="User created successfully", data={"id": new_id})


@router.post("/from-sf")
async def create_from_sf(request: Request, user: dict = Depends(managers)):
    """Add a user straight from SuccessFactors; they sign in with SAP, no password.
    A phase 1 account with the same email is linked instead of duplicated."""
    body = await read_body(request)
    employee_id = required_text(body, "employee_id", "Employee ID required")
    role = one_of(body, "role", ROLES, _ROLE_MSG)
    chosen = optional_int(body, "company_id")
    if not sf_configured():
        raise fail(503, _SF_MISSING)
    if not is_valid_employee_id(employee_id):
        raise fail(400, "Enter a valid employee ID")

    try:
        emp = get_employee(employee_id)
    except Exception as e:  # noqa: BLE001
        raise _sf_failure(e)
    if not emp:
        raise fail(404, f"No active employee {employee_id} in SuccessFactors")

    placed = place_employee(emp)
    manual = chosen is not None and chosen != (placed["id"] if placed else None)
    company_id = None if role == "admin" else (chosen if chosen is not None else (placed["id"] if placed else None))
    if manual and not any(c["id"] == chosen for c in list_companies()):
        raise fail(400, "Unknown company")
    if role != "admin" and company_id is None:
        raise fail(400, "No SuccessFactors rule places this employee in a company. Choose one.")
    _check_assignment(user, role, company_id, True)

    by_sf = db.one("SELECT id FROM users WHERE sf_employee_id = %s", (employee_id,))
    if by_sf:
        raise fail(409, "This employee already has an account", data={"id": by_sf["id"]})
    link_to = db.one(f"{USER_SELECT} AND u.email = %s", (emp.email,)) if emp.email else None
    if link_to and link_to["sf_employee_id"]:
        raise fail(409, f"The email {emp.email} belongs to another employee's account")
    if link_to and user["role"] != "admin" and not can_see(visible_company_ids(user), link_to["company_id"]):
        raise fail(403, "An account with this email exists outside your companies")

    cols = list(sf_columns(emp).values())
    try:
        if link_to:
            new_id = link_to["id"]
            db.execute(
                """UPDATE users SET sf_employee_id = %s, auth_source = 'ias', role = %s, company_id = %s, company_manual = %s,
                          status = 'active', sf_company_code = %s, sf_business_unit = %s, sf_division = %s, sf_job_title = %s,
                          sf_synced_at = CURRENT_TIMESTAMP WHERE id = %s""",
                (employee_id, role, company_id, 1 if manual else 0, *cols, new_id))
            audit(request, "user.link_sf", "user", new_id, company_id, {
                "sf_employee_id": employee_id, "matched_on": "email",
                "before": {"role": link_to["role"], "company_id": link_to["company_id"], "status": link_to["status"]},
                "after": {"role": role, "company_id": company_id, "company_manual": manual}})
        else:
            email = emp.email if emp.email and len(emp.email) <= 191 else f"sf-{employee_id}@no-email.invalid"
            new_id = db.execute(
                """INSERT INTO users (name, email, password, role, company_id, company_manual, sf_employee_id, status, auth_source,
                                      sf_company_code, sf_business_unit, sf_division, sf_job_title, sf_synced_at)
                   VALUES (%s, %s, NULL, %s, %s, %s, %s, 'active', 'ias', %s, %s, %s, %s, CURRENT_TIMESTAMP)""",
                (emp.name[:100], email, role, company_id, 1 if manual else 0, employee_id, *cols))
            audit(request, "user.create", "user", new_id, company_id, {
                "source": "successfactors", "sf_employee_id": employee_id, "name": emp.name, "role": role,
                "company_rule": placed["code"] if placed else None, "company_manual": manual})
    except Exception as e:  # noqa: BLE001
        if getattr(e, "args", [None])[0] == 1062:
            raise fail(409, "An account with this employee ID or email already exists")
        raise
    return ok(message="Existing account linked to SuccessFactors" if link_to else "User added",
              data={"id": new_id, "linked": bool(link_to)})


@router.post("/{user_id}/sf-sync")
async def sf_sync(user_id: str, request: Request, user: dict = Depends(managers)):
    """Refresh one user from SuccessFactors. { reset_company: true } lets the rules decide the company again."""
    if not sf_configured():
        raise fail(503, _SF_MISSING)
    body = await read_body(request)
    target = _load_managed_user(user, user_id)
    if not target["sf_employee_id"]:
        raise fail(400, "This user is not linked to a SuccessFactors employee")
    if target["id"] == user["id"]:
        raise fail(400, "You cannot sync your own account here")

    if body.get("reset_company") and target["company_manual"]:
        db.execute("UPDATE users SET company_manual = 0 WHERE id = %s", (target["id"],))
        audit(request, "user.update", "user", target["id"], target["company_id"], {
            "before": {"company_manual": 1}, "after": {"company_manual": 0}, "reason": "Company follows SuccessFactors again"})
        target = {**target, "company_manual": 0}

    try:
        emp = get_employee(target["sf_employee_id"])
    except Exception as e:  # noqa: BLE001
        raise _sf_failure(e)
    if emp:
        placed = place_employee(emp)
        if placed and not target["company_manual"] and user["role"] != "admin" \
                and not can_see(visible_company_ids(user), placed["id"]):
            raise fail(403, f"SuccessFactors now places this user in {placed['name']}, outside your companies. Ask a group admin.")
    result = sync_user(request, target, emp)
    row = db.one(f"{USER_SELECT} AND u.id = %s", (target["id"],))
    message = ("Not an active employee in SuccessFactors: account disabled" if result.disabled
               else "Updated from SuccessFactors" if result.changes else "Already up to date")
    return ok(message=message, data={"user": to_user(row), "changes": result.changes,
                                     "company_kept_manual": result.company_kept_manual})


@router.put("/{user_id}")
async def update_user(user_id: str, request: Request, user: dict = Depends(managers)):
    """Name, email, role, company, status."""
    body = await read_body(request)
    if "name" in body and not str(body.get("name") or "").strip():
        raise invalid("Name cannot be empty", "name")
    if "email" in body and not is_email(body.get("email")):
        raise invalid("Valid email required", "email")
    role = one_of(body, "role", ROLES, _ROLE_MSG, required=False)
    status = one_of(body, "status", STATUSES, _STATUS_MSG, required=False)
    company_given = "company_id" in body
    company_id = optional_int(body, "company_id") if company_given else None

    existing = _load_managed_user(user, user_id)
    _check_assignment(user, role, company_id, company_given)
    if existing["role"] == "admin" and user["role"] != "admin":
        raise fail(403, "Only a group admin can change a group admin")
    if existing["id"] == user["id"] and ((status and status != "active") or (role and role != user["role"])):
        raise fail(400, "You cannot change your own role or status")
    email = body.get("email")
    if email and email != existing["email"] and db.one("SELECT id FROM users WHERE email = %s AND id != %s", (email, existing["id"])):
        raise fail(400, "Email already exists")

    changes: dict = {}
    if "name" in body:
        changes["name"] = body["name"]
    if "email" in body:
        changes["email"] = email
    if role is not None:
        changes["role"] = role
    if company_given:
        changes["company_id"] = company_id
        # A company picked by hand sticks: SuccessFactors syncs won't move this user any more.
        if company_id != existing["company_id"] and existing["sf_employee_id"]:
            changes["company_manual"] = 1
    if status is not None:
        changes["status"] = status
    if not changes:
        raise fail(400, "No fields to update")

    db.execute(f"UPDATE users SET {', '.join(f'{f} = %s' for f in changes)} WHERE id = %s", [*changes.values(), existing["id"]])
    action = ("user.approve" if existing["status"] == "pending" and status == "active"
              else "user.role_change" if role is not None and role != existing["role"] else "user.update")
    audit(request, action, "user", existing["id"], company_id if company_given and company_id is not None else existing["company_id"],
          {"before": {f: existing.get(f) for f in changes}, "after": changes})
    return ok(message="User updated successfully")


@router.delete("/{user_id}")
def disable_user(user_id: str, request: Request, user: dict = Depends(managers)):
    """Disables the account: users are kept so every upload and check stays traceable."""
    existing = _load_managed_user(user, user_id)
    if existing["id"] == user["id"]:
        raise fail(400, "You cannot disable your own account")
    if existing["role"] == "admin" and user["role"] != "admin":
        raise fail(403, "Only a group admin can disable a group admin")
    db.execute("UPDATE users SET status = 'disabled' WHERE id = %s", (existing["id"],))
    audit(request, "user.disable", "user", existing["id"], existing["company_id"],
          {"email": existing["email"], "previous_status": existing["status"]})
    return ok(message="User disabled. Their uploads and history are kept.")

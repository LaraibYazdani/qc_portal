"""
What happens when an employee signs in with SAP: find (or link, or register)
their portal account and bring it in line with SuccessFactors.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Request

from .. import db
from .audit import audit
from .sf_sync import place_employee, sf_columns, sync_user
from .successfactors import SfEmployee, get_employee, sf_configured

_USER_COLUMNS = """id, name, email, role, company_id, company_manual, status, auth_source, sf_employee_id,
  sf_company_code, sf_business_unit, sf_division, sf_job_title"""


def _find(where: str, value) -> Optional[dict]:
    return db.one(f"SELECT {_USER_COLUMNS} FROM users WHERE {where}", (value,))


def sign_in_employee(request: Request, employee_id: str) -> tuple[str, Optional[int]]:
    """(outcome, user id). Outcome: active | pending | disabled | not_in_sf | sf_unavailable."""
    emp: Optional[SfEmployee] = None
    sf_down = not sf_configured()
    if not sf_down:
        try:
            emp = get_employee(employee_id)
        except Exception as e:  # noqa: BLE001
            sf_down = True
            print(f"[ias] SuccessFactors lookup failed: {e}")

    user = _find("sf_employee_id = %s", employee_id)

    # A phase 1 account with the same email: link it instead of creating a second account.
    if not user and emp and emp.email:
        by_email = _find("email = %s AND sf_employee_id IS NULL", emp.email)
        if by_email:
            db.execute("UPDATE users SET sf_employee_id = %s, auth_source = 'ias' WHERE id = %s", (employee_id, by_email["id"]))
            audit(request, "user.link_sf", "user", by_email["id"], by_email["company_id"],
                  {"sf_employee_id": employee_id, "matched_on": "email"})
            user = {**by_email, "sf_employee_id": employee_id}

    if not user:
        if sf_down:
            return "sf_unavailable", None
        if not emp:
            return "not_in_sf", None
        return "pending", _register_pending(request, emp)

    # SuccessFactors unreachable: existing accounts keep working on what we already know.
    if not sf_down:
        sync_user(request, user, emp)
        user = _find("id = %s", user["id"])

    if user["status"] != "active":
        return user["status"], user["id"]

    db.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = %s", (user["id"],))
    request.state.user = user
    audit(request, "auth.login", "user", user["id"], user["company_id"],
          {"method": "ias", "sf_employee_id": employee_id, "sf_checked": not sf_down})
    return "active", user["id"]


def _register_pending(request: Request, emp: SfEmployee) -> int:
    """First SAP sign-in of someone without an account: kept waiting, with no access, until an admin approves."""
    company = place_employee(emp)
    email = emp.email if emp.email and len(emp.email) <= 191 else None
    if email and _find("email = %s", email):
        email = None
    email = email or f"sf-{emp.userId}@no-email.invalid"

    cols = sf_columns(emp)
    new_id = db.execute(
        """INSERT INTO users (name, email, password, role, company_id, sf_employee_id, status, auth_source,
                              sf_company_code, sf_business_unit, sf_division, sf_job_title, sf_synced_at)
           VALUES (%s, %s, NULL, 'operator', %s, %s, 'pending', 'ias', %s, %s, %s, %s, CURRENT_TIMESTAMP)""",
        (emp.name[:100], email, company["id"] if company else None, emp.userId, *cols.values()),
    )
    audit(request, "user.self_register", "user", new_id, company["id"] if company else None,
          {"sf_employee_id": emp.userId, "company": company["code"] if company else None,
           "sf_company_code": emp.company, "sf_business_unit": emp.businessUnit})
    return new_id

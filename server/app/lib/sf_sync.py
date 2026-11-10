"""
Keeping portal users in step with SuccessFactors: which company an employee
belongs to, and refreshing a user's name, email and placement from their record.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from fastapi import Request

from .. import db
from .audit import audit
from .companies import list_companies
from .sf_resolver import resolve_company_id
from .successfactors import SfEmployee


def load_mappings() -> list[dict]:
    return db.all("SELECT id, company_id, sf_company_code, sf_field, match_type, sf_value, priority FROM company_sf_mappings")


def place_employee(emp: SfEmployee) -> Optional[dict]:
    """The company the SuccessFactors rules place this employee in, or None when no rule matches."""
    cid = resolve_company_id(emp.as_dict(), load_mappings())
    if cid is None:
        return None
    return next((c for c in list_companies() if c["id"] == cid and c["is_active"]), None)


def sf_columns(emp: SfEmployee) -> dict:
    """The SuccessFactors fields kept on the user row (in column order)."""
    return {
        "sf_company_code": emp.company,
        "sf_business_unit": emp.businessUnit,
        "sf_division": emp.division,
        "sf_job_title": emp.jobTitle[:150] if emp.jobTitle else None,
    }


@dataclass
class SyncResult:
    changes: dict = field(default_factory=dict)
    disabled: bool = False
    company_kept_manual: bool = False


def sync_user(request: Optional[Request], user: dict, emp: Optional[SfEmployee], conn: Optional[db.Conn] = None) -> SyncResult:
    """
    Refresh one user from their SuccessFactors record (`emp`, or None when SuccessFactors
    has no active employee with that ID, which disables the account). Name, email, the
    SuccessFactors fields and, unless an admin placed the user by hand, the company.
    Every real change is written to the audit log.
    """
    if emp is None:
        if user["status"] == "disabled":
            return SyncResult(disabled=True)
        db.execute("UPDATE users SET status = 'disabled', sf_synced_at = CURRENT_TIMESTAMP WHERE id = %s", (user["id"],), conn)
        audit(request, "user.disable", "user", user["id"], user["company_id"],
              {"reason": "Not an active employee in SuccessFactors", "sf_employee_id": user["sf_employee_id"],
               "previous_status": user["status"]}, conn)
        return SyncResult(changes={"status": {"before": user["status"], "after": "disabled"}}, disabled=True)

    wanted: dict = dict(sf_columns(emp))
    if emp.name and emp.name[:100] != user["name"]:
        wanted["name"] = emp.name[:100]
    if emp.email and len(emp.email) <= 191 and emp.email.lower() != str(user.get("email") or "").lower():
        if not db.one("SELECT id FROM users WHERE email = %s AND id <> %s", (emp.email, user["id"]), conn):
            wanted["email"] = emp.email

    kept_manual = False
    placed = place_employee(emp)
    if placed and placed["id"] != user["company_id"]:
        if user["company_manual"]:
            kept_manual = True
        elif user["role"] != "admin":  # group admins stay group-wide
            wanted["company_id"] = placed["id"]

    changes = {k: {"before": user.get(k), "after": v} for k, v in wanted.items() if user.get(k) != v}
    fields = list(changes)
    sets = [f"{f} = %s" for f in fields] + ["sf_synced_at = CURRENT_TIMESTAMP"]
    db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = %s", [changes[f]["after"] for f in fields] + [user["id"]], conn)
    if fields:
        audit(request, "user.sf_sync", "user", user["id"], changes.get("company_id", {}).get("after") or user["company_id"],
              {"sf_employee_id": emp.userId, "changes": changes, "company_kept_manual": kept_manual}, conn)
    return SyncResult(changes=changes, company_kept_manual=kept_manual)

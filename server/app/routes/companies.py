"""Company tree and SuccessFactors → company rules."""
import re

from fastapi import APIRouter, Depends, Request

from .. import db
from ..http import fail, invalid, ok, read_body
from ..lib.audit import audit
from ..lib.companies import invalidate_company_cache, list_companies, visible_company_ids
from ..security import group_admin, signed_in
from ..validate import is_int, optional_int

router = APIRouter()

SF_FIELDS = ["division", "businessUnit", "department", "costCenter", "location", "customString21"]


@router.get("")
@router.get("/")
def companies(user: dict = Depends(signed_in)):
    """The companies the user can see (for pickers); group admins get all of them."""
    visible = visible_company_ids(user)
    return ok(data=[c for c in list_companies(force=True) if visible is None or c["id"] in visible])


@router.post("")
@router.post("/")
async def create_company(request: Request, _: dict = Depends(group_admin)):
    body = await read_body(request)
    code = str(body.get("code") or "").strip()
    name = str(body.get("name") or "").strip()
    if not re.fullmatch(r"[A-Z0-9-]{2,30}", code):
        raise invalid("Code: 2–30 capital letters, digits or dashes, e.g. PCL-FLEX", "code")
    if not name:
        raise invalid("Name required", "name")
    parent_id = optional_int(body, "parent_id")
    sf_code = body.get("sf_company_code") or None
    existing = list_companies(force=True)

    if any(c["code"] == code for c in existing):
        raise fail(400, "A company with that code already exists")
    if parent_id is not None and not any(c["id"] == parent_id for c in existing):
        raise fail(400, "Parent company not found")
    if parent_id is None and not sf_code:
        raise fail(400, "A top-level company needs its SuccessFactors company code")

    new_id = db.execute("INSERT INTO companies (parent_id, code, name, sf_company_code) VALUES (%s, %s, %s, %s)",
                        (parent_id, code, name, sf_code if parent_id is None else None))
    invalidate_company_cache()
    audit(request, "company.create", "company", new_id, new_id,
          {"code": code, "name": name, "parent_id": parent_id, "sf_company_code": sf_code})
    return ok(message="Company created", data={"id": new_id})


@router.put("/{company_id}")
async def update_company(company_id: str, request: Request, _: dict = Depends(group_admin)):
    """Rename or deactivate. Companies are never deleted (records point at them)."""
    body = await read_body(request)
    if "name" in body and not str(body.get("name") or "").strip():
        raise invalid("Invalid value", "name")
    if "is_active" in body and not isinstance(body["is_active"], bool):
        raise invalid("Invalid value", "is_active")
    company = next((c for c in list_companies(force=True) if is_int(company_id) and c["id"] == int(company_id)), None)
    if not company:
        raise fail(404, "Company not found")
    name = str(body["name"]).strip() if "name" in body else company["name"]
    is_active = company["is_active"] if "is_active" not in body else (1 if body["is_active"] else 0)
    db.execute("UPDATE companies SET name = %s, is_active = %s WHERE id = %s", (name, is_active, company["id"]))
    invalidate_company_cache()
    audit(request, "company.update", "company", company["id"], company["id"], {
        "before": {"name": company["name"], "is_active": company["is_active"]}, "after": {"name": name, "is_active": is_active}})
    return ok(message="Company updated")


@router.get("/sf-mappings")
def list_mappings(_: dict = Depends(group_admin)):
    rows = db.all("""SELECT m.*, c.code AS company_code, c.name AS company_name
                     FROM company_sf_mappings m JOIN companies c ON m.company_id = c.id
                     ORDER BY m.sf_company_code, m.sf_field IS NULL, m.priority DESC, m.id""")
    return {"success": True, "data": rows, "fields": SF_FIELDS}


@router.post("/sf-mappings")
async def create_mapping(request: Request, _: dict = Depends(group_admin)):
    body = await read_body(request)
    if not is_int(body.get("company_id")):
        raise invalid("Invalid value", "company_id")
    sf_company_code = str(body.get("sf_company_code") or "").strip()
    if not sf_company_code:
        raise invalid("Invalid value", "sf_company_code")
    sf_field = body.get("sf_field") or None
    if sf_field is not None and sf_field not in SF_FIELDS:
        raise invalid("Invalid value", "sf_field")
    match_type = body.get("match_type") or "equals"
    if match_type not in ("equals", "prefix"):
        raise invalid("Invalid value", "match_type")
    if "priority" in body and not is_int(body["priority"]):
        raise invalid("Invalid value", "priority")
    sf_value = body.get("sf_value") or None
    if sf_field and not sf_value:
        raise fail(400, "Give the value to match for that field")

    new_id = db.execute(
        """INSERT INTO company_sf_mappings (company_id, sf_company_code, sf_field, match_type, sf_value, priority, note)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (int(body["company_id"]), sf_company_code, sf_field, match_type, sf_value, int(body.get("priority") or 0), body.get("note") or None))
    audit(request, "company.mapping_create", "company_sf_mapping", new_id, int(body["company_id"]), body)
    return ok(message="Rule added", data={"id": new_id})


@router.delete("/sf-mappings/{mapping_id}")
def delete_mapping(mapping_id: str, request: Request, _: dict = Depends(group_admin)):
    row = db.one("SELECT * FROM company_sf_mappings WHERE id = %s", (mapping_id,)) if is_int(mapping_id) else None
    if not row:
        raise fail(404, "Rule not found")
    db.execute("DELETE FROM company_sf_mappings WHERE id = %s", (row["id"],))
    audit(request, "company.mapping_delete", "company_sf_mapping", row["id"], row["company_id"], row)
    return ok(message="Rule removed")

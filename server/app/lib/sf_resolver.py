"""
Which company (or sub-company) a SuccessFactors employee belongs to.

EmpJob.company gives the legal entity (e.g. "1200" = BSPL). Sub-companies such as
BSPL's Corrugated Division are told apart by another EmpJob field (businessUnit,
division, costCenter, ...). Admins keep those as rows in company_sf_mappings; the
most specific matching rule wins.
"""
from __future__ import annotations

from typing import Optional


def resolve_company_id(emp_job: dict, mappings: list[dict]) -> Optional[int]:
    company_code = "" if emp_job.get("company") is None else str(emp_job["company"])

    def matches(m: dict) -> bool:
        if m["sf_company_code"] != company_code:
            return False
        if not m["sf_field"]:
            return True  # whole legal entity
        raw = emp_job.get(m["sf_field"])
        if raw is None or m["sf_value"] is None:
            return False
        value = str(raw)
        return value.startswith(m["sf_value"]) if m["match_type"] == "prefix" else value == m["sf_value"]

    found = sorted(
        (m for m in mappings if matches(m)),
        # field rules before whole-entity rules, then higher priority, then oldest rule
        key=lambda m: (0 if m["sf_field"] else 1, -int(m["priority"] or 0), m["id"]),
    )
    return found[0]["company_id"] if found else None

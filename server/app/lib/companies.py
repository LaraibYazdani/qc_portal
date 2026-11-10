"""The company tree and who may see what."""
from __future__ import annotations

import threading
import time
from typing import Optional

from .. import db

_CACHE_SECONDS = 60
_cache: dict = {"at": 0.0, "list": None}
_lock = threading.Lock()


def list_companies(force: bool = False) -> list[dict]:
    """All companies (small, changes rarely: cached for a minute)."""
    with _lock:
        if not force and _cache["list"] is not None and time.time() - _cache["at"] < _CACHE_SECONDS:
            return _cache["list"]
    rows = db.all("SELECT id, parent_id, code, name, sf_company_code, is_active FROM companies ORDER BY name")
    with _lock:
        _cache.update(at=time.time(), list=rows)
    return rows


def invalidate_company_cache() -> None:
    with _lock:
        _cache["list"] = None


def subtree_ids(companies: list[dict], root_id: int) -> list[int]:
    """The company and every company below it."""
    result = [root_id]
    i = 0
    while i < len(result):
        result.extend(c["id"] for c in companies if c["parent_id"] == result[i])
        i += 1
    return result


def legal_entity_of(companies: list[dict], company_id: int) -> Optional[dict]:
    """The top-level legal entity a company belongs to."""
    by_id = {c["id"]: c for c in companies}
    current, seen = by_id.get(company_id), set()
    while current and current["parent_id"] is not None and current["id"] not in seen:
        seen.add(current["id"])
        current = by_id.get(current["parent_id"])
    return current


def find_company_by_code(code: str) -> Optional[dict]:
    return next((c for c in list_companies() if c["code"] == code), None)


def find_company(company_id) -> Optional[dict]:
    return next((c for c in list_companies() if c["id"] == company_id), None)


def visible_company_ids(user: dict) -> Optional[list[int]]:
    """None = everything (group admin); else the user's company and everything under it."""
    if user["role"] == "admin":
        return None
    if not user.get("company_id"):
        return []
    return subtree_ids(list_companies(), user["company_id"])


def can_see(visible: Optional[list[int]], company_id) -> bool:
    return visible is None or (company_id is not None and company_id in visible)


def scope_clause(visible: Optional[list[int]], column: str) -> tuple[str, list]:
    """SQL fragment + params restricting `column` to the visible companies."""
    if visible is None:
        return "", []
    if not visible:
        return " AND 1 = 0", []
    return f" AND {column} IN ({', '.join(['%s'] * len(visible))})", list(visible)

"""
SuccessFactors OData client (read-only).

Auth: OAuth 2.0 SAML bearer (SF_CLIENT_ID, SF_PRIVATE_KEY, SF_ECADMIN_USER_ID), the same
flow the Employee Clearance Portal uses. Falls back to basic auth (SF_API_USER/SF_API_PASS)
only when the OAuth settings are missing. SF_MOCK_MODE=true serves fixtures instead.
"""
from __future__ import annotations

import base64
import re
import threading
import time
from dataclasses import dataclass, asdict
from typing import Optional

import httpx

from ..config import env


@dataclass
class SfEmployee:
    userId: str
    name: str
    email: Optional[str]
    company: Optional[str]        # EmpJob.company, e.g. "1200" = BSPL
    businessUnit: Optional[str]   # EmpJob.businessUnit, e.g. "10000020" = Corrugated Boxes
    division: Optional[str]
    department: Optional[str]
    costCenter: Optional[str]
    location: Optional[str]
    jobTitle: Optional[str]

    def as_dict(self) -> dict:
        return asdict(self)


class SfError(Exception):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


def _base() -> str:
    return (env("SF_BASE_URL") or "https://api44.sapsf.com").rstrip("/")


def _mock() -> bool:
    return env("SF_MOCK_MODE") == "true"


def _has_oauth() -> bool:
    return bool(env("SF_CLIENT_ID") and env("SF_PRIVATE_KEY") and env("SF_ECADMIN_USER_ID"))


def _has_basic() -> bool:
    return bool(env("SF_API_USER") and env("SF_API_PASS"))


def sf_configured() -> bool:
    return _mock() or (bool(env("SF_COMPANY_ID")) and (_has_oauth() or _has_basic()))


# ── Auth ─────────────────────────────────────────────────────────────────────
_token: dict = {"header": None, "expires_at": 0.0}
_token_lock = threading.Lock()


def _oauth_header() -> str:
    with _token_lock:
        if _token["header"] and time.time() < _token["expires_at"] - 60:
            return _token["header"]
        token_url = f"{_base()}/oauth/token"
        with httpx.Client(timeout=30) as http:
            idp = http.post(f"{_base()}/oauth/idp", data={
                "client_id": env("SF_CLIENT_ID"), "user_id": env("SF_ECADMIN_USER_ID"),
                "token_url": token_url, "private_key": env("SF_PRIVATE_KEY"),
            })
            if idp.status_code >= 400:
                raise SfError(f"SuccessFactors refused the SAML assertion request ({idp.status_code})", idp.status_code)
            tok = http.post(token_url, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:saml2-bearer",
                "client_id": env("SF_CLIENT_ID"), "company_id": env("SF_COMPANY_ID"), "assertion": idp.text,
            })
        body = tok.json() if tok.headers.get("content-type", "").startswith("application/json") else {}
        if tok.status_code >= 400 or not body.get("access_token"):
            raise SfError(f"SuccessFactors refused the token request ({tok.status_code})", tok.status_code)
        _token.update(header=f"Bearer {body['access_token']}", expires_at=time.time() + int(body.get("expires_in") or 3600))
        return _token["header"]


def _auth_header() -> str:
    if _has_oauth():
        return _oauth_header()
    raw = f"{env('SF_API_USER')}@{env('SF_COMPANY_ID')}:{env('SF_API_PASS')}"
    return "Basic " + base64.b64encode(raw.encode()).decode()


def reset_token_cache() -> None:
    with _token_lock:
        _token.update(header=None, expires_at=0.0)


def sf_get_all(path: str) -> list[dict]:
    """GET an OData path, following server-side paging."""
    rows: list[dict] = []
    url: Optional[str] = _base() + path
    retried = False
    with httpx.Client(timeout=60) as http:
        while url:
            try:
                res = http.get(url, headers={"Authorization": _auth_header(), "Accept": "application/json"})
            except httpx.TransportError:
                # one retry for a dropped connection; a second failure is reported
                time.sleep(1)
                res = http.get(url, headers={"Authorization": _auth_header(), "Accept": "application/json"})
            if res.status_code == 401 and _has_oauth() and not retried:
                reset_token_cache()
                retried = True
                continue
            if res.status_code >= 400:
                raise SfError(f"SuccessFactors request failed ({res.status_code}) for {path.split('?')[0]}", res.status_code)
            d = res.json()["d"]
            rows.extend(d["results"])
            url = d.get("__next")
    return rows


# ── Employees ────────────────────────────────────────────────────────────────
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,50}$")


def is_valid_employee_id(value: str) -> bool:
    """Employee IDs go into OData filters, so only plain IDs are accepted."""
    return bool(_ID_RE.match(value))


def _s(v) -> Optional[str]:
    return None if v is None or v == "" else str(v)


def get_employee(user_id: str) -> Optional[SfEmployee]:
    """
    The employee's current profile and job, or None when SuccessFactors has no
    active employee with that ID (left, never existed). Network and auth problems raise.
    """
    if not is_valid_employee_id(user_id):
        raise SfError("Employee ID may only contain letters, digits, - and _")
    if _mock():
        return next((e for e in MOCK_EMPLOYEES if e.userId == user_id), None)

    # Active = status 'f' or 't', as in the Employee Clearance Portal.
    users = sf_get_all(f"/odata/v2/User?$format=json&$filter=userId eq '{user_id}' and (status eq 'f' or status eq 't')"
                       "&$select=userId,displayName,firstName,lastName,email")
    if not users:
        return None
    user = users[0]
    jobs = sf_get_all(f"/odata/v2/EmpJob?$format=json&$filter=userId eq '{user_id}'"
                      "&$select=userId,company,businessUnit,division,department,costCenter,location,jobTitle,localJobTitle")
    job = jobs[0] if jobs else {}
    name = _s(user.get("displayName")) or " ".join(x for x in (user.get("firstName"), user.get("lastName")) if x).strip()
    return SfEmployee(
        userId=user_id, name=name or user_id, email=_s(user.get("email")),
        company=_s(job.get("company")), businessUnit=_s(job.get("businessUnit")), division=_s(job.get("division")),
        department=_s(job.get("department")), costCenter=_s(job.get("costCenter")), location=_s(job.get("location")),
        jobTitle=_s(job.get("jobTitle")) or _s(job.get("localJobTitle")),
    )


_unit_names: dict[str, Optional[str]] = {}


def get_business_unit_name(code: Optional[str]) -> Optional[str]:
    """Display name of a business unit (e.g. "Business Unit Corrugated Boxes"); None if unknown."""
    if not code or not _ID_RE.match(code):
        return None
    if _mock():
        return MOCK_UNITS.get(code)
    if code in _unit_names:
        return _unit_names[code]
    try:
        rows = sf_get_all(f"/odata/v2/FOBusinessUnit?$format=json&$filter=externalCode eq '{code}'&$select=externalCode,name")
        name = _s(rows[0].get("name")) if rows else None
        _unit_names[code] = name
        return name
    except Exception:  # noqa: BLE001  a missing name never blocks anything
        return None


# ── Mock data (SF_MOCK_MODE=true): job fields copied from real EmpJob records, names invented ──
MOCK_UNITS = {
    "10000020": "Business Unit Corrugated Boxes",
    "10000021": "Business Unit Paper & Board",
    "10000022": "Energy & Productivity",
}

MOCK_EMPLOYEES = [
    SfEmployee("30000180", "Mock Pre-Press Supervisor", "mock.prepress@example.com", "1200", "10000020",
               "20000056", "30000099", "PKGS1211100000", "1900-6012", "Pre-Press Supervisor"),
    SfEmployee("30001961", "Mock Key Accounts Manager", "mock.keyaccounts@example.com", "1200", "10000020",
               "20000058", "30000092", "PKGS1211500000", "1900-6001", "Key Accounts Manager"),
    SfEmployee("30001991", "Mock WCM Manager", "mock.wcm@example.com", "1200", "10000022",
               "20000070", "30000167", "PKGS1220152003", "1900-6012", "WCM Manager"),
    SfEmployee("10009563", "Mock Internal Audit Manager", "mock.audit@example.com", "1000", "10000002",
               "20000016", None, "PKGS1001703400", "1100-6001", "Manager Internal Audit"),
]

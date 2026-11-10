"""Response helpers that keep the JSON shapes the frontend already relies on."""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from .config import TRUST_PROXY


def _default(o: Any):
    if isinstance(o, datetime):
        # MariaDB returns server-local times; send them with their offset so browsers show them right
        return (o if o.tzinfo else o.astimezone()).isoformat()
    if isinstance(o, date):
        return o.isoformat()
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    if isinstance(o, (bytes, bytearray)):
        return o.decode("utf-8", "replace")
    if isinstance(o, set):
        return list(o)
    raise TypeError(f"Not JSON serialisable: {type(o).__name__}")


class ApiJSON(JSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(content, default=_default, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class ApiError(Exception):
    """Raise to answer with `status` and exactly `body`."""

    def __init__(self, status: int, body: dict):
        self.status = status
        self.body = body


def fail(status: int, message: str, **extra) -> ApiError:
    return ApiError(status, {"success": False, "message": message, **extra})


def invalid(msg: str, path: str) -> ApiError:
    """Validation error in the express-validator shape: { errors: [{ msg, path }] }."""
    return ApiError(400, {"errors": [{"type": "field", "msg": msg, "path": path, "location": "body"}]})


def ok(**body) -> dict:
    return {"success": True, **body}


async def read_body(request: Request) -> dict:
    """JSON or form body as a dict (files excluded); {} when there is none."""
    ctype = request.headers.get("content-type", "")
    try:
        if "application/json" in ctype:
            data = await request.json()
            return data if isinstance(data, dict) else {}
        if "form" in ctype:
            form = await request.form()
            return {k: v for k, v in form.multi_items() if isinstance(v, str)}
    except Exception:  # noqa: BLE001  malformed body = no body, as express did
        return {}
    return {}


def client_ip(request: Request) -> str | None:
    if TRUST_PROXY:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else None

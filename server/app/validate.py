"""Small request checks that answer like express-validator did ({ errors: [{ msg, path }] })."""
from __future__ import annotations

import re
from typing import Any, Iterable, Optional

from .http import invalid

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_email(v: Any) -> bool:
    return isinstance(v, str) and bool(_EMAIL_RE.match(v))


def is_int(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return True
    return isinstance(v, str) and bool(re.fullmatch(r"-?\d+", v.strip()))


def required_text(body: dict, key: str, msg: str) -> str:
    v = body.get(key)
    v = v.strip() if isinstance(v, str) else ("" if v is None else str(v).strip())
    if not v:
        raise invalid(msg, key)
    return v


def optional_int(body: dict, key: str) -> Optional[int]:
    """Absent → None; null → None; must otherwise be an integer."""
    v = body.get(key)
    if v is None or v == "":
        return None
    if not is_int(v):
        raise invalid("Invalid value", key)
    return int(v)


def one_of(body: dict, key: str, allowed: Iterable[str], msg: str, required: bool = True) -> Optional[str]:
    v = body.get(key)
    if v is None and not required:
        return None
    if v not in allowed:
        raise invalid(msg, key)
    return v

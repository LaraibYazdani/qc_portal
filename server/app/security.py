"""Sessions (JWT) and who is signed in."""
from __future__ import annotations

import time
from typing import Callable

import jwt
from fastapi import Request

from . import db
from .config import jwt_expiry_seconds, jwt_secret
from .http import ApiError

ROLES = ("sales", "operator", "qc_supervisor", "company_admin", "admin")
STATUSES = ("active", "pending", "disabled")

PUBLIC_USER_SQL = """
  SELECT u.id, u.name, u.email, u.role, u.company_id, u.status, u.created_at,
         c.code AS company_code, c.name AS company_name
  FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = %s"""


def issue_token(user: dict) -> str:
    """Only the id matters: the user is reloaded from the database on every request."""
    now = int(time.time())
    return jwt.encode(
        {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"],
         "iat": now, "exp": now + jwt_expiry_seconds()},
        jwt_secret(), algorithm="HS256",
    )


def load_public_user(user_id: int) -> dict | None:
    return db.one(PUBLIC_USER_SQL, (user_id,))


def current_user(request: Request) -> dict:
    """
    Verifies the Bearer token, then loads the user from the database: a disabled
    account, a role change or a company move takes effect on the next request.
    """
    header = request.headers.get("authorization", "")
    token = header.split(" ")[1] if " " in header else ""
    if not token:
        raise ApiError(401, {"error": "Access token required"})
    try:
        claims = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(403, {"error": "Invalid or expired token"})
    user = load_public_user(claims.get("id"))
    if not user or user["status"] != "active":
        raise ApiError(401, {"error": "Your account is disabled or no longer exists. Contact your administrator."})
    request.state.user = user
    return user


def require_roles(*roles: str) -> Callable[[Request], dict]:
    def dependency(request: Request) -> dict:
        user = current_user(request)
        if user["role"] not in roles:
            raise ApiError(403, {"error": "Insufficient permissions"})
        return user
    return dependency


signed_in = current_user
managers = require_roles("admin", "company_admin")
uploaders = require_roles("admin", "company_admin", "sales")
group_admin = require_roles("admin")

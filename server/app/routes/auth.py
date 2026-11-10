"""Email + password sign-in (kept alongside SAP IAS during the changeover), current user, config."""
import bcrypt
from fastapi import APIRouter, Depends, Request

from .. import db
from ..http import ApiError, invalid, ok, read_body
from ..lib.audit import audit
from ..lib.ias import ias_enabled
from ..security import issue_token, signed_in
from ..validate import is_email

router = APIRouter()


@router.get("/config")
def config():
    """Which sign-in methods the login page should offer."""
    return ok(ias_enabled=ias_enabled(), password_login=True)


@router.post("/login")
async def login(request: Request):
    body = await read_body(request)
    email, password = body.get("email"), body.get("password")
    if not is_email(email):
        raise invalid("Valid email required", "email")
    if not password:
        raise invalid("Password required", "password")

    user = db.one(
        """SELECT u.id, u.name, u.email, u.password, u.role, u.company_id, u.status, u.created_at,
                  c.code AS company_code, c.name AS company_name
           FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.email = %s""",
        (email,),
    )
    # IAS-only accounts have no password; treat them like a wrong password
    if not user or not user["password"] or not _password_ok(password, user["password"]):
        raise ApiError(401, {"success": False, "message": "Invalid credentials"})

    if user["status"] != "active":
        raise ApiError(403, {"success": False, "message":
                             "Your account is waiting for an administrator to assign your access."
                             if user["status"] == "pending" else "Your account is disabled. Contact your administrator."})

    token = issue_token(user)
    db.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = %s", (user["id"],))
    request.state.user = user
    audit(request, "auth.login", "user", user["id"], user["company_id"], {"method": "password"})

    public = {k: user[k] for k in ("id", "name", "email", "role", "company_id", "company_code", "company_name", "status", "created_at")}
    return ok(user=public, token=token)


def _password_ok(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(str(password).encode(), hashed.encode())  # bcryptjs $2a$ hashes are accepted
    except ValueError:
        return False


@router.get("/me")
def me(user: dict = Depends(signed_in)):
    """Always fresh from the database."""
    return ok(user=user)


@router.post("/logout")
def logout(_: dict = Depends(signed_in)):
    return ok(message="Logout successful")

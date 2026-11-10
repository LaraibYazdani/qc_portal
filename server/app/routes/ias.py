"""SAP sign-in: /api/auth/ias/start | callback | exchange."""
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from ..config import env
from ..http import ApiError, ApiJSON, ok, read_body
from ..lib.employee_sign_in import sign_in_employee
from ..lib.ias import (IasError, create_handoff_code, employee_id_claim, finish_sign_in, ias_enabled,
                       redeem_handoff_code, start_sign_in)
from ..security import issue_token, load_public_user

router = APIRouter()

STATE_COOKIE = "qc_ias_state"
COOKIE_PATH = "/api/auth/ias"


def _login_page() -> str:
    return env("IAS_LOGIN_PAGE") or "/login"


def _secure(request: Request) -> bool:
    return request.url.scheme == "https" or env("COOKIE_SECURE") == "true"


@router.get("/start")
def start(request: Request):
    """The login page asks where to send the browser. The state is pinned to this browser in a cookie,
    so a sign-in started elsewhere can't be completed here."""
    if not ias_enabled():
        raise ApiError(404, {"success": False, "message": "SAP sign-in is not enabled"})
    try:
        url, state = start_sign_in()
    except Exception as e:  # noqa: BLE001
        print(f"[ias] start failed: {e}")
        raise ApiError(503, {"success": False, "message": "SAP sign-in is unavailable, try again shortly"})
    res = ApiJSON(ok(url=url))
    res.set_cookie(STATE_COOKIE, state, max_age=600, path=COOKIE_PATH, httponly=True, samesite="lax", secure=_secure(request))
    return res


@router.get("/callback")
def callback(request: Request):
    """SAP sends the browser back here with a code."""
    def back(param: str, value: str) -> RedirectResponse:
        res = RedirectResponse(f"{_login_page()}?{param}={quote(value, safe='')}", status_code=302)
        res.delete_cookie(STATE_COOKIE, path=COOKIE_PATH, httponly=True, samesite="lax", secure=_secure(request))
        return res

    if not ias_enabled():
        return back("ias_error", "disabled")

    cookie_state = request.cookies.get(STATE_COOKIE)
    q = request.query_params
    state, code = q.get("state"), q.get("code")
    if q.get("error"):
        return back("ias_error", "ias_denied")
    if not state or not code or not cookie_state or cookie_state != state:
        return back("ias_error", "invalid_state")

    try:
        claims = finish_sign_in(state, code)
        employee_id = claims.get(employee_id_claim())
        if not employee_id:
            return back("ias_error", "no_employee_number")
        outcome, user_id = sign_in_employee(request, str(employee_id))
        if outcome != "active" or not user_id:
            return back("ias_error", outcome)
        return back("ias_code", create_handoff_code(user_id))
    except IasError as e:
        print(f"[ias] sign-in refused: {e.code}: {e}")
        return back("ias_error", e.code)
    except Exception as e:  # noqa: BLE001
        print(f"[ias] callback failed: {e!r}")
        return back("ias_error", "server_error")


@router.post("/exchange")
async def exchange(request: Request):
    """The login page trades the one-time code for a session."""
    body = await read_body(request)
    code = body.get("code") if isinstance(body.get("code"), str) else ""
    user_id = redeem_handoff_code(code) if code else None
    if not user_id:
        raise ApiError(401, {"success": False, "message": "Sign-in expired, please try again"})
    user = load_public_user(user_id)
    if not user or user["status"] != "active":
        raise ApiError(403, {"success": False, "message": "Your account is not active"})
    return ok(token=issue_token(user), user=user)

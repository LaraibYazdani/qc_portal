"""SAP sign-in: /api/auth/ias/start | mobile/start | callback | exchange."""
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from ..config import env
from ..http import ApiError, ApiJSON, ok, read_body
from ..lib.employee_sign_in import sign_in_employee
from ..lib.ias import (IasError, create_handoff_code, employee_id_claim, finish_sign_in, ias_enabled,
                       mobile_redirect_allowed, pending_app, redeem_handoff_code, start_sign_in, valid_challenge)
from ..security import issue_token, load_public_user

router = APIRouter()

STATE_COOKIE = "qc_ias_state"
COOKIE_PATH = "/api/auth/ias"


def _login_page() -> str:
    return env("IAS_LOGIN_PAGE") or "/login"


def _secure(request: Request) -> bool:
    return request.url.scheme == "https" or env("COOKIE_SECURE") == "true"


def _with_param(base: str, param: str, value: str) -> str:
    return f"{base}{'&' if '?' in base else '?'}{param}={quote(value, safe='')}"


def _pin_state(res, request: Request, state: str):
    res.set_cookie(STATE_COOKIE, state, max_age=600, path=COOKIE_PATH, httponly=True, samesite="lax", secure=_secure(request))
    return res


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
    return _pin_state(ApiJSON(ok(url=url)), request, state)


@router.get("/mobile/start")
def mobile_start(request: Request):
    """The mobile app opens this in the phone's browser:
    ?redirect_uri=packvision://auth&code_challenge=<base64url SHA-256 of the app's secret>.
    The browser goes on to SAP and, at the end, back to the app with a one-time code."""
    q = request.query_params
    redirect_uri, challenge = q.get("redirect_uri") or "", q.get("code_challenge") or ""
    if not mobile_redirect_allowed(redirect_uri):
        raise ApiError(400, {"success": False, "message": "This app address is not allowed"})
    if not valid_challenge(challenge) or q.get("code_challenge_method", "S256") != "S256":
        return RedirectResponse(_with_param(redirect_uri, "ias_error", "invalid_request"), status_code=302)
    if not ias_enabled():
        return RedirectResponse(_with_param(redirect_uri, "ias_error", "disabled"), status_code=302)
    try:
        url, state = start_sign_in(app={"redirect": redirect_uri, "challenge": challenge})
    except Exception as e:  # noqa: BLE001
        print(f"[ias] mobile start failed: {e}")
        return RedirectResponse(_with_param(redirect_uri, "ias_error", "unavailable"), status_code=302)
    return _pin_state(RedirectResponse(url, status_code=302), request, state)


@router.get("/callback")
def callback(request: Request):
    """SAP sends the browser back here with a code."""
    cookie_state = request.cookies.get(STATE_COOKIE)
    # Only the sign-in pinned to this browser can say where to go back to
    app: Optional[dict] = pending_app(cookie_state) if cookie_state else None
    target = app["redirect"] if app else _login_page()

    def back(param: str, value: str) -> RedirectResponse:
        res = RedirectResponse(_with_param(target, param, value), status_code=302)
        res.delete_cookie(STATE_COOKIE, path=COOKIE_PATH, httponly=True, samesite="lax", secure=_secure(request))
        return res

    if not ias_enabled():
        return back("ias_error", "disabled")

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
        return back("ias_code", create_handoff_code(user_id, app["challenge"] if app else None))
    except IasError as e:
        print(f"[ias] sign-in refused: {e.code}: {e}")
        return back("ias_error", e.code)
    except Exception as e:  # noqa: BLE001
        print(f"[ias] callback failed: {e!r}")
        return back("ias_error", "server_error")


@router.post("/exchange")
async def exchange(request: Request):
    """The login page (or the mobile app, with `code_verifier`) trades the one-time code for a session."""
    body = await read_body(request)
    code = body.get("code") if isinstance(body.get("code"), str) else ""
    verifier = body.get("code_verifier") if isinstance(body.get("code_verifier"), str) else None
    user_id = redeem_handoff_code(code, verifier) if code else None
    if not user_id:
        raise ApiError(401, {"success": False, "message": "Sign-in expired, please try again"})
    user = load_public_user(user_id)
    if not user or user["status"] != "active":
        raise ApiError(403, {"success": False, "message": "Your account is not active"})
    return ok(token=issue_token(user), user=user)

"""
SAP Identity Authentication Service (IAS) sign-in: OpenID Connect authorization
code flow with PKCE.

Compared with the reference portal this also:
 - verifies the ID token's signature against the tenant's published keys (JWKS);
 - never puts the portal session token in a URL: the callback hands the browser a
   one-time code (valid 60 s) that the login page trades for the token.

Pending sign-ins and one-time codes live in memory. Run the API as ONE process
(uvicorn without --workers); if that ever changes, move them to the database.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import threading
import time
from typing import Callable, Optional
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from jwt.algorithms import RSAAlgorithm

from ..config import env


def _issuer() -> str:
    return env("IAS_ISSUER").rstrip("/")


def ias_enabled() -> bool:
    return env("IAS_ENABLED") == "true" and all(
        (_issuer(), env("IAS_CLIENT_ID"), env("IAS_CLIENT_SECRET"), env("IAS_REDIRECT_URI")))


def employee_id_claim() -> str:
    return env("IAS_EMPLOYEE_ID_CLAIM") or "employee_number"


class IasError(Exception):
    """`code` is shown to the user as ?ias_error=<code> on the login page."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


# ── Tenant endpoints (OpenID discovery, cached for an hour; .env values win) ──
_discovered: dict = {"at": 0.0, "endpoints": None}


def _endpoints() -> dict:
    if _discovered["endpoints"] and time.time() - _discovered["at"] < 3600:
        return _discovered["endpoints"]
    doc: dict = {}
    try:
        res = httpx.get(f"{_issuer()}/.well-known/openid-configuration", timeout=15)
        if res.status_code == 200:
            doc = res.json()
    except Exception:  # noqa: BLE001  fall back to .env / IAS defaults
        pass
    e = {
        "authorize": env("IAS_AUTHORIZE_URL") or doc.get("authorization_endpoint") or f"{_issuer()}/oauth2/authorize",
        "token": env("IAS_TOKEN_URL") or doc.get("token_endpoint") or f"{_issuer()}/oauth2/token",
        "jwks": env("IAS_JWKS_URL") or doc.get("jwks_uri") or f"{_issuer()}/oauth2/certs",
    }
    _discovered.update(at=time.time(), endpoints=e)
    return e


# ── Short-lived state ─────────────────────────────────────────────────────────
_PENDING_TTL, _CODE_TTL = 600, 60
_pending: dict[str, dict] = {}
_handoff: dict[str, dict] = {}
_lock = threading.Lock()


def _sweep() -> None:
    now = time.time()
    for store, ttl in ((_pending, _PENDING_TTL), (_handoff, _CODE_TTL)):
        for k in [k for k, v in store.items() if now - v["at"] > ttl]:
            store.pop(k, None)


def _random() -> str:
    return secrets.token_urlsafe(32)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def start_sign_in() -> tuple[str, str]:
    """Start a sign-in: (SAP URL to send the browser to, state to pin in a cookie)."""
    with _lock:
        _sweep()
        if len(_pending) > 5000:
            raise IasError("busy", "Too many sign-ins in progress")
        state, nonce, verifier = _random(), _random(), _random()
        _pending[state] = {"nonce": nonce, "verifier": verifier, "at": time.time()}
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    query = urlencode({
        "response_type": "code", "client_id": env("IAS_CLIENT_ID"), "redirect_uri": env("IAS_REDIRECT_URI"),
        "scope": "openid profile email", "state": state, "nonce": nonce,
        "code_challenge": challenge, "code_challenge_method": "S256",
    })
    parts = urlsplit(_endpoints()["authorize"])
    return urlunsplit(parts._replace(query=f"{parts.query}&{query}" if parts.query else query)), state


def finish_sign_in(state: str, code: str) -> dict:
    """Check the state, trade the code for an ID token and verify it. Returns the token's claims."""
    with _lock:
        _sweep()
        p = _pending.pop(state, None)
    if not p:
        raise IasError("invalid_state", "Unknown or expired sign-in")

    e = _endpoints()
    try:
        res = httpx.post(e["token"], timeout=30, data={
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": env("IAS_REDIRECT_URI"), "code_verifier": p["verifier"],
        }, headers={"Accept": "application/json"}, auth=(env("IAS_CLIENT_ID"), env("IAS_CLIENT_SECRET")))
    except Exception:  # noqa: BLE001
        raise IasError("token_request_error", "Could not reach SAP IAS")
    if res.status_code >= 400:
        raise IasError("token_exchange_failed", f"SAP IAS refused the code ({res.status_code})")
    id_token = (res.json() if res.content else {}).get("id_token")
    if not id_token:
        raise IasError("no_id_token", "SAP IAS returned no ID token")

    return verify_id_token(id_token, jwks=_get_jwks(e["jwks"]), issuer=_issuer(), client_id=env("IAS_CLIENT_ID"),
                           nonce=p["nonce"], refetch=lambda: _get_jwks(e["jwks"], force=True))


def create_handoff_code(user_id: int) -> str:
    """One-time code the login page trades for a session."""
    with _lock:
        _sweep()
        code = _random()
        _handoff[code] = {"user_id": user_id, "at": time.time()}
        return code


def redeem_handoff_code(code: str) -> Optional[int]:
    with _lock:
        _sweep()
        h = _handoff.pop(code, None)
    return h["user_id"] if h else None


# ── ID token verification ─────────────────────────────────────────────────────
_jwks_cache: dict = {"at": 0.0, "url": None, "jwks": None}


def _get_jwks(url: str, force: bool = False) -> dict:
    if not force and _jwks_cache["jwks"] and _jwks_cache["url"] == url and time.time() - _jwks_cache["at"] < 3600:
        return _jwks_cache["jwks"]
    res = httpx.get(url, timeout=15)
    if res.status_code >= 400:
        raise IasError("token_validation_failed", f"Could not load SAP IAS signing keys ({res.status_code})")
    jwks = res.json()
    _jwks_cache.update(at=time.time(), url=url, jwks=jwks)
    return jwks


_ALGS = {"RS256": hashes.SHA256, "RS384": hashes.SHA384, "RS512": hashes.SHA512}


def verify_id_token(token: str, *, jwks: dict, issuer: str, client_id: str, nonce: str,
                    now: Optional[float] = None, refetch: Optional[Callable[[], dict]] = None) -> dict:
    """
    Verify a signed ID token: RS256/384/512 signature by a key in `jwks`, issuer,
    audience, expiry and nonce. `refetch` is called once when the key id is unknown
    (SAP rotated its keys).
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise IasError("invalid_token_claims", "Malformed ID token")
    h, p, s = parts
    try:
        header = json.loads(_b64url_decode(h))
        claims = json.loads(_b64url_decode(p))
        signature = _b64url_decode(s)
    except Exception:  # noqa: BLE001
        raise IasError("invalid_token_claims", "Malformed ID token")

    alg = _ALGS.get(header.get("alg"))
    if not alg:
        raise IasError("token_validation_failed", f"Unsupported token algorithm {header.get('alg')}")

    def pick(keys: dict) -> Optional[dict]:
        rsa = [k for k in keys.get("keys", []) if k.get("kty") == "RSA" and k.get("use", "sig") == "sig"]
        if header.get("kid"):
            return next((k for k in rsa if k.get("kid") == header["kid"]), None)
        return rsa[0] if len(rsa) == 1 else None

    jwk = pick(jwks)
    if not jwk and refetch:
        jwk = pick(refetch())
    if not jwk:
        raise IasError("token_validation_failed", "ID token signed by an unknown key")

    key = RSAAlgorithm.from_jwk(json.dumps(jwk))
    try:
        key.verify(signature, f"{h}.{p}".encode(), padding.PKCS1v15(), alg())
    except InvalidSignature:
        raise IasError("token_validation_failed", "ID token signature is invalid")

    t = int(now if now is not None else time.time())
    skew = 60
    aud = claims.get("aud")
    aud = aud if isinstance(aud, list) else [aud]
    if str(claims.get("iss", "")).rstrip("/") != issuer.rstrip("/"):
        raise IasError("token_validation_failed", "Wrong issuer")
    if client_id not in aud:
        raise IasError("token_validation_failed", "Token is for another application")
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] < t - skew:
        raise IasError("token_validation_failed", "Token expired")
    if isinstance(claims.get("nbf"), (int, float)) and claims["nbf"] > t + skew:
        raise IasError("token_validation_failed", "Token not valid yet")
    if claims.get("nonce") != nonce:
        raise IasError("token_validation_failed", "Nonce mismatch")
    return claims

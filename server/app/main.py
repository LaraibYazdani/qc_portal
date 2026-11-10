"""
PackVision API (Python). Same routes and responses as the Node API it replaces.

Run (one process: sign-in state is held in memory):
    cd server
    .venv\\Scripts\\python -m uvicorn app.main:app --port 5000
Behind IIS add: --proxy-headers --forwarded-allow-ips=127.0.0.1  (and TRUST_PROXY=1)
"""
from __future__ import annotations

import threading
import time
import traceback
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .config import CORS_ORIGIN, FRONTEND_BUILD, IS_PRODUCTION, NODE_ENV, PORT, RATE_LIMIT_MAX, UPLOAD_ROOT
from .http import ApiError, ApiJSON, client_ip
from .routes import auth, companies, ias, jobs, users

app = FastAPI(title="PackVision API", default_response_class=ApiJSON, docs_url=None, redoc_url=None, openapi_url=None)


# ── Errors: same shapes the Node API returned ─────────────────────────────────
@app.exception_handler(ApiError)
async def api_error(_: Request, e: ApiError):
    return ApiJSON(e.body, status_code=e.status)


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, e: StarletteHTTPException):
    if e.status_code in (404, 405):
        return ApiJSON({"error": "Route not found"}, status_code=404)
    return ApiJSON({"error": str(e.detail)}, status_code=e.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError):
    return ApiJSON({"errors": [{"msg": err.get("msg"), "path": ".".join(map(str, err.get("loc", [])[1:]))} for err in e.errors()]},
                   status_code=400)


@app.exception_handler(Exception)
async def server_error(request: Request, e: Exception):
    traceback.print_exception(e)
    return ApiJSON({"error": "Something went wrong!",
                    "message": str(e) if NODE_ENV == "development" else "Internal server error"}, status_code=500)


# ── Security headers (as helmet set them, minus CSP/HSTS/COOP like the Node API) ──
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "SAMEORIGIN")
    h.setdefault("Referrer-Policy", "no-referrer")
    h.setdefault("X-DNS-Prefetch-Control", "off")
    h.setdefault("X-Download-Options", "noopen")
    h.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    h.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    return response


# ── Rate limiting on /api: RATE_LIMIT_MAX requests per IP per 15 minutes ──────
_WINDOW = 15 * 60
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        ip, now = client_ip(request) or "unknown", time.time()
        with _hits_lock:
            q = _hits[ip]
            while q and now - q[0] > _WINDOW:
                q.popleft()
            if len(q) >= RATE_LIMIT_MAX:
                return PlainTextResponse("Too many requests, please try again later.", status_code=429)
            q.append(now)
    return await call_next(request)


app.add_middleware(CORSMiddleware, allow_origins=[CORS_ORIGIN], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ── Routes ───────────────────────────────────────────────────────────────────
app.include_router(ias.router, prefix="/api/auth/ias")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(jobs.router, prefix="/api/jobs")
app.include_router(users.router, prefix="/api/users")
app.include_router(companies.router, prefix="/api/companies")


@app.get("/api/health")
def health():
    return {"status": "OK", "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}


# Uploaded design files
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

# In production the API also serves the built React app
if IS_PRODUCTION and FRONTEND_BUILD.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_BUILD / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise StarletteHTTPException(404)
        candidate = (FRONTEND_BUILD / path).resolve()
        if path and candidate.is_file() and FRONTEND_BUILD.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_BUILD / "index.html")


@app.on_event("startup")
def startup():
    print(f"PackVision API on port {PORT}, environment {NODE_ENV}, uploads in {UPLOAD_ROOT}")
    if db.ping():
        print("Database connection successful")
    else:
        print("WARNING: Database connection failed. Some features may not work.")

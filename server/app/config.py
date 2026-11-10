"""Settings from the environment. server/.env is read if present, else backend/.env (shared during the move)."""
import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = SERVER_DIR.parent

for candidate in (SERVER_DIR / ".env", REPO_DIR / "backend" / ".env"):
    if candidate.exists():
        load_dotenv(candidate, override=False)  # real environment variables win
        break


def env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


DB = {
    "host": env("DB_HOST", "localhost"),
    "port": int(env("DB_PORT", "3306")),
    "user": env("DB_USER", "root"),
    "password": os.environ.get("DB_PASS", ""),
    "database": env("DB_NAME", "qc_portal"),
}

PORT = int(env("PORT", "5000"))
NODE_ENV = env("NODE_ENV", "development")  # kept name: same .env as the Node API
IS_PRODUCTION = NODE_ENV == "production"
CORS_ORIGIN = env("CORS_ORIGIN", "http://localhost:3000")
RATE_LIMIT_MAX = int(env("RATE_LIMIT_MAX", "1000") or 1000)
TRUST_PROXY = bool(env("TRUST_PROXY"))
LEGACY_DEFAULT_COMPANY_CODE = env("LEGACY_DEFAULT_COMPANY_CODE", "BSPL-CORR")

# Phase 1's files live in backend/uploads; keep using that folder unless told otherwise.
UPLOAD_ROOT = Path(env("UPLOAD_DIR") or (REPO_DIR / "backend" / "uploads")).resolve()
FRONTEND_BUILD = REPO_DIR / "frontend" / "build"
MIGRATIONS_DIR = REPO_DIR / "sql" / "migrations"


def jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return secret


def jwt_expiry_seconds() -> int:
    """JWT_EXPIRES_IN as the Node API read it: 24h, 30m, 7d or plain seconds."""
    raw = env("JWT_EXPIRES_IN", "24h")
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    if raw[-1:] in units and raw[:-1].isdigit():
        return int(raw[:-1]) * units[raw[-1]]
    return int(raw) if raw.isdigit() else 86400

"""
Database migrations for PackVision (same table and rules as the earlier Node runner).

    python scripts/migrate.py                 apply every pending migration in sql/migrations
    python scripts/migrate.py --status        list applied / pending migrations
    python scripts/migrate.py --dry-run       show what would run, change nothing
    python scripts/migrate.py --down 004      undo one migration (sql/migrations/down/004_*.down.sql)

Uses the same DB_* settings as the API. Take a full backup before running against
production: MySQL/MariaDB commit table changes immediately, so a migration that
fails half-way cannot be rolled back automatically.

Checksums are taken with line endings normalised to LF, so a Windows checkout
(CRLF) of an applied migration is not mistaken for an edit.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymysql  # noqa: E402
from pymysql.constants import CLIENT  # noqa: E402
from pymysql.cursors import DictCursor  # noqa: E402

from app.config import DB, MIGRATIONS_DIR  # noqa: E402

DOWN_DIR = MIGRATIONS_DIR / "down"


def checksum(sql: str) -> str:
    return hashlib.sha256(sql.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def load_migrations() -> list[dict]:
    out = []
    for f in sorted(p for p in MIGRATIONS_DIR.iterdir() if re.fullmatch(r"\d{3}_.+\.sql", p.name)):
        sql = f.read_text(encoding="utf-8")
        out.append({"version": f.name[:3], "name": f.name[4:-4], "file": f.name, "sql": sql, "checksum": checksum(sql)})
    return out


def run_script(conn, sql: str) -> None:
    """Run a multi-statement script and surface an error from any of its statements."""
    with conn.cursor() as cur:
        cur.execute(sql)
        while cur.nextset():
            pass


def main(args: list[str]) -> None:
    conn = pymysql.connect(host=DB["host"], port=DB["port"], user=DB["user"], password=DB["password"],
                           database=DB["database"], charset="utf8mb4", autocommit=True,
                           client_flag=CLIENT.MULTI_STATEMENTS, cursorclass=DictCursor)
    name = DB["database"]
    try:
        run_script(conn, """CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(10) PRIMARY KEY, name VARCHAR(191) NOT NULL, checksum CHAR(64) NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
        with conn.cursor() as cur:
            cur.execute("SELECT version, name, checksum, applied_at FROM schema_migrations")
            applied = {r["version"]: r for r in cur.fetchall()}
        migrations = load_migrations()

        if "--status" in args:
            print(f"Database: {name}")
            for m in migrations:
                a = applied.get(m["version"])
                state = "pending" if not a else "APPLIED (file changed since!)" if a["checksum"] != m["checksum"] \
                    else f"applied {a['applied_at'].isoformat()}"
                print(f"  {m['version']} {m['name']:<24} {state}")
            return

        if "--down" in args:
            i = args.index("--down")
            version = args[i + 1] if i + 1 < len(args) else None
            if not version or version not in applied:
                raise SystemExit(f"Migration {version or '(none given)'} is not applied.")
            newer = sorted((v for v in applied if v > version), reverse=True)
            if newer:
                raise SystemExit(f"Undo newer migrations first: {', '.join(newer)}")
            down = next((f for f in sorted(DOWN_DIR.iterdir()) if f.name.startswith(f"{version}_")), None)
            if not down:
                raise SystemExit(f"No rollback file for {version} in {DOWN_DIR}")
            print(f"Rolling back {version} ({down.name}) on {name}...")
            run_script(conn, down.read_text(encoding="utf-8"))
            with conn.cursor() as cur:
                cur.execute("DELETE FROM schema_migrations WHERE version = %s", (version,))
            print("Done.")
            return

        for m in migrations:
            a = applied.get(m["version"])
            if a and a["checksum"] != m["checksum"]:
                raise SystemExit(f"Migration {m['file']} was edited after it was applied. Add a new migration instead.")
        pending = [m for m in migrations if m["version"] not in applied]
        if not pending:
            print(f"Database {name} is up to date.")
            return
        if "--dry-run" in args:
            print(f"Would apply to {name}: {', '.join(m['file'] for m in pending)}")
            return
        for m in pending:
            print(f"Applying {m['file']}... ", end="", flush=True)
            run_script(conn, m["sql"])
            with conn.cursor() as cur:
                cur.execute("INSERT INTO schema_migrations (version, name, checksum) VALUES (%s, %s, %s)",
                            (m["version"], m["name"], m["checksum"]))
            print("ok")
        print(f"Applied {len(pending)} migration(s) to {name}.")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except pymysql.MySQLError as e:
        raise SystemExit(f"Migration failed: {e}")

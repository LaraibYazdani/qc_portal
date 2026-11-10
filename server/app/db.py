"""
Database access: plain SQL through a pooled PyMySQL connection.

    rows = db.all("SELECT ... WHERE id = %s", (id,))
    with db.transaction() as tx:
        tx.execute("INSERT ...", (...))      # commits at the end, rolls back on error

Helpers take an optional `conn` so they can run inside a caller's transaction.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Optional, Sequence

import pymysql
from pymysql.cursors import DictCursor
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

from .config import DB

_engine = create_engine(
    "mysql+pymysql://",
    creator=lambda: pymysql.connect(
        host=DB["host"], port=DB["port"], user=DB["user"], password=DB["password"], database=DB["database"],
        charset="utf8mb4", autocommit=True,  # dict rows are asked for per query (SQLAlchemy needs tuples)
    ),
    poolclass=QueuePool, pool_size=10, max_overflow=5, pool_pre_ping=True, pool_recycle=3600,
)


class Conn:
    """One database connection: all() / one() / execute()."""

    def __init__(self, raw):
        self.raw = raw

    def all(self, sql: str, params: Sequence[Any] = ()) -> list[dict]:
        with self.raw.cursor(DictCursor) as cur:
            cur.execute(sql, tuple(params))
            return list(cur.fetchall())

    def one(self, sql: str, params: Sequence[Any] = ()) -> Optional[dict]:
        rows = self.all(sql, params)
        return rows[0] if rows else None

    def execute(self, sql: str, params: Sequence[Any] = ()) -> int:
        """Runs a statement; returns lastrowid for INSERTs (else the row count)."""
        with self.raw.cursor(DictCursor) as cur:
            cur.execute(sql, tuple(params))
            return cur.lastrowid or cur.rowcount


@contextmanager
def connection() -> Iterator[Conn]:
    raw = _engine.raw_connection()
    try:
        yield Conn(raw.driver_connection)
    finally:
        raw.close()  # back to the pool


@contextmanager
def transaction() -> Iterator[Conn]:
    raw = _engine.raw_connection()
    conn = raw.driver_connection
    try:
        conn.begin()
        yield Conn(conn)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        raw.close()


def all(sql: str, params: Sequence[Any] = (), conn: Optional[Conn] = None) -> list[dict]:  # noqa: A001
    if conn:
        return conn.all(sql, params)
    with connection() as c:
        return c.all(sql, params)


def one(sql: str, params: Sequence[Any] = (), conn: Optional[Conn] = None) -> Optional[dict]:
    rows = all(sql, params, conn)
    return rows[0] if rows else None


def execute(sql: str, params: Sequence[Any] = (), conn: Optional[Conn] = None) -> int:
    if conn:
        return conn.execute(sql, params)
    with connection() as c:
        return c.execute(sql, params)


def ping() -> bool:
    try:
        one("SELECT 1 AS ok")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"Database connection failed: {e}")
        return False

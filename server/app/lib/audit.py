"""Append-only audit log. Pass `conn` to write inside the same transaction as the change."""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import Request

from .. import db
from ..http import _default, client_ip


def audit(request: Optional[Request], action: str, entity_type: str, entity_id: Any = None,
          company_id: Optional[int] = None, details: Optional[dict] = None, conn: Optional[db.Conn] = None) -> None:
    user = getattr(request.state, "user", None) if request is not None else None
    label = f"{user['name']} <{user['email']}>" if user else "system"
    ua = (request.headers.get("user-agent") or "")[:255] if request is not None else ""
    db.execute(
        """INSERT INTO audit_log (actor_user_id, actor_label, company_id, action, entity_type, entity_id, details, ip_address, user_agent)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            user["id"] if user else None,
            label[:191],
            company_id,
            action,
            entity_type,
            None if entity_id is None else str(entity_id),
            json.dumps(details, default=_default) if details is not None else None,
            client_ip(request) if request is not None else None,
            ua or None,
        ),
        conn,
    )

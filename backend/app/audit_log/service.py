"""Writing and reading the operator action log (G7).

Every module records through this service. audit_log sits below the business
modules so even `user` can call it: docs/architecture/dependency-graph.md.
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log.models import AuditLog
from app.core.db import independent_session


async def record(
    session: AsyncSession,
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    session.add(
        AuditLog(
            action=action,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
        )
    )


async def record_detached(
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Record through a session of its own, for requests that end in an error."""
    async with independent_session() as session:
        await record(
            session,
            action=action,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
        )

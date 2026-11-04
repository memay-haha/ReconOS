"""Reading the operator action log (G7).

The table and the two write functions live in `app/core/audit.py`, so tier 0
can record a denial without calling a module above it:
docs/architecture/dependency-graph.md. This module keeps the read side only.
"""

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log.schemas import AuditLogResponse
from app.core.audit import AuditLog
from app.core.errors import BadRequestError
from app.core.pagination import MAX_LIMIT, Page, decode_time_cursor, encode_cursor


async def list_entries(
    session: AsyncSession,
    *,
    limit: int,
    cursor: str | None,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    created_at_from: datetime | None = None,
    created_at_to: datetime | None = None,
) -> Page[AuditLogResponse]:
    size = max(1, min(limit, MAX_LIMIT))
    # A naive datetime against a timestamptz column is a driver error (500) or a
    # silent timezone mismatch, so refuse it as the cursor path does.
    for bound in (created_at_from, created_at_to):
        if bound is not None and bound.tzinfo is None:
            raise BadRequestError(detail="created_at bounds must carry a timezone")
    conditions: list[ColumnElement[bool]] = []
    if user_id is not None:
        conditions.append(AuditLog.user_id == user_id)
    if action is not None:
        conditions.append(AuditLog.action == action)
    if created_at_from is not None:
        conditions.append(AuditLog.created_at >= created_at_from)
    if created_at_to is not None:
        conditions.append(AuditLog.created_at <= created_at_to)

    stmt = (
        select(AuditLog).where(*conditions).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(AuditLog.created_at, AuditLog.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).scalars().all())
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[AuditLogResponse](
        items=[AuditLogResponse.model_validate(row, from_attributes=True) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )

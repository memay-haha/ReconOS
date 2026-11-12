"""Alerts by program and the read state of each account.

Tier 2: `job`, `parser`, `dispatcher` raise alerts through `raise_alert`, and
this module calls no business module: docs/architecture/dependency-graph.md.
An alert is written in the transaction of the change that caused it, and its
`alert.created` event goes out only after that transaction commits.

Public API for the modules above: `raise_alert`, `AlertType`.
"""

import uuid
from typing import cast

from sqlalchemy import ColumnElement, and_, exists, func, literal, select, text, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.alert.models import ONCE_PER_JOB, ONCE_PER_JOB_WHERE, Alert, AlertRead, AlertType
from app.alert.schemas import AlertResponse, AlertSort
from app.core import realtime
from app.core.errors import NotFoundError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to

# A message is a short line on the bell; target data inside it is cut, not trusted.
MESSAGE_MAX_CHARS = 500

__all__ = ["AlertType", "list_alerts", "mark_all_read", "mark_read", "raise_alert"]


def _clip(message: str) -> str:
    return message if len(message) <= MESSAGE_MAX_CHARS else message[: MESSAGE_MAX_CHARS - 1] + "…"


async def raise_alert(
    session: AsyncSession,
    *,
    alert_type: AlertType,
    program_id: uuid.UUID | None,
    message: str,
    finding_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    """Write one alert and queue `alert.created`. None when the job already raised it.

    The caller's transaction owns the row: a rolled back change leaves no alert.
    """
    stmt = insert(Alert).values(
        alert_type=alert_type.value,
        program_id=program_id,
        message=_clip(message),
        finding_id=finding_id,
        job_id=job_id,
    )
    if alert_type in ONCE_PER_JOB and job_id is not None:
        stmt = stmt.on_conflict_do_nothing(
            index_elements=[Alert.alert_type, Alert.job_id],
            index_where=text(ONCE_PER_JOB_WHERE),
        )
    alert_id = (await session.execute(stmt.returning(Alert.id))).scalar_one_or_none()
    if alert_id is not None:
        realtime.queue_event(
            session,
            realtime.build_event(
                "alert.created",
                program_id,
                {"alert_id": str(alert_id), "alert_type": alert_type.value},
            ),
        )
    return alert_id


def _visible(viewer: User) -> ColumnElement[bool]:
    # A NULL program_id never matches a User's assignments, so system-wide
    # alerts reach Superadmin and Admin only.
    column = cast("InstrumentedAttribute[uuid.UUID]", Alert.program_id)
    return program_visible_to(viewer, column)


def _read_by(viewer: User) -> ColumnElement[bool]:
    return exists().where(AlertRead.alert_id == Alert.id, AlertRead.user_id == viewer.id)


async def list_alerts(
    session: AsyncSession,
    *,
    viewer: User,
    limit: int,
    cursor: str | None,
    sort: AlertSort,
    is_read: bool | None,
    alert_types: list[AlertType] | None,
) -> Page[AlertResponse]:
    size = max(1, min(limit, MAX_LIMIT))
    read = _read_by(viewer)
    conditions: list[ColumnElement[bool]] = [_visible(viewer)]
    if is_read is not None:
        conditions.append(read if is_read else ~read)
    if alert_types:
        conditions.append(Alert.alert_type.in_([t.value for t in alert_types]))
    descending = sort == "-created_at"
    order = (
        (Alert.created_at.desc(), Alert.id.desc())
        if descending
        else (Alert.created_at.asc(), Alert.id.asc())
    )
    stmt = select(Alert, read.label("is_read")).where(*conditions).order_by(*order)
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        key = tuple_(Alert.created_at, Alert.id)
        stmt = stmt.where(key < (seen_at, seen_id) if descending else key > (seen_at, seen_id))
    rows = (await session.execute(stmt.limit(size + 1))).all()
    total = await session.scalar(select(func.count()).select_from(Alert).where(*conditions)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1][0].created_at.isoformat(), page_rows[-1][0].id)
        if len(rows) > size
        else None
    )
    return Page[AlertResponse](
        items=[
            AlertResponse(
                id=alert.id,
                alert_type=AlertType(alert.alert_type),
                message=alert.message,
                program_id=alert.program_id,
                finding_id=alert.finding_id,
                job_id=alert.job_id,
                created_at=alert.created_at,
                is_read=bool(seen),
            )
            for alert, seen in page_rows
        ],
        next_cursor=next_cursor,
        total=total,
    )


async def mark_read(session: AsyncSession, *, viewer: User, alert_id: uuid.UUID) -> None:
    """Idempotent. An alert of a program the account cannot see answers 404."""
    visible = await session.scalar(select(Alert.id).where(Alert.id == alert_id, _visible(viewer)))
    if visible is None:
        raise NotFoundError(detail="alert does not exist")
    await session.execute(
        insert(AlertRead).values(alert_id=alert_id, user_id=viewer.id).on_conflict_do_nothing()
    )


async def mark_all_read(session: AsyncSession, *, viewer: User) -> None:
    """Every alert the account can see and has not read yet, in one statement."""
    unread = select(Alert.id, literal(viewer.id)).where(and_(_visible(viewer), ~_read_by(viewer)))
    await session.execute(
        insert(AlertRead)
        .from_select([AlertRead.alert_id, AlertRead.user_id], unread)
        .on_conflict_do_nothing()
    )

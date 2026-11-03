"""The audit write path, which lives in core: app/core/audit.py."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.audit import AuditLog


async def test_record_writes_one_row(db_session: AsyncSession) -> None:
    actor = uuid.uuid4()
    await audit.record(db_session, action="user_created", user_id=actor, resource_type="user")
    await db_session.flush()
    stored = (await db_session.execute(select(AuditLog))).scalars().all()
    assert len(stored) == 1
    assert stored[0].action == "user_created"
    assert stored[0].user_id == actor


async def test_record_accepts_a_system_action(db_session: AsyncSession) -> None:
    await audit.record(db_session, action="user_created")
    await db_session.flush()
    stored = (await db_session.execute(select(AuditLog))).scalars().one()
    assert stored.user_id is None


async def test_detached_record_survives_a_rollback(db_session: AsyncSession) -> None:
    await audit.record_detached(action="permission_denied")
    await db_session.rollback()
    total = await db_session.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.action == "permission_denied")
    )
    assert total == 1

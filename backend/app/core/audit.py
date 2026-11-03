"""Operator action log (G7): the table and the two write paths.

Append only: no update, no delete. The model and the writers live at tier 0
because `require_roles` in `security.py` records a denial, and tier 0 may only
use external libraries: docs/architecture/dependency-graph.md. The read side
stays in the `audit_log` module, which imports the model from here.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, independent_session


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        # The list screen reads newest first, keyset paged on created_at plus id.
        Index("ix_audit_log_created_at_id", text("created_at DESC"), "id"),
        # Filtering by account still returns newest first: docs/data/database.md.
        Index("ix_audit_log_user_id_created_at", "user_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # No foreign key on any actor column. The log only ever gains rows and is
    # written from its own transaction: docs/data/schema.md.
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    worker_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    program_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(Text, index=True)
    resource_type: Mapped[str | None] = mapped_column(Text)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


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

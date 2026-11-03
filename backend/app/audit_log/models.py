"""Operator action log (G7). Append only: no update, no delete."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    # The list screen reads newest first, keyset paged on created_at plus id.
    __table_args__ = (Index("ix_audit_log_created_at_id", text("created_at DESC"), "id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # No foreign key on any actor column. The log only ever gains rows and is
    # written from its own transaction: docs/data/schema.md.
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
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

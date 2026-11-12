"""Tables owned by the raw_output module: docs/data/schema.md."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from contracts.raw_output import ParseStatus

_STATUSES = ", ".join(f"'{status.value}'" for status in ParseStatus)


class RawOutput(Base):
    """Metadata of one stored file. The bytes live in MinIO, untouched (G8)."""

    __tablename__ = "raw_output"
    __table_args__ = (
        # An upload retried after a network error must not add a second row.
        UniqueConstraint("job_id", "filename"),
        CheckConstraint(f"parse_status IN ({_STATUSES})", name="parse_status_allowed"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # A program hard delete reaches raw output through its jobs.
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job.id", ondelete="CASCADE")
    )
    filename: Mapped[str] = mapped_column(Text)
    object_key: Mapped[str] = mapped_column(Text, unique=True)
    content_type: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(Text)
    parse_status: Mapped[str] = mapped_column(Text, server_default=text("'pending'"))
    parse_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

"""Tables owned by the job module: docs/data/schema.md."""

import uuid
from datetime import datetime
from enum import IntEnum
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from contracts.job_status import JobStatus


class JobPriority(IntEnum):
    """Stored as 0, 1, 2 so the dispatcher sorts on a number: docs/data/schema.md."""

    LOW = 0
    NORMAL = 1
    HIGH = 2


_STATUSES = ", ".join(f"'{status.value}'" for status in JobStatus)


class Job(Base):
    __tablename__ = "job"
    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUSES})", name="status_allowed"),
        CheckConstraint("priority IN (0, 1, 2)", name="priority_allowed"),
        CheckConstraint("cardinality(target) > 0", name="target_not_empty"),
        # The dispatcher reads only queued rows, highest priority, oldest first.
        Index(
            "ix_job_queued_priority_created_at",
            text("priority DESC"),
            "created_at",
            postgresql_where=text("status = 'queued'"),
        ),
        Index("ix_job_status", "status"),
        # Scan History on S05: the jobs whose target holds an asset.
        Index("ix_job_target", "target", postgresql_using="gin"),
        Index("ix_job_program_id_created_at", "program_id", text("created_at DESC")),
        # Deleting a schedule sets schedule_id to NULL on its jobs.
        Index(
            "ix_job_schedule_id", "schedule_id", postgresql_where=text("schedule_id IS NOT NULL")
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # Lower-tier tables are named, their models never imported:
    # .claude/rules/design-patterns.md.
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    tool_module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tool_module.id"), index=True
    )
    status: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(SmallInteger, server_default=text("1"))
    # Canonical targets exactly as the scope check accepted them (G5).
    target: Mapped[list[str]] = mapped_column(ARRAY(Text))
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    # A deleted proxy leaves a finished job's history readable. Deleting one
    # an unfinished job still needs is refused by the program module.
    proxy_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proxy.id", ondelete="SET NULL")
    )
    # Named by table: schedule sits a tier above job. Deleting a schedule keeps
    # the history of the jobs it created.
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule.id", ondelete="SET NULL")
    )
    retry_of_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job.id")
    )
    worker_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("worker.id"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    status_reason: Mapped[str | None] = mapped_column(Text)
    tool_version: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

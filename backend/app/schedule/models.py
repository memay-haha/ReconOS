"""Table owned by the schedule module: docs/data/schema.md."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Bounds of interval_minutes: docs/data/schema.md.
MIN_INTERVAL_MINUTES = 15
MAX_INTERVAL_MINUTES = 525_600


class Schedule(Base):
    """A periodic scan: one job of `tool_module_id` on `target` every interval.

    `target` holds the canonical targets the scope check accepted when the
    schedule was saved; every run checks them again (G5). `params` holds what
    the operator chose, the tool module defaults apply at each run.
    """

    __tablename__ = "schedule"
    __table_args__ = (
        CheckConstraint("cardinality(target) > 0", name="target_not_empty"),
        CheckConstraint(
            f"interval_minutes BETWEEN {MIN_INTERVAL_MINUTES} AND {MAX_INTERVAL_MINUTES}",
            name="interval_minutes_range",
        ),
        # Celery Beat reads only enabled schedules, the most overdue first.
        Index("ix_schedule_due", "next_run_at", postgresql_where=text("is_enabled")),
        Index("ix_schedule_program_id_created_at", "program_id", text("created_at DESC")),
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
    target: Mapped[list[str]] = mapped_column(ARRAY(Text))
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    interval_minutes: Mapped[int] = mapped_column(Integer)
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # First refused run of the current failure streak; NULL while runs succeed.
    # Only the run that opens a streak raises `schedule_run_failed`, so a broken
    # schedule rings the bell once, not every interval.
    failing_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

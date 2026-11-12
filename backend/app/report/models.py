"""Tables owned by the report module: docs/data/schema.md, section Finding và báo cáo.

A report gathers `confirmed` findings of one program. Submitting it moves those
findings to `reported` through the finding service: docs/architecture/business-flow.md,
section Báo cáo. Evidence stays in raw output and is only referenced (G6, G8).
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ReportStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"


_STATUSES = ", ".join(f"'{member.value}'" for member in ReportStatus)


class Report(Base):
    __tablename__ = "report"
    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUSES})", name="status_allowed"),
        # submitted_at is set exactly when the report is submitted.
        CheckConstraint(
            "(status = 'submitted') = (submitted_at IS NOT NULL)",
            name="submitted_at_matches_status",
        ),
        Index("ix_report_program_id_created_at", "program_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # Lower-tier tables are named, their models never imported:
    # .claude/rules/design-patterns.md. A program hard delete removes its reports.
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, server_default=text("''"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    platform_report_ref: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    # clock_timestamp(): see User.updated_at in app/core/identity.py.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("clock_timestamp()"),
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReportFinding(Base):
    """A finding in a report. A finding may sit in several drafts of its program."""

    __tablename__ = "report_finding"

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("report.id", ondelete="CASCADE"), primary_key=True
    )
    finding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("finding.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )

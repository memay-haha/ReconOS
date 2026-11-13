"""Tables owned by the alert module: docs/data/schema.md, section Finding và báo cáo.

`alert` sits at tier 2, below `job`, `finding` and `schedule`, so its foreign
keys to them are declared by table name and no model above is imported:
docs/architecture/dependency-graph.md.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AlertType(StrEnum):
    FINDING_NEW = "finding_new"
    JOB_PENDING_APPROVAL = "job_pending_approval"
    JOB_FAILED = "job_failed"
    ASSET_NEW = "asset_new"
    CERT_EXPIRING = "cert_expiring"
    SCHEDULE_RUN_FAILED = "schedule_run_failed"


# A job raises each of these at most once, so a retried transition or a second
# raw output of the same job cannot ring the bell twice.
ONCE_PER_JOB = (AlertType.JOB_PENDING_APPROVAL, AlertType.JOB_FAILED, AlertType.ASSET_NEW)
ONCE_PER_JOB_WHERE = "alert_type IN ({}) AND job_id IS NOT NULL".format(
    ", ".join(f"'{member.value}'" for member in ONCE_PER_JOB)
)


class Alert(Base):
    __tablename__ = "alert"
    __table_args__ = (
        CheckConstraint(
            "alert_type IN ({})".format(", ".join(f"'{member.value}'" for member in AlertType)),
            name="alert_type_allowed",
        ),
        # The bell reads newest first within the programs an account sees.
        Index("ix_alert_program_id_created_at", "program_id", text("created_at DESC")),
        Index("ix_alert_created_at_id", text("created_at DESC"), text("id DESC")),
        Index(
            "uq_alert_alert_type_job_id",
            "alert_type",
            "job_id",
            unique=True,
            postgresql_where=text(ONCE_PER_JOB_WHERE),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # NULL marks a system-wide alert, shown to Superadmin and Admin only.
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    alert_type: Mapped[str] = mapped_column(Text)
    # Built by the backend from target data: untrusted, the browser renders it as text.
    message: Mapped[str] = mapped_column(Text)
    finding_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("finding.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job.id", ondelete="CASCADE"), index=True
    )
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class AlertRead(Base):
    """One row per account that read an alert. No row: unread."""

    __tablename__ = "alert_read"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("alert.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

"""Table owned by the dashboard module: docs/data/schema.md, section Tài khoản và vận hành.

The module only reads the tables of other modules. It owns `diagnostic_run`,
the record of one Run Diagnostics on S15.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DiagnosticStatus(StrEnum):
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"


class DiagnosticRun(Base):
    __tablename__ = "diagnostic_run"
    __table_args__ = (
        CheckConstraint(
            "status IN ({})".format(", ".join(f"'{s.value}'" for s in DiagnosticStatus)),
            name="status_allowed",
        ),
        # A finished run carries its exit code; a running one does not.
        CheckConstraint(
            "(status = 'running') = (exit_code IS NULL)", name="exit_code_matches_status"
        ),
        Index("ix_diagnostic_run_created_at", text("created_at DESC"), text("id DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    status: Mapped[str] = mapped_column(Text, server_default=text("'running'"))
    exit_code: Mapped[int | None] = mapped_column(Integer)
    # One check per line, prefixed [OK], [WARN], [FAIL] or [*]. Never a
    # credential, a path or a PID: docs/data/schema.md.
    output: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

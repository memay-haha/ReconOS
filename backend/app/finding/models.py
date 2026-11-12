"""Table owned by the finding module: docs/data/schema.md, section Finding và báo cáo.

A finding is written by the parser only, through an upsert on
(`program_id`, `dedup_key`): a finding seen again moves `last_seen_at` and
keeps its triage state, docs/data/database.md. Triage changes it by hand.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.asset.models import ONE_ASSET, asset_column_indexes
from app.core.db import Base


class Severity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class TriageStatus(StrEnum):
    NEW = "new"
    CONFIRMED = "confirmed"
    FALSE_POSITIVE = "false_positive"
    DUPLICATE = "duplicate"
    REPORTED = "reported"
    RESOLVED = "resolved"


def _allowed(values: type[StrEnum]) -> str:
    return ", ".join(f"'{member.value}'" for member in values)


def _asset_fk(table: str) -> Mapped[uuid.UUID | None]:
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete="CASCADE"))


class Finding(Base):
    __tablename__ = "finding"
    __table_args__ = (
        UniqueConstraint("program_id", "dedup_key"),
        CheckConstraint(ONE_ASSET, name="one_asset"),
        CheckConstraint(f"severity IN ({_allowed(Severity)})", name="severity_allowed"),
        CheckConstraint(
            f"triage_status IN ({_allowed(TriageStatus)})", name="triage_status_allowed"
        ),
        # duplicate_of_id is set exactly when the finding is a duplicate.
        CheckConstraint(
            "(triage_status = 'duplicate') = (duplicate_of_id IS NOT NULL)",
            name="duplicate_of_matches_status",
        ),
        CheckConstraint("duplicate_of_id <> id", name="not_duplicate_of_itself"),
        Index(
            "ix_finding_program_id_triage_status_severity",
            "program_id",
            "triage_status",
            "severity",
        ),
        Index("ix_finding_program_id_last_seen_at", "program_id", "last_seen_at"),
        *asset_column_indexes("finding"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # Lower-tier tables are named, their models never imported:
    # .claude/rules/design-patterns.md.
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    # Job and raw output of the first sighting: the evidence (G6, G8). A
    # program hard delete removes them in the same statement.
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job.id"), index=True
    )
    raw_output_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_output.id"), index=True
    )
    domain_id: Mapped[uuid.UUID | None] = _asset_fk("domain")
    ip_id: Mapped[uuid.UUID | None] = _asset_fk("ip")
    url_id: Mapped[uuid.UUID | None] = _asset_fk("url")
    service_id: Mapped[uuid.UUID | None] = _asset_fk("service")
    dedup_key: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    template_id: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(Text)
    matched_at: Mapped[str | None] = mapped_column(Text)
    evidence: Mapped[str | None] = mapped_column(Text)
    cve: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    triage_status: Mapped[str] = mapped_column(Text, server_default=text("'new'"))
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("finding.id")
    )
    triaged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

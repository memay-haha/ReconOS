"""Table owned by the screenshot module: docs/data/schema.md, section Tài sản.

A screenshot is written by the gowitness parser only, through an upsert on
(`job_id`, `url_id`): parsing the same file again changes no row count. The
image stays a raw output in MinIO (G8); this row only points at it.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    REAL,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Screenshot(Base):
    __tablename__ = "screenshot"
    __table_args__ = (
        # One capture per URL per job: a reparse updates it in place.
        UniqueConstraint("job_id", "url_id"),
        Index("ix_screenshot_program_id_captured_at", "program_id", "captured_at"),
        Index("ix_screenshot_program_id_perception_hash", "program_id", "perception_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # Lower-tier tables are named, their models never imported:
    # .claude/rules/design-patterns.md.
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    url_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("url.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job.id"), index=True
    )
    # The PNG; NULL when the capture failed and gowitness saved no image.
    raw_output_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_output.id"), unique=True
    )
    # gowitness.jsonl, which carries the page HTML untouched (G8).
    html_raw_output_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_output.id"), index=True
    )
    final_url: Mapped[str | None] = mapped_column(Text)
    status_code: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(Text)
    perception_hash: Mapped[str | None] = mapped_column(Text)
    http_headers: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    device_scale: Mapped[float | None] = mapped_column(REAL)
    remote_ip: Mapped[str | None] = mapped_column(INET)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    tls: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    network_log: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    console_log: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    cookies: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    # Copy of the page HTML, cut at MAX_HTML_BYTES, for GET /screenshots/{id}/html.
    html: Mapped[str | None] = mapped_column(Text)
    is_failed: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    error_message: Mapped[str | None] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

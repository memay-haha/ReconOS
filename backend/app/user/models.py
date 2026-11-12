"""Tables owned by the user module: docs/data/schema.md."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, REAL, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LoginAttempt(Base):
    """One row per failed login. No foreign key: the username may not exist."""

    __tablename__ = "login_attempt"
    # Both throttle counters filter on the actor and the window together, which
    # is what a composite index serves: docs/data/database.md.
    __table_args__ = (
        Index("ix_login_attempt_username_attempted_at", "username", "attempted_at"),
        Index("ix_login_attempt_ip_address_attempted_at", "ip_address", "attempted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    username: Mapped[str] = mapped_column(Text)
    ip_address: Mapped[str] = mapped_column(INET)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Worker(Base):
    """A worker machine. The three reported columns come from its heartbeat."""

    __tablename__ = "worker"
    __table_args__ = (CheckConstraint("cpu_percent BETWEEN 0 AND 100", name="cpu_percent_range"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name: Mapped[str] = mapped_column(Text, unique=True)
    tool_modules: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default=text("'{}'::text[]")
    )
    # [{"name": ..., "version": ...}] as the worker reports it: docs/data/schema.md.
    tool_versions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    cpu_percent: Mapped[float | None] = mapped_column(REAL)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class WorkerToken(Base):
    """A bearer token of a worker. Only the SHA-256 digest is stored (G7)."""

    __tablename__ = "worker_token"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worker.id"), index=True
    )
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

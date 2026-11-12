"""Tables owned by the engine module: docs/data/schema.md.

One `engine` row per engine named in code (`runs_on` of a tool module),
seeded by migration: the screen only edits the connection, never adds an engine.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    LargeBinary,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Engine(Base):
    """Connection to an engine server. Credentials are write-only (G7)."""

    __tablename__ = "engine"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name: Mapped[str] = mapped_column(Text, unique=True)
    # Empty until a Superadmin sets it on S16, S17.
    base_url: Mapped[str] = mapped_column(Text, server_default=text("''"))
    # AES-256-GCM through app/core/crypto.py, bound to "engine.api_key_encrypted".
    api_key_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    # Vigolium only, bound to "engine.llm_api_key_encrypted".
    llm_api_key_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    # Off until the connection is set, so no job dispatches to an empty address.
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    version: Mapped[str | None] = mapped_column(Text)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean)
    api_key_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # First `ok` health check of the current run of `ok` results, NULL otherwise.
    ok_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    # clock_timestamp(): see User.updated_at in app/core/identity.py.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("clock_timestamp()"),
    )


class EngineVariable(Base):
    """A variable passed to every run of the engine. The value is write-only (G7)."""

    __tablename__ = "engine_variable"
    __table_args__ = (UniqueConstraint("engine_id", "key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    engine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engine.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(Text)
    # Bound to "engine_variable.value_encrypted".
    value_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("clock_timestamp()"),
    )

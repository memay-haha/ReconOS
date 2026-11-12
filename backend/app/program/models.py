"""Tables owned by the program module: docs/data/schema.md."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    LargeBinary,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProgramStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class BountyType(StrEnum):
    BOUNTY = "bounty"
    VDP = "vdp"


class Program(Base):
    __tablename__ = "program"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'paused', 'archived')", name="status_allowed"),
        CheckConstraint("bounty_type IN ('bounty', 'vdp')", name="bounty_type_allowed"),
        # archived_at is the archive moment, so it exists exactly while archived.
        CheckConstraint(
            "(status = 'archived') = (archived_at IS NOT NULL)", name="archived_at_matches_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name: Mapped[str] = mapped_column(Text, unique=True)
    platform: Mapped[str | None] = mapped_column(Text)
    platform_url: Mapped[str | None] = mapped_column(Text)
    platform_handle: Mapped[str | None] = mapped_column(Text)
    bounty_type: Mapped[str] = mapped_column(Text, server_default=text("'bounty'"))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
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
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProgramUser(Base):
    """A User assigned to a program. Admin and Superadmin need no row."""

    __tablename__ = "program_user"

    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE"), primary_key=True
    )
    # Indexed: every request of a User filters by the programs assigned to it.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), primary_key=True, index=True
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Proxy(Base):
    """A proxy of a program. The URL may hold credentials, so it is stored encrypted."""

    __tablename__ = "proxy"
    __table_args__ = (UniqueConstraint("program_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text)
    # AES-256-GCM through app/core/crypto.py, bound to "proxy.url_encrypted".
    url_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("clock_timestamp()"),
    )

"""Tables owned by the tool_module module: docs/data/schema.md."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ToolModule(Base):
    """Operator settings of one tool module registered in code.

    The group and the parameter schema live in code, not here: a row only
    tunes what the code already allows: docs/architecture/modules.md.
    """

    __tablename__ = "tool_module"
    __table_args__ = (
        CheckConstraint("max_concurrency > 0", name="max_concurrency_positive"),
        CheckConstraint(
            "rate_limit_per_minute IS NULL OR rate_limit_per_minute > 0",
            name="rate_limit_per_minute_positive",
        ),
        CheckConstraint("timeout_minutes > 0", name="timeout_minutes_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name: Mapped[str] = mapped_column(Text, unique=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    default_params: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    max_concurrency: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    # NULL: no rate limit, only the concurrency limit applies.
    rate_limit_per_minute: Mapped[int | None] = mapped_column(Integer)
    timeout_minutes: Mapped[int] = mapped_column(Integer, server_default=text("60"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("clock_timestamp()"),
    )

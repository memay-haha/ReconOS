"""Tables owned by the user module: docs/data/schema.md."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, Text, text
from sqlalchemy.dialects.postgresql import INET, UUID
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

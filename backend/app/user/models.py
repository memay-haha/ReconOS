"""Tables owned by the user module: docs/data/schema.md."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LoginAttempt(Base):
    """One row per failed login. No foreign key: the username may not exist."""

    __tablename__ = "login_attempt"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    username: Mapped[str] = mapped_column(Text, index=True)
    ip_address: Mapped[str] = mapped_column(INET, index=True)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), index=True
    )

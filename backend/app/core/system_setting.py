"""Operational thresholds Superadmin edits at runtime: docs/ops/configuration.md."""

import time
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text, select, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Defaults come from docs/ops/configuration.md. A missing row uses the default.
DEFAULT_SETTINGS: dict[str, int] = {
    "session_idle_timeout_minutes": 30,
    "session_absolute_timeout_hours": 12,
    "login_max_failures_per_account": 5,
    "login_max_failures_per_ip": 20,
    "login_failure_window_minutes": 15,
    "dispatcher_poll_seconds": 30,
    "job_heartbeat_seconds": 30,
    "job_heartbeat_timeout_minutes": 5,
    "upload_max_bytes": 10 * 1024**3,
    "queue_capacity": 1000,
}
# configuration.md promises an edit applies within 60 seconds.
SETTING_CACHE_SECONDS = 60

_cache: dict[str, tuple[float, int]] = {}


class SystemSetting(Base):
    __tablename__ = "system_setting"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


def clear_setting_cache() -> None:
    _cache.clear()


async def get_int_setting(session: AsyncSession, key: str) -> int:
    cached = _cache.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < SETTING_CACHE_SECONDS:
        return cached[1]
    stored = await session.scalar(select(SystemSetting.value).where(SystemSetting.key == key))
    value = DEFAULT_SETTINGS[key] if stored is None else int(stored)
    _cache[key] = (now, value)
    return value

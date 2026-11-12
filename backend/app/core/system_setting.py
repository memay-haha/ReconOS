"""Operational thresholds Superadmin edits at runtime: docs/ops/configuration.md.

The table lives in core because every tier reads a threshold. Reading, listing
and editing live here too, so the HTTP surface in `system_setting_router.py`
stays a thin layer: docs/architecture/dependency-graph.md.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

from sqlalchemy import DateTime, ForeignKey, Text, select, text
from sqlalchemy.dialects.postgresql import JSONB, UUID, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core import audit
from app.core.db import Base
from app.core.errors import ForbiddenError, NotFoundError, ValidationFailedError
from app.core.identity import User, UserRole


@dataclass(frozen=True)
class SettingSpec:
    default: int
    minimum: int
    maximum: int
    # Admin and User may read it: column Đọc công khai of configuration.md.
    public: bool = False


_GIB = 1024**3
_MIB = 1024**2

# Defaults and the public flag come from docs/ops/configuration.md, the bounds
# from docs/superpowers/specs/2026-11-13-batch10-decisions.md.
SETTING_SPECS: Final[dict[str, SettingSpec]] = {
    "session_idle_timeout_minutes": SettingSpec(30, 5, 1440),
    "session_absolute_timeout_hours": SettingSpec(12, 1, 168),
    "login_max_failures_per_account": SettingSpec(5, 3, 100),
    "login_max_failures_per_ip": SettingSpec(20, 5, 1000),
    "login_failure_window_minutes": SettingSpec(15, 1, 1440),
    "dispatcher_poll_seconds": SettingSpec(30, 5, 600),
    "job_heartbeat_seconds": SettingSpec(30, 5, 600),
    "job_heartbeat_timeout_minutes": SettingSpec(5, 1, 1440),
    "upload_max_bytes": SettingSpec(10 * _GIB, _MIB, 100 * _GIB),
    "parser_batch_size": SettingSpec(1000, 100, 10_000),
    "log_retention_days": SettingSpec(30, 1, 365, public=True),
    "finding_sla_days": SettingSpec(30, 3, 365, public=True),
    "queue_capacity": SettingSpec(1000, 1, 1_000_000, public=True),
    "user_idle_after_minutes": SettingSpec(15, 1, 1440),
    "cert_expiring_days": SettingSpec(14, 1, 365, public=True),
}

DEFAULT_SETTINGS: Final[dict[str, int]] = {key: spec.default for key, spec in SETTING_SPECS.items()}

# configuration.md promises an edit applies within 60 seconds.
SETTING_CACHE_SECONDS = 60

RESOURCE = "system_setting"

_cache: dict[str, tuple[float, int]] = {}


class SystemSetting(Base):
    __tablename__ = "system_setting"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


@dataclass(frozen=True)
class SettingView:
    key: str
    value: int
    default: int
    minimum: int
    maximum: int
    is_public: bool
    # None while the key still uses its default.
    updated_by: uuid.UUID | None
    updated_at: datetime | None


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


def _view(key: str, row: SystemSetting | None) -> SettingView:
    spec = SETTING_SPECS[key]
    return SettingView(
        key=key,
        value=spec.default if row is None else int(row.value),
        default=spec.default,
        minimum=spec.minimum,
        maximum=spec.maximum,
        is_public=spec.public,
        updated_by=None if row is None else row.updated_by,
        updated_at=None if row is None else row.updated_at,
    )


async def list_settings(session: AsyncSession) -> list[SettingView]:
    """Every documented key in name order, stored or not. Unknown rows are ignored."""
    rows = {row.key: row for row in (await session.execute(select(SystemSetting))).scalars()}
    return [_view(key, rows.get(key)) for key in sorted(SETTING_SPECS)]


async def read_setting(session: AsyncSession, *, viewer: User, key: str) -> SettingView:
    spec = SETTING_SPECS.get(key)
    if spec is None:
        raise NotFoundError(detail="setting does not exist")
    if not spec.public and viewer.role != UserRole.SUPERADMIN:
        raise ForbiddenError(detail="only a Superadmin reads this setting")
    row = await session.get(SystemSetting, key)
    return _view(key, row)


def _out_of_range() -> ValidationFailedError:
    return ValidationFailedError(
        detail="value is outside the allowed range of this setting",
        errors=[{"field": "value", "code": "out_of_range"}],
    )


async def _check_pairs(session: AsyncSession, key: str, value: int) -> None:
    """Thresholds that only make sense together: the decision log of batch 10."""

    async def other(name: str) -> int:
        return value if name == key else await get_int_setting(session, name)

    # A job must miss at least two heartbeats before it is called lost.
    heartbeat_pair = {"job_heartbeat_seconds", "job_heartbeat_timeout_minutes"}
    if key in heartbeat_pair and await other(
        "job_heartbeat_timeout_minutes"
    ) * 60 < 2 * await other("job_heartbeat_seconds"):
        raise ValidationFailedError(
            detail="job_heartbeat_timeout_minutes must cover two heartbeats",
            errors=[{"field": "value", "code": "setting_conflict"}],
        )
    session_pair = {"session_idle_timeout_minutes", "session_absolute_timeout_hours"}
    if (
        key in session_pair
        and await other("session_idle_timeout_minutes")
        > await other("session_absolute_timeout_hours") * 60
    ):
        raise ValidationFailedError(
            detail="session idle timeout cannot exceed the absolute timeout",
            errors=[{"field": "value", "code": "setting_conflict"}],
        )


async def update_setting(
    session: AsyncSession, *, actor: User, key: str, value: int
) -> SettingView:
    """Store a new value. Other processes pick it up within SETTING_CACHE_SECONDS."""
    spec = SETTING_SPECS.get(key)
    if spec is None:
        raise NotFoundError(detail="setting does not exist")
    if not spec.minimum <= value <= spec.maximum:
        raise _out_of_range()
    _cache.pop(key, None)
    await _check_pairs(session, key, value)
    old = await get_int_setting(session, key)
    stmt = insert(SystemSetting).values(key=key, value=value, updated_by=actor.id)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[SystemSetting.key],
            set_={
                "value": stmt.excluded.value,
                "updated_by": actor.id,
                "updated_at": text("now()"),
            },
        )
    )
    _cache.pop(key, None)
    await audit.record(
        session,
        action="system_setting_updated",
        user_id=actor.id,
        resource_type=RESOURCE,
        detail={"key": key, "old": old, "new": value},
    )
    row = await session.get(SystemSetting, key, populate_existing=True)
    return _view(key, row)

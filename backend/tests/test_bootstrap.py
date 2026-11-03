from collections.abc import AsyncIterator, Awaitable, Callable, Iterator

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from structlog.testing import capture_logs

from app import bootstrap
from app.audit_log.models import AuditLog
from app.bootstrap import BootstrapConfigError, run_bootstrap
from app.core.config import Settings, get_settings
from app.core.errors import ValidationFailedError
from app.core.identity import User, UserRole
from app.core.security import verify_password

PASSWORD = "troutmoonlit7Ladder!quay"
USERNAME = "rootadmin"


async def test_creates_the_first_superadmin(
    db_session: AsyncSession, settings_factory: Callable[..., Settings]
) -> None:
    settings = settings_factory(
        bootstrap_admin_username=USERNAME, bootstrap_admin_password=PASSWORD
    )
    assert await run_bootstrap(db_session, settings) is True
    created = await db_session.scalar(select(User).where(User.username == USERNAME))
    assert created is not None
    assert created.role == UserRole.SUPERADMIN.value
    assert verify_password(created.password_hash, PASSWORD)


async def test_creation_is_audited_without_an_acting_user(
    db_session: AsyncSession, settings_factory: Callable[..., Settings]
) -> None:
    settings = settings_factory(
        bootstrap_admin_username=USERNAME, bootstrap_admin_password=PASSWORD
    )
    await run_bootstrap(db_session, settings)
    created = await db_session.scalar(select(User).where(User.username == USERNAME))
    assert created is not None
    row = await db_session.scalar(select(AuditLog).where(AuditLog.action == "user_created"))
    assert row is not None
    assert row.user_id is None
    assert row.resource_type == "user"
    assert row.resource_id == created.id


async def test_second_run_changes_nothing(
    db_session: AsyncSession,
    settings_factory: Callable[..., Settings],
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    existing = await user_factory(role=UserRole.SUPERADMIN)
    before = existing.password_hash
    settings = settings_factory(
        bootstrap_admin_username=USERNAME, bootstrap_admin_password="another9Passphrase!changed"
    )
    assert await run_bootstrap(db_session, settings) is False
    total = await db_session.scalar(select(func.count()).select_from(User))
    assert total == 1
    await db_session.refresh(existing)
    assert existing.username != USERNAME
    assert existing.password_hash == before


async def test_missing_variables_raise(
    db_session: AsyncSession, settings_factory: Callable[..., Settings]
) -> None:
    with pytest.raises(BootstrapConfigError):
        await run_bootstrap(db_session, settings_factory())


async def test_weak_password_raises_and_creates_nothing(
    db_session: AsyncSession, settings_factory: Callable[..., Settings]
) -> None:
    settings = settings_factory(
        bootstrap_admin_username=USERNAME, bootstrap_admin_password="password1234"
    )
    with pytest.raises(ValidationFailedError):
        await run_bootstrap(db_session, settings)
    assert await db_session.scalar(select(func.count()).select_from(User)) == 0


async def test_password_never_reaches_the_log(
    db_session: AsyncSession, settings_factory: Callable[..., Settings]
) -> None:
    settings = settings_factory(
        bootstrap_admin_username=USERNAME, bootstrap_admin_password=PASSWORD
    )
    with capture_logs() as logs:
        await run_bootstrap(db_session, settings)
        await run_bootstrap(db_session, settings)
    assert [entry["event"] for entry in logs] == ["bootstrap_created", "bootstrap_skipped"]
    assert PASSWORD not in repr(logs)
    assert logs[0]["username"] == USERNAME


@pytest_asyncio.fixture
async def empty_user_table(db_engine: AsyncEngine) -> AsyncIterator[None]:
    """main() commits on its own engine, so the rollback fixture cannot undo it."""

    async def wipe() -> None:
        async with db_engine.begin() as connection:
            await connection.execute(text("DELETE FROM audit_log"))
            await connection.execute(text('DELETE FROM "user"'))

    await wipe()
    yield
    await wipe()


@pytest.fixture(autouse=True)
def _fresh_settings() -> Iterator[None]:
    """main() reads the cached settings, so a value set by one test must not leak."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.usefixtures("empty_user_table")
def test_main_exits_zero_then_skips(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RECONOS_BOOTSTRAP_ADMIN_USERNAME", USERNAME)
    monkeypatch.setenv("RECONOS_BOOTSTRAP_ADMIN_PASSWORD", PASSWORD)
    with capture_logs() as logs:
        assert bootstrap.main() == 0
        assert bootstrap.main() == 0
    assert [entry["event"] for entry in logs] == ["bootstrap_created", "bootstrap_skipped"]
    assert PASSWORD not in repr(logs)


@pytest.mark.usefixtures("empty_user_table")
def test_main_exits_nonzero_without_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECONOS_BOOTSTRAP_ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("RECONOS_BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    with capture_logs() as logs:
        assert bootstrap.main() == 1
    assert logs[-1]["event"] == "bootstrap_missing_configuration"
    assert logs[-1]["log_level"] == "critical"

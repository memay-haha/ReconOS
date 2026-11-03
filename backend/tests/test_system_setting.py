import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.system_setting import (
    DEFAULT_SETTINGS,
    SystemSetting,
    clear_setting_cache,
    get_int_setting,
)


@pytest.fixture(autouse=True)
def _clean_cache() -> None:
    clear_setting_cache()


def test_defaults_match_the_configuration_document() -> None:
    assert DEFAULT_SETTINGS["session_idle_timeout_minutes"] == 30
    assert DEFAULT_SETTINGS["session_absolute_timeout_hours"] == 12
    assert DEFAULT_SETTINGS["login_max_failures_per_account"] == 5
    assert DEFAULT_SETTINGS["login_max_failures_per_ip"] == 20
    assert DEFAULT_SETTINGS["login_failure_window_minutes"] == 15


async def test_missing_row_falls_back_to_default(db_session: AsyncSession) -> None:
    assert await get_int_setting(db_session, "login_max_failures_per_account") == 5


async def test_stored_row_wins(db_session: AsyncSession) -> None:
    db_session.add(SystemSetting(key="login_max_failures_per_account", value=9))
    await db_session.flush()
    assert await get_int_setting(db_session, "login_max_failures_per_account") == 9


async def test_value_is_cached_within_the_window(db_session: AsyncSession) -> None:
    assert await get_int_setting(db_session, "login_max_failures_per_ip") == 20
    db_session.add(SystemSetting(key="login_max_failures_per_ip", value=99))
    await db_session.flush()
    assert await get_int_setting(db_session, "login_max_failures_per_ip") == 20

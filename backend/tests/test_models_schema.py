from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole, UserSession
from app.core.system_setting import SystemSetting
from app.user.models import LoginAttempt


def test_tables_are_named_after_the_schema_document() -> None:
    assert User.__tablename__ == "user"
    assert UserSession.__tablename__ == "user_session"
    assert LoginAttempt.__tablename__ == "login_attempt"
    assert AuditLog.__tablename__ == "audit_log"
    assert SystemSetting.__tablename__ == "system_setting"


def test_user_columns_match_the_erd() -> None:
    assert set(User.__table__.columns.keys()) == {
        "id",
        "username",
        "display_name",
        "password_hash",
        "role",
        "is_locked",
        "last_login_at",
        "created_at",
        "updated_at",
    }
    assert User.__table__.columns["username"].unique is True


def test_user_session_hash_is_unique() -> None:
    assert UserSession.__table__.columns["session_hash"].unique is True


def test_login_attempt_has_no_foreign_key() -> None:
    # Failed logins are recorded for usernames that do not exist.
    assert not LoginAttempt.__table__.foreign_keys


def test_audit_log_has_no_foreign_key() -> None:
    # The log is written from its own transaction, so it cannot depend on
    # rows another transaction has not committed yet.
    assert not AuditLog.__table__.foreign_keys


def test_roles_match_the_glossary() -> None:
    assert [role.value for role in UserRole] == ["superadmin", "admin", "user"]


async def test_migration_creates_every_table(db_session: AsyncSession) -> None:
    rows = await db_session.execute(
        text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND tablename IN ('user', 'user_session', 'login_attempt', "
            "'audit_log', 'system_setting')"
        )
    )
    assert len(rows.scalars().all()) == 5


async def test_migration_creates_the_documented_indexes(db_session: AsyncSession) -> None:
    # Both throttle counters and the log list filter on two columns together,
    # so each needs the composite index: docs/data/database.md.
    rows = await db_session.execute(
        text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
    )
    present = set(rows.scalars().all())
    assert {
        "ix_login_attempt_username_attempted_at",
        "ix_login_attempt_ip_address_attempted_at",
        "ix_audit_log_user_id_created_at",
        "ix_audit_log_created_at_id",
    } <= present
    # The single-column indexes the composites replace are gone.
    assert not present & {
        "ix_login_attempt_username",
        "ix_login_attempt_ip_address",
        "ix_login_attempt_attempted_at",
        "ix_audit_log_user_id",
    }

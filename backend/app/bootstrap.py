"""Create the first Superadmin account.

Runs once, when the user table is still empty. A later run leaves the stored
account untouched, so changing the variables never rewrites a real password:
docs/security/authentication.md.
"""

import asyncio
import sys

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.config import Settings, get_settings
from app.core.db import build_engine, session_scope
from app.core.errors import ValidationFailedError
from app.core.identity import User, UserRole
from app.core.security import check_password_policy, hash_password

log = structlog.get_logger()


class BootstrapConfigError(Exception):
    """The user table is empty but the bootstrap variables are missing."""

    def __init__(self) -> None:
        super().__init__(
            "RECONOS_BOOTSTRAP_ADMIN_USERNAME and RECONOS_BOOTSTRAP_ADMIN_PASSWORD are required"
        )


async def run_bootstrap(session: AsyncSession, settings: Settings) -> bool:
    """Create the first Superadmin. True when created, False when skipped."""
    existing = await session.scalar(select(func.count()).select_from(User))
    if existing:
        log.info("bootstrap_skipped", accounts=existing)
        return False
    username = settings.bootstrap_admin_username
    password = settings.bootstrap_admin_password
    if username is None or password is None:
        raise BootstrapConfigError
    secret = password.get_secret_value()
    check_password_policy(secret, user_inputs=[username])
    user = User(
        username=username,
        display_name=username,
        password_hash=hash_password(secret),
        role=UserRole.SUPERADMIN.value,
    )
    session.add(user)
    await session.flush()
    # A system action: no account performed it.
    await audit.record(session, action="user_created", resource_type="user", resource_id=user.id)
    log.info("bootstrap_created", username=username)
    return True


async def _run() -> int:
    settings = get_settings()
    # A dedicated engine, disposed below: the process-wide one is for the API.
    engine = build_engine(settings)
    try:
        async with session_scope(engine) as session:
            await run_bootstrap(session, settings)
    except (BootstrapConfigError, ValidationFailedError) as err:
        # The reason names the variable or the policy rule that failed. It
        # carries no password: check_password_policy never echoes one.
        log.critical("bootstrap_configuration_rejected", reason=str(err))
        return 1
    finally:
        await engine.dispose()
    return 0


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    sys.exit(main())

"""Authentication and authorization primitives shared by every module.

Password policy, session identifiers, cookie attributes, CSRF checks and the
FastAPI dependencies live here, at tier 0, because a module at any tier needs
to know who is calling: docs/architecture/dependency-graph.md.

Rules this file implements: docs/security/authentication.md and
docs/security/authorization.md. It must keep 100% branch coverage.
"""

import hashlib
import hmac
import secrets
import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Final, Literal
from urllib.parse import urlsplit

import structlog
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError
from fastapi import Request
from sqlalchemy import ColumnElement, column, select, table, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from zxcvbn import zxcvbn

from app.core import audit
from app.core.config import Settings
from app.core.errors import ForbiddenError, UnauthenticatedError, ValidationFailedError
from app.core.identity import User, UserRole, UserSession
from app.core.system_setting import get_int_setting

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
MIN_PASSWORD_SCORE = 3

# argon2-cffi defaults to Argon2id, the variant authentication.md requires.
_hasher = PasswordHasher()
# A real hash to compare against when the account does not exist, so a wrong
# username and a wrong password take the same time to answer.
_BURN_DIGEST = _hasher.hash("reconos burn comparison value")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except Argon2Error, InvalidHashError:
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except Argon2Error, InvalidHashError:
        return True


def burn_password_comparison() -> None:
    """Spend the time a real verification would take, and discard the result."""
    verify_password(_BURN_DIGEST, "reconos wrong value")


def check_password_policy(
    password: str, *, user_inputs: Sequence[str] = (), field: str = "password"
) -> None:
    """Raise when the password breaks the policy. The message never echoes it.

    `field` names the request body field the password came from, so a form can
    put the error on the input the caller typed into.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationFailedError(
            detail="password is shorter than the minimum length",
            errors=[{"field": field, "code": "password_too_short"}],
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValidationFailedError(
            detail="password is longer than the maximum length",
            errors=[{"field": field, "code": "password_too_long"}],
        )
    if int(zxcvbn(password, user_inputs=list(user_inputs))["score"]) < MIN_PASSWORD_SCORE:
        raise ValidationFailedError(
            detail="password is too easy to guess",
            errors=[{"field": field, "code": "password_too_weak"}],
        )


SESSION_ID_BYTES = 32
HOST_COOKIE_NAME = "__Host-reconos_session"
PLAIN_COOKIE_NAME = "reconos_session"


def new_session_id() -> str:
    return secrets.token_urlsafe(SESSION_ID_BYTES)


def hash_session_id(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def session_id_matches(stored_hash: str, session_id: str) -> bool:
    return hmac.compare_digest(stored_hash, hash_session_id(session_id))


@dataclass(frozen=True)
class SessionCookie:
    """Cookie attributes. The __Host- prefix needs Secure, which needs https."""

    name: str
    secure: bool
    httponly: bool = True
    samesite: Literal["lax", "strict", "none"] = "lax"
    path: str = "/"


def session_cookie(settings: Settings) -> SessionCookie:
    secure = urlsplit(settings.public_origin).scheme == "https"
    return SessionCookie(name=HOST_COOKIE_NAME if secure else PLAIN_COOKIE_NAME, secure=secure)


UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def enforce_csrf(request: Request, settings: Settings) -> None:
    """Reject browser requests a different site could have triggered.

    Rules and reasoning: docs/api/architecture.md, section Chống CSRF.
    """
    if request.method not in UNSAFE_METHODS:
        return
    origin = request.headers.get("origin")
    fetch_site = request.headers.get("sec-fetch-site")
    if origin is not None and origin != settings.public_origin:
        raise ForbiddenError(detail="request origin is not allowed")
    if fetch_site == "cross-site":
        raise ForbiddenError(detail="cross-site request is not allowed")
    if origin is None and fetch_site is None and session_cookie(settings).name in request.cookies:
        raise ForbiddenError(detail="request carries a session cookie without origin headers")


log = structlog.get_logger()

# One detail for every rejection: the response body must not reveal which check failed.
_UNAUTHENTICATED_DETAIL = "authentication is required"


def _reject(cause: str) -> UnauthenticatedError:
    """Log why the request was refused and return the one error the caller sees."""
    log.info("authentication_rejected", cause=cause)
    return UnauthenticatedError(detail=_UNAUTHENTICATED_DETAIL)


class AllPrograms:
    """Marker for an account that sees every program."""


ALL_PROGRAMS: Final = AllPrograms()


async def load_current_user(request: Request, session: AsyncSession, settings: Settings) -> User:
    """Resolve the session cookie to an account, or raise UnauthenticatedError.

    Every rejection raises the same error with the same detail, so the response
    cannot tell a caller an unknown cookie from an expired session or a locked
    account. The specific cause goes to the server log as the `cause` field.
    """
    session_id = request.cookies.get(session_cookie(settings).name)
    if session_id is None:
        raise _reject("no_cookie")
    row = (
        await session.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.session_hash == hash_session_id(session_id))
        )
    ).first()
    if row is None:
        raise _reject("unknown_session")
    user_session, user = row
    now = datetime.now(UTC)
    # Absolute lifetime is fixed at login and never extended, unlike the idle window.
    if user_session.expires_at <= now:
        raise _reject("absolute_expiry")
    idle_minutes = await get_int_setting(session, "session_idle_timeout_minutes")
    if user_session.last_seen_at + timedelta(minutes=idle_minutes) <= now:
        raise _reject("idle_expiry")
    if user.is_locked:
        raise _reject("account_locked")
    user_session.last_seen_at = now
    return user


def require_roles(*roles: UserRole) -> Callable[[User, Request], Awaitable[User]]:
    """Build a guard that admits only the listed roles.

    Called with no roles, the guard denies everyone, Superadmin included. An
    endpoint that declares no guard at all is covered by the route test in
    backend/tests/test_app_surface.py, which refuses a route that depends on
    neither the current account nor the named public allowlist.
    """
    allowed = {role.value for role in roles}

    async def guard(user: User, request: Request) -> User:
        if user.role not in allowed:
            # Only a state-changing request is recorded. A denied read changed
            # nothing, and any account could otherwise flood an append-only
            # table with no retention policy by looping a forbidden GET.
            if request.method in UNSAFE_METHODS:
                # Detached: raising below rolls the request transaction back,
                # and a plain record() would be rolled back with it.
                await audit.record_detached(
                    action="permission_denied",
                    user_id=user.id,
                    ip_address=request.client.host if request.client else None,
                    detail={
                        "required": sorted(allowed),
                        "method": request.method,
                        "path": request.url.path,
                    },
                )
            raise ForbiddenError(detail="role is not allowed to perform this action")
        return user

    return guard


# The assignment table belongs to the program module, a higher tier. Core reads
# it by table name and never imports that model: docs/architecture/dependency-graph.md.
_program_user = table("program_user", column("program_id"), column("user_id"))


def _sees_every_program(user: User) -> bool:
    return user.role in {UserRole.SUPERADMIN.value, UserRole.ADMIN.value}


async def allowed_program_ids(
    session: AsyncSession, user: User
) -> frozenset[uuid.UUID] | AllPrograms:
    """Programs the account may read: every one for Superadmin and Admin.

    A User sees the programs `program_user` assigns to it, and nothing else.
    """
    if _sees_every_program(user):
        return ALL_PROGRAMS
    rows = await session.scalars(
        select(_program_user.c.program_id).where(_program_user.c.user_id == user.id)
    )
    return frozenset(rows.all())


def program_visible_to(
    user: User, program_id: ColumnElement[uuid.UUID] | InstrumentedAttribute[uuid.UUID]
) -> ColumnElement[bool]:
    """WHERE clause limiting rows that carry `program_id` to what `user` may read.

    Every query over program data goes through this, lists included, so a User
    never receives a row of a program it was not assigned: docs/security/authorization.md.
    A subquery rather than a materialised id list, so it costs one round trip.
    """
    if _sees_every_program(user):
        return true()
    return program_id.in_(
        select(_program_user.c.program_id).where(_program_user.c.user_id == user.id)
    )

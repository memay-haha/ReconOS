"""Authentication and authorization primitives shared by every module.

Password policy, session identifiers, cookie attributes, CSRF checks and the
FastAPI dependencies live here, at tier 0, because a module at any tier needs
to know who is calling: docs/architecture/dependency-graph.md.

Rules this file implements: docs/security/authentication.md and
docs/security/authorization.md. It must keep 100% branch coverage.
"""

from collections.abc import Sequence

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError
from zxcvbn import zxcvbn

from app.core.errors import ValidationFailedError

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


def check_password_policy(password: str, *, user_inputs: Sequence[str] = ()) -> None:
    """Raise when the password breaks the policy. The message never echoes it."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationFailedError(
            detail="password is shorter than the minimum length",
            errors=[{"field": "password", "code": "password_too_short"}],
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValidationFailedError(
            detail="password is longer than the maximum length",
            errors=[{"field": "password", "code": "password_too_long"}],
        )
    if int(zxcvbn(password, user_inputs=list(user_inputs))["score"]) < MIN_PASSWORD_SCORE:
        raise ValidationFailedError(
            detail="password is too easy to guess",
            errors=[{"field": "password", "code": "password_too_weak"}],
        )

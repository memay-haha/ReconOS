"""Password hashing and policy: docs/security/authentication.md."""

import pytest

from app.core.errors import ValidationFailedError
from app.core.security import (
    burn_password_comparison,
    check_password_policy,
    hash_password,
    password_needs_rehash,
    verify_password,
)

STRONG = "troutmoonlit7Ladder!quay"


def test_hash_uses_argon2id_and_verifies() -> None:
    stored = hash_password(STRONG)

    assert stored.startswith("$argon2id$")
    assert verify_password(stored, STRONG) is True


def test_every_hash_of_the_same_password_differs() -> None:
    assert hash_password(STRONG) != hash_password(STRONG)


def test_verify_rejects_a_wrong_password() -> None:
    assert verify_password(hash_password(STRONG), "definitely wrong here") is False


def test_verify_rejects_a_malformed_hash() -> None:
    assert verify_password("not-a-hash", STRONG) is False


def test_a_fresh_hash_does_not_need_rehashing() -> None:
    assert password_needs_rehash(hash_password(STRONG)) is False


def test_a_malformed_hash_needs_rehashing() -> None:
    assert password_needs_rehash("not-a-hash") is True


def test_burning_a_comparison_never_raises() -> None:
    burn_password_comparison()


def test_policy_accepts_a_strong_password() -> None:
    check_password_policy(STRONG)


@pytest.mark.parametrize(
    ("password", "code"),
    [
        ("short1!aA", "password_too_short"),
        ("a" * 129, "password_too_long"),
        ("password1234", "password_too_weak"),
    ],
)
def test_policy_rejects_and_names_the_reason(password: str, code: str) -> None:
    with pytest.raises(ValidationFailedError) as caught:
        check_password_policy(password)

    assert caught.value.errors is not None
    assert caught.value.errors[0] == {"field": "password", "code": code}


def test_policy_rejects_a_password_built_from_the_username() -> None:
    with pytest.raises(ValidationFailedError):
        check_password_policy("trungnguyen2026", user_inputs=["trungnguyen"])


def test_policy_message_never_echoes_the_password() -> None:
    with pytest.raises(ValidationFailedError) as caught:
        check_password_policy("password1234")

    assert "password1234" not in str(caught.value.detail)

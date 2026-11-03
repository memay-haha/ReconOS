from collections.abc import Callable

from app.core.config import Settings
from app.core.security import (
    HOST_COOKIE_NAME,
    PLAIN_COOKIE_NAME,
    hash_session_id,
    new_session_id,
    session_cookie,
    session_id_matches,
)


def test_session_id_is_random_and_long_enough() -> None:
    first, second = new_session_id(), new_session_id()
    assert first != second
    # token_urlsafe(32) encodes 256 bits, well above the 128 bit floor.
    assert len(first) >= 43


def test_hash_is_stable_and_hides_the_identifier() -> None:
    session_id = new_session_id()
    digest = hash_session_id(session_id)
    assert digest == hash_session_id(session_id)
    assert session_id not in digest
    assert len(digest) == 64


def test_matches_only_the_right_identifier() -> None:
    session_id = new_session_id()
    assert session_id_matches(hash_session_id(session_id), session_id) is True
    assert session_id_matches(hash_session_id(session_id), new_session_id()) is False


def test_https_origin_uses_host_prefix(settings_factory: Callable[..., Settings]) -> None:
    cookie = session_cookie(settings_factory(public_origin="https://reconos.example.com"))
    assert cookie.name == HOST_COOKIE_NAME
    assert cookie.secure is True
    assert cookie.httponly is True
    assert cookie.samesite == "lax"
    assert cookie.path == "/"


def test_http_origin_drops_prefix_and_secure(settings_factory: Callable[..., Settings]) -> None:
    cookie = session_cookie(settings_factory(public_origin="http://localhost:3000"))
    assert cookie.name == PLAIN_COOKIE_NAME
    assert cookie.secure is False

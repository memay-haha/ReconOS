from collections.abc import Callable

import pytest
from starlette.requests import Request

from app.core.config import Settings
from app.core.errors import ForbiddenError
from app.core.security import HOST_COOKIE_NAME, enforce_csrf

ORIGIN = "https://reconos.example.com"


def build_request(method: str, headers: dict[str, str], cookie: bool = False) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    if cookie:
        raw.append((b"cookie", f"{HOST_COOKIE_NAME}=value".encode()))
    scope = {"type": "http", "method": method, "headers": raw, "path": "/"}
    return Request(scope)


def test_get_is_never_blocked(settings_factory: Callable[..., Settings]) -> None:
    enforce_csrf(build_request("GET", {}), settings_factory(public_origin=ORIGIN))


def test_same_origin_post_passes(settings_factory: Callable[..., Settings]) -> None:
    request = build_request("POST", {"origin": ORIGIN, "sec-fetch-site": "same-origin"})
    enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_other_origin_is_rejected(settings_factory: Callable[..., Settings]) -> None:
    request = build_request("POST", {"origin": "https://evil.example"})
    with pytest.raises(ForbiddenError):
        enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_cross_site_fetch_is_rejected(settings_factory: Callable[..., Settings]) -> None:
    request = build_request("POST", {"origin": ORIGIN, "sec-fetch-site": "cross-site"})
    with pytest.raises(ForbiddenError):
        enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_both_headers_missing_with_session_cookie_is_rejected(
    settings_factory: Callable[..., Settings],
) -> None:
    request = build_request("POST", {}, cookie=True)
    with pytest.raises(ForbiddenError):
        enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_both_headers_missing_without_cookie_passes(
    settings_factory: Callable[..., Settings],
) -> None:
    enforce_csrf(build_request("POST", {}), settings_factory(public_origin=ORIGIN))


def test_a_trailing_slash_in_the_variable_blocks_nothing(
    settings_factory: Callable[..., Settings],
) -> None:
    # The variable is reduced to scheme and host at load: app/core/config.py.
    request = build_request("POST", {"origin": ORIGIN, "sec-fetch-site": "same-origin"})
    enforce_csrf(request, settings_factory(public_origin=f"{ORIGIN}/"))

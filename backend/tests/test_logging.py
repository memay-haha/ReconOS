"""Log masking and record shape: .claude/rules/logging.md."""

import pytest

from app.core.logging import MASKED_SUBSTRINGS, mask_credentials, mask_proxy_url

# .claude/rules/logging.md lists these substrings; a field whose name contains
# one of them must never reach stdout or the log database.
FIELD_NAMES = [
    "password",
    "token",
    "secret",
    "api_key",
    "authorization",
    "cookie",
    "session",
    "_encrypted",
]


def test_rule_list_matches_the_document() -> None:
    assert sorted(MASKED_SUBSTRINGS) == sorted(FIELD_NAMES)


@pytest.mark.parametrize("name", FIELD_NAMES)
def test_masks_every_listed_substring(name: str) -> None:
    event = mask_credentials(None, "info", {"event": "x", name: "super-sensitive"})

    assert event[name] == "***"


@pytest.mark.parametrize("name", FIELD_NAMES)
def test_masks_when_the_substring_is_part_of_a_longer_name(name: str) -> None:
    field = f"worker_{name}_value"
    event = mask_credentials(None, "info", {"event": "x", field: "super-sensitive"})

    assert event[field] == "***"


def test_masking_is_case_insensitive() -> None:
    event = mask_credentials(None, "info", {"event": "x", "Authorization": "Bearer abc"})

    assert event["Authorization"] == "***"


def test_keeps_ordinary_fields() -> None:
    event = mask_credentials(None, "info", {"event": "job_claimed", "job_id": "123"})

    assert event == {"event": "job_claimed", "job_id": "123"}


def test_masks_nested_fields() -> None:
    event = mask_credentials(None, "info", {"event": "x", "ctx": {"api_key": "abc"}})

    assert event["ctx"] == {"api_key": "***"}


def test_proxy_url_keeps_only_the_host() -> None:
    assert mask_proxy_url("http://user:pass@proxy.example.com:8080/path") == "proxy.example.com"
    assert mask_proxy_url("socks5://proxy.example.com") == "proxy.example.com"


def test_proxy_url_masks_a_value_it_cannot_parse() -> None:
    assert mask_proxy_url("not a url") == "***"

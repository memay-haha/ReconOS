import base64
import json
import uuid
from datetime import UTC, datetime

import pytest

from app.core.errors import BadRequestError
from app.core.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    decode_cursor,
    decode_time_cursor,
    encode_cursor,
)


def test_round_trip() -> None:
    row_id = uuid.uuid4()
    value, decoded_id = decode_cursor(encode_cursor("2026-11-03T08:00:00+00:00", row_id))
    assert value == "2026-11-03T08:00:00+00:00"
    assert decoded_id == row_id


def test_cursor_hides_its_content() -> None:
    cursor = encode_cursor("secret-sort-value", uuid.uuid4())
    assert "secret-sort-value" not in cursor


@pytest.mark.parametrize("cursor", ["not-base64!", "", "YWJj"])
def test_broken_cursor_is_a_bad_request(cursor: str) -> None:
    with pytest.raises(BadRequestError):
        decode_cursor(cursor)


def test_limits_match_the_api_document() -> None:
    assert DEFAULT_LIMIT == 50
    assert MAX_LIMIT == 200


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii")


@pytest.mark.parametrize(
    "payload",
    [
        '["v", "id"]',  # JSON array: payload["v"] raises TypeError
        '"just a string"',  # JSON string: string indices must be integers
        "42",  # JSON number: not subscriptable
        "null",  # JSON null: not subscriptable
        '{"v": 1}',  # object missing the id key
        '{"id": "' + str(uuid.uuid4()) + '"}',  # object missing the sort value
        '{"v": 1, "id": 7}',  # id is not a string: uuid.UUID raises AttributeError
        '{"v": 1, "id": null}',  # id is null
        '{"v": 1, "id": ["x"]}',  # id is a list
        '{"v": 1, "id": "not-a-uuid"}',  # id is a string but not a UUID
        "[" * 100_000,  # deeply nested JSON: json.loads raises RecursionError
    ],
)
def test_malformed_payload_is_a_bad_request(payload: str) -> None:
    with pytest.raises(BadRequestError):
        decode_cursor(_b64(payload))


def test_non_ascii_cursor_is_a_bad_request() -> None:
    with pytest.raises(BadRequestError):
        decode_cursor("cursor-với-dấu")


def test_invalid_utf8_payload_is_a_bad_request() -> None:
    cursor = base64.urlsafe_b64encode(b'{"v": "\xff\xfe", "id": "x"}').decode("ascii")
    with pytest.raises(BadRequestError):
        decode_cursor(cursor)


def test_oversized_cursor_is_handled_without_crashing() -> None:
    cursor = _b64('{"v": "' + "a" * 1_000_000 + '", "id": "' + str(uuid.uuid4()) + '"}')
    value, _ = decode_cursor(cursor)
    assert isinstance(value, str)


def encode_cursor_raw(sort_value: object, row_id: uuid.UUID) -> str:
    """Build a cursor from any value, which encode_cursor's narrow type forbids."""
    return _b64(json.dumps({"v": sort_value, "id": str(row_id)}))


@pytest.mark.parametrize("sort_value", ["not-a-timestamp", 7, None, {"a": 1}])
def test_time_cursor_rejects_a_sort_value_that_is_not_a_timestamp(sort_value: object) -> None:
    with pytest.raises(BadRequestError):
        decode_time_cursor(encode_cursor_raw(sort_value, uuid.uuid4()))


def test_time_cursor_round_trips() -> None:
    moment = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)
    row_id = uuid.uuid4()
    assert decode_time_cursor(encode_cursor(moment.isoformat(), row_id)) == (moment, row_id)

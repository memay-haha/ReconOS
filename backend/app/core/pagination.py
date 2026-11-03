"""Keyset pagination shared by every list endpoint: docs/api/architecture.md.

The cursor carries the sort value and the id of the last row. Clients treat it
as opaque, so the encoding may change without an API version bump.
"""

import base64
import binascii
import json
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.core.errors import BadRequestError

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class Page[ItemT](BaseModel):
    items: list[ItemT]
    next_cursor: str | None = None
    total: int
    total_is_estimate: bool = False


def encode_cursor(sort_value: str | int | float, row_id: uuid.UUID) -> str:
    payload = json.dumps({"v": sort_value, "id": str(row_id)}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str) -> tuple[Any, uuid.UUID]:
    # Every failure below must surface as a 400. A hostile client controls the
    # whole string, so RecursionError (deeply nested JSON) counts too, and the
    # shape check runs before indexing because a JSON array or string would
    # otherwise raise TypeError instead.
    try:
        payload = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")))
    except (
        binascii.Error,
        UnicodeDecodeError,
        json.JSONDecodeError,
        ValueError,
        RecursionError,
    ) as err:
        raise BadRequestError(detail="cursor is not valid") from err
    if (
        not isinstance(payload, dict)
        or "v" not in payload
        or not isinstance(payload.get("id"), str)
    ):
        raise BadRequestError(detail="cursor is not valid")
    try:
        row_id = uuid.UUID(payload["id"])
    except ValueError as err:
        raise BadRequestError(detail="cursor is not valid") from err
    return payload["v"], row_id


def decode_time_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    """Decode a cursor whose sort value is an ISO 8601 timestamp.

    decode_cursor guarantees the shape only, so a hostile sort value has to
    become a 400 here rather than a database error later.
    """
    sort_value, row_id = decode_cursor(cursor)
    if not isinstance(sort_value, str):
        raise BadRequestError(detail="cursor is not valid")
    try:
        return datetime.fromisoformat(sort_value), row_id
    except ValueError as err:
        raise BadRequestError(detail="cursor is not valid") from err

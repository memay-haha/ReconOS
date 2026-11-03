"""Realtime events over Redis pub/sub.

Any core process publishes a state change; the Backend API subscribes and pushes
what each account may see over WebSocket: docs/architecture/system.md.
"""

import json
from collections.abc import AsyncIterator
from typing import Any

import redis.asyncio as redis

from app.core.config import Settings, get_settings

EVENT_CHANNEL = "reconos:events"


def build_client(settings: Settings | None = None) -> redis.Redis:
    settings = settings or get_settings()
    password = settings.redis_password.get_secret_value() if settings.redis_password else None
    return redis.from_url(settings.redis_url, password=password, decode_responses=True)


async def publish_event(event: dict[str, Any], settings: Settings | None = None) -> None:
    """Publish one state change. Payload carries no credential (G7)."""
    client = build_client(settings)
    try:
        await client.publish(EVENT_CHANNEL, json.dumps(event))
    finally:
        await client.aclose()


async def subscribe_events(
    settings: Settings | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Yield events until the caller stops iterating."""
    client = build_client(settings)
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(EVENT_CHANNEL)
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            parsed: dict[str, Any] = json.loads(message["data"])
            yield parsed
    finally:
        # redis-py leaves PubSub.aclose unannotated.
        await pubsub.aclose()  # type: ignore[no-untyped-call]
        await client.aclose()

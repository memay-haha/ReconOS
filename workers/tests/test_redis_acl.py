"""Redis ACL of the `worker` account: only job queues, never `parse`, `schedule`.

Applies the rules of infras/redis/acl.conf to a throwaway account on the
development Redis (make init), so the test checks the committed file. Tech debt 15.
"""

import os
import secrets
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlsplit

import pytest
import redis
from kombu import connection, entity
from kombu.exceptions import OperationalError

from contracts.tasks import PARSE_QUEUE, RUN_JOB_TASK, SCHEDULE_QUEUE
from worker.celery_app import TRANSPORT_OPTIONS

ACL_FILE = Path(__file__).resolve().parents[2] / "infras" / "redis" / "acl.conf"
REDIS_URL = os.environ.get("RECONOS_REDIS_URL", "redis://127.0.0.1:6379/0")
QUEUE = "job.acl-test"
# kombu ships py.typed but leaves most functions unannotated.
Connection: Any = connection.Connection
Exchange: Any = entity.Exchange
Queue: Any = entity.Queue


def _worker_rules() -> list[str]:
    lines = [line for line in ACL_FILE.read_text().splitlines() if line.startswith("worker ")]
    assert len(lines) == 1
    return lines[0].split()[1:]


@pytest.fixture
def admin() -> Iterator[redis.Redis]:
    password = os.environ.get("RECONOS_REDIS_PASSWORD") or None
    client = redis.Redis.from_url(REDIS_URL, password=password, socket_timeout=5)
    yield client
    client.delete(
        QUEUE,
        f"_kombu.binding.{QUEUE}",
        f"_kombu.binding_permanent.{QUEUE}",
        *(key for name, key in TRANSPORT_OPTIONS.items() if name.endswith("_key")),
    )
    client.close()


@pytest.fixture
def worker_url(admin: redis.Redis) -> Iterator[str]:
    user = f"acl-test-{secrets.token_hex(4)}"
    password = secrets.token_hex(16)
    cast(Any, admin).execute_command("ACL", "SETUSER", user, "on", f">{password}", *_worker_rules())
    parts = urlsplit(REDIS_URL)
    yield parts._replace(netloc=f"{user}:{password}@{parts.hostname}:{parts.port or 6379}").geturl()
    cast(Any, admin).execute_command("ACL", "DELUSER", user)


def _publish(admin: redis.Redis, body: dict[str, Any]) -> Any:  # noqa: ANN401  kombu Queue
    queue = Queue(QUEUE, Exchange(QUEUE, type="direct"), routing_key=QUEUE)
    pool = admin.connection_pool.connection_kwargs
    url = REDIS_URL
    if pool.get("password"):
        parts = urlsplit(REDIS_URL)
        url = parts._replace(netloc=f":{pool['password']}@{parts.netloc}").geturl()
    with Connection(url) as conn:
        conn.Producer().publish(body, exchange=queue.exchange, routing_key=QUEUE, declare=[queue])
    return queue


@pytest.mark.parametrize("key", [PARSE_QUEUE, SCHEDULE_QUEUE])
def test_worker_cannot_push_to_core_queues(worker_url: str, key: str) -> None:
    client = redis.Redis.from_url(worker_url, socket_timeout=5)

    with pytest.raises(redis.exceptions.NoPermissionError):
        client.lpush(key, "{}")
    with pytest.raises(redis.exceptions.NoPermissionError):
        client.sadd(f"_kombu.binding.{key}", "x")


def test_worker_cannot_touch_core_unacked_messages(worker_url: str) -> None:
    client = redis.Redis.from_url(worker_url, socket_timeout=5)

    with pytest.raises(redis.exceptions.NoPermissionError):
        client.hset("unacked", "tag", "{}")


def test_worker_celery_app_cannot_send_to_parse(worker_url: str) -> None:
    from celery import Celery

    app = Celery("acl-test", broker=worker_url)
    app.conf.broker_transport_options = TRANSPORT_OPTIONS
    app.conf.broker_connection_retry = False

    # kombu wraps the Redis NOPERM error in OperationalError.
    with pytest.raises(OperationalError, match="No permissions"):
        app.send_task(RUN_JOB_TASK, kwargs={"job_id": "x"}, queue=PARSE_QUEUE, retry=False)


def test_worker_consumes_acks_and_restores_job_queue(admin: redis.Redis, worker_url: str) -> None:
    queue = _publish(admin, {"n": 1})
    _publish(admin, {"n": 2})
    received: list[Any] = []

    def on_message(body: Any, message: Any) -> None:  # noqa: ANN401  kombu types
        received.append(body)
        message.ack()

    with (
        Connection(worker_url, transport_options=TRANSPORT_OPTIONS) as conn,
        conn.Consumer(queue, callbacks=[on_message]),
    ):
        conn.drain_events(timeout=5)
    # A message left unacked goes back to its queue under the worker keys.
    with Connection(worker_url, transport_options=TRANSPORT_OPTIONS) as conn:
        channel = conn.channel()
        message = queue(channel).get()
        assert message is not None
        channel.qos.restore_unacked_once()
        channel.close()

    assert received == [{"n": 1}]
    assert admin.llen(QUEUE) == 1

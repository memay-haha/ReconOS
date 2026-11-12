"""Celery app of the worker: listens only to the job queues of its tool modules.

Task contract: docs/integrations/external-services.md. Redis account and key
limits: infras/redis/. Run: celery -A worker.celery_app worker
"""

import ssl
from pathlib import Path
from typing import Any, Final
from urllib.parse import quote, urlsplit, urlunsplit

import structlog
from celery import Celery
from celery.signals import worker_ready, worker_shutdown

from contracts.tasks import JOB_QUEUE_PREFIX
from contracts.worker import ToolVersion
from worker.client import BackendClient
from worker.config import WorkerSettings, get_settings
from worker.heartbeat import HeartbeatLoop, installed_tools
from worker.logging import LogShipper, configure_logging

# The worker keeps its own unacked bookkeeping. The core restores messages
# from `unacked`; a shared key would let a worker queue a task into `parse`.
TRANSPORT_OPTIONS: Final[dict[str, Any]] = {
    "unacked_key": "job.unacked",
    "unacked_index_key": "job.unacked_index",
    "unacked_mutex_key": "job.unacked_mutex",
    # Longer than any job time limit, so a running job is not handed out again.
    "visibility_timeout": 24 * 3600,
}

log = structlog.get_logger(__name__)


def broker_url(settings: WorkerSettings) -> str:
    """Add the password to the Redis URL, which holds only the account name."""
    if settings.redis_password is None:
        return settings.redis_url
    parts = urlsplit(settings.redis_url)
    user = quote(parts.username or "", safe="")
    password = quote(settings.redis_password.get_secret_value(), safe="")
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit(parts._replace(netloc=f"{user}:{password}@{host}"))


def build_config(settings: WorkerSettings) -> dict[str, Any]:
    names = [f"{JOB_QUEUE_PREFIX}{name}" for name in settings.worker_tool_modules]
    # Direct exchange named like the queue, as the dispatcher publishes.
    queues = {name: {"exchange": name, "routing_key": name} for name in names}
    config: dict[str, Any] = {
        "broker_url": broker_url(settings),
        "broker_transport_options": TRANSPORT_OPTIONS,
        "broker_connection_retry_on_startup": True,
        "task_queues": queues,
        "task_default_queue": names[0],
        "task_acks_late": True,
        "task_reject_on_worker_lost": False,
        "task_ignore_result": True,
        "task_serializer": "json",
        "accept_content": ["json"],
        "result_backend": None,
        "worker_prefetch_multiplier": 1,
        "worker_concurrency": settings.worker_concurrency,
        # Jobs wait on subprocesses and HTTP: threads are enough and keep one
        # heartbeat and one log shipper per worker.
        "worker_pool": "threads",
        # Remote control, events and gossip need Redis keys outside the job queues.
        "worker_enable_remote_control": False,
        "worker_send_task_events": False,
        "worker_hijack_root_logger": False,
        # Records are JSON lines already; Celery must not wrap them as warnings.
        "worker_redirect_stdouts": False,
    }
    if urlsplit(settings.redis_url).scheme == "rediss":
        config["broker_use_ssl"] = {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    return config


class Runtime:
    """Objects built once per worker process when Celery is ready."""

    def __init__(self) -> None:
        self.tools: list[ToolVersion] = []
        self._client: BackendClient | None = None
        self._settings: WorkerSettings | None = None
        self._threads: list[LogShipper | HeartbeatLoop] = []

    def client(self) -> BackendClient:
        if self._client is None:
            settings = self.settings()
            self._client = BackendClient(settings.api_url, settings.worker_token)
        return self._client

    def settings(self) -> WorkerSettings:
        if self._settings is None:
            self._settings = get_settings()
        return self._settings

    def workdir(self) -> Path:
        return self.settings().worker_workdir

    def start(self) -> None:
        settings = self.settings()
        configure_logging(settings.log_level)
        client = self.client()
        self.tools = installed_tools(settings.worker_tool_modules)
        shipper = LogShipper(
            client.send_logs, final_send=lambda batch: client.send_logs(batch, retry=False)
        )
        heartbeat = HeartbeatLoop(
            client.worker_heartbeat,
            settings.worker_tool_modules,
            self.tools,
            settings.worker_heartbeat_seconds,
        )
        self._threads = [shipper, heartbeat]
        for thread in self._threads:
            thread.start()
        log.info("worker_started", tool_modules=settings.worker_tool_modules)

    def stop(self) -> None:
        log.info("worker_stopping")
        for thread in reversed(self._threads):
            thread.stop()
        if self._client is not None:
            self._client.close()


runtime = Runtime()

app = Celery("reconos-worker", include=["worker.tasks"])
# Lazy: importing the module must not need the environment, only starting does.
app.add_defaults(lambda: build_config(runtime.settings()))


def _on_worker_ready(**_: object) -> None:
    runtime.start()


def _on_worker_shutdown(**_: object) -> None:
    runtime.stop()


# Plain calls instead of decorators: Celery ships no type hints.
worker_ready.connect(_on_worker_ready, weak=False)
worker_shutdown.connect(_on_worker_shutdown, weak=False)

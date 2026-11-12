"""Client of the worker contract: endpoints, auth header, retries, timeouts."""

import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from contracts.job_status import FinishStatus, JobFinish, JobHeartbeatAction
from contracts.worker import ToolVersion, WorkerHeartbeat
from worker.client import MAX_RETRIES, TIMEOUT, BackendClient, BackendError, JobConflictError

TOKEN = "worker-token-value"
JOB_ID = uuid4()


def _client(handler: httpx.MockTransport, sleeps: list[float]) -> BackendClient:
    return BackendClient(
        "https://api.example.net/",
        SecretStr(TOKEN),
        transport=handler,
        sleep=sleeps.append,
    )


def _spec_body() -> dict[str, object]:
    return {
        "job_id": str(JOB_ID),
        "tool_module": "nuclei",
        "target": ["app.example.com"],
        "params": {},
        "timeout_minutes": 60,
        "heartbeat_seconds": 30,
        "proxy_url": None,
        "engine": None,
    }


def test_every_call_hits_the_contract_endpoint_with_the_bearer_token(tmp_path: Path) -> None:
    seen: list[tuple[str, str, str | None]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, request.headers.get("Authorization")))
        if request.url.path.endswith("/claim"):
            return httpx.Response(200, json=_spec_body())
        if request.url.path.endswith(f"{JOB_ID}/heartbeat"):
            return httpx.Response(200, json={"action": "continue"})
        if request.method == "PUT":
            return httpx.Response(201)
        return httpx.Response(204)

    client = _client(httpx.MockTransport(handle), [])
    output = tmp_path / "nuclei.jsonl"
    output.write_text("{}\n")

    client.worker_heartbeat(WorkerHeartbeat(tool_modules=["nuclei"], tools=[]))
    assert client.claim(JOB_ID).tool_module == "nuclei"
    assert client.job_heartbeat(JOB_ID).action is JobHeartbeatAction.CONTINUE
    client.upload_raw_output(JOB_ID, output)
    client.finish(JOB_ID, JobFinish(status=FinishStatus.COMPLETED))

    base = "/api/v1/worker"
    assert [(method, path) for method, path, _ in seen] == [
        ("POST", f"{base}/heartbeat"),
        ("POST", f"{base}/jobs/{JOB_ID}/claim"),
        ("POST", f"{base}/jobs/{JOB_ID}/heartbeat"),
        ("PUT", f"{base}/jobs/{JOB_ID}/raw-outputs/nuclei.jsonl"),
        ("POST", f"{base}/jobs/{JOB_ID}/finish"),
    ]
    assert {auth for _, _, auth in seen} == {f"Bearer {TOKEN}"}


def test_heartbeat_body_carries_tools_and_cpu() -> None:
    bodies: list[object] = []

    def handle(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(204)

    client = _client(httpx.MockTransport(handle), [])
    client.worker_heartbeat(
        WorkerHeartbeat(
            tool_modules=["nuclei"],
            tools=[ToolVersion(name="nuclei", version="3.11.1")],
            cpu_percent=40.0,
        )
    )

    assert bodies == [
        {
            "tool_modules": ["nuclei"],
            "tools": [{"name": "nuclei", "version": "3.11.1"}],
            "cpu_percent": 40.0,
        }
    ]


def test_upload_streams_the_file_with_its_content_type(tmp_path: Path) -> None:
    received: list[tuple[bytes, str | None]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        received.append((request.read(), request.headers.get("Content-Type")))
        return httpx.Response(200)

    path = tmp_path / "nuclei.jsonl"
    path.write_bytes(b'{"a":1}\n' * 1000)
    _client(httpx.MockTransport(handle), []).upload_raw_output(JOB_ID, path)

    assert received == [(path.read_bytes(), "application/x-ndjson")]


def test_upload_rejects_a_name_outside_the_contract(tmp_path: Path) -> None:
    path = tmp_path / "bad name.txt"
    path.write_text("x")

    with pytest.raises(ValidationError):
        _client(httpx.MockTransport(lambda _: httpx.Response(201)), []).upload_raw_output(
            JOB_ID, path
        )


def test_5xx_is_retried_with_exponential_backoff_then_succeeds() -> None:
    statuses = iter([503, 502, 204])
    sleeps: list[float] = []

    client = _client(httpx.MockTransport(lambda _: httpx.Response(next(statuses))), sleeps)
    client.finish(JOB_ID, JobFinish(status=FinishStatus.COMPLETED))

    assert sleeps == [1.0, 2.0]


def test_upload_resends_the_whole_file_on_retry(tmp_path: Path) -> None:
    bodies: list[bytes] = []

    def handle(request: httpx.Request) -> httpx.Response:
        bodies.append(request.read())
        return httpx.Response(500 if len(bodies) == 1 else 201)

    path = tmp_path / "stdout.txt"
    path.write_bytes(b"line\n")
    _client(httpx.MockTransport(handle), []).upload_raw_output(JOB_ID, path)

    assert bodies == [b"line\n", b"line\n"]


def test_network_errors_stop_after_max_retries() -> None:
    calls: list[int] = []
    sleeps: list[float] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(BackendError):
        _client(httpx.MockTransport(handle), sleeps).job_heartbeat(JOB_ID)

    assert len(calls) == MAX_RETRIES + 1
    assert sleeps == [1.0, 2.0, 4.0, 8.0, 16.0]


def test_5xx_stops_after_max_retries() -> None:
    sleeps: list[float] = []

    with pytest.raises(BackendError) as error:
        _client(httpx.MockTransport(lambda _: httpx.Response(500)), sleeps).claim(JOB_ID)

    assert error.value.status_code == 500
    assert len(sleeps) == MAX_RETRIES


@pytest.mark.parametrize("status", [400, 401, 403, 404, 422])
def test_4xx_is_not_retried(status: int) -> None:
    sleeps: list[float] = []

    with pytest.raises(BackendError) as error:
        _client(httpx.MockTransport(lambda _: httpx.Response(status)), sleeps).claim(JOB_ID)

    assert error.value.status_code == status
    assert sleeps == []


def test_409_raises_conflict_without_retry() -> None:
    sleeps: list[float] = []

    with pytest.raises(JobConflictError):
        _client(httpx.MockTransport(lambda _: httpx.Response(409)), sleeps).claim(JOB_ID)

    assert sleeps == []


def test_429_waits_for_retry_after() -> None:
    responses = iter([httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(204)])
    sleeps: list[float] = []

    _client(httpx.MockTransport(lambda _: next(responses)), sleeps).worker_heartbeat(
        WorkerHeartbeat(tool_modules=[], tools=[])
    )

    assert sleeps == [7.0]


def test_429_without_retry_after_uses_backoff() -> None:
    responses = iter([httpx.Response(429, headers={"Retry-After": "soon"}), httpx.Response(204)])
    sleeps: list[float] = []

    _client(httpx.MockTransport(lambda _: next(responses)), sleeps).worker_heartbeat(
        WorkerHeartbeat(tool_modules=[], tools=[])
    )

    assert sleeps == [1.0]


def test_last_log_flush_tries_once() -> None:
    from datetime import UTC, datetime

    from contracts.worker import WorkerLogBatch, WorkerLogRecord

    sleeps: list[float] = []
    batch = WorkerLogBatch(
        records=[WorkerLogRecord(logged_at=datetime.now(UTC), level="info", event="x")]
    )

    with pytest.raises(BackendError):
        _client(httpx.MockTransport(lambda _: httpx.Response(503)), sleeps).send_logs(
            batch, retry=False
        )

    assert sleeps == []


def test_every_call_has_a_timeout() -> None:
    assert TIMEOUT.connect and TIMEOUT.read and TIMEOUT.write and TIMEOUT.pool


def test_token_never_reaches_the_log(capsys: pytest.CaptureFixture[str]) -> None:
    from worker.logging import configure_logging

    configure_logging("debug")
    statuses = iter([503, 204])
    _client(httpx.MockTransport(lambda _: httpx.Response(next(statuses))), []).finish(
        JOB_ID, JobFinish(status=FinishStatus.FAILED, status_reason="tool exited with code 1")
    )

    out = capsys.readouterr().out
    assert "backend_call_retry" in out
    assert TOKEN not in out

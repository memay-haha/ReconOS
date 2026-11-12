"""Worker heartbeat and log batch: docs/api/openapi.yaml WorkerHeartbeat."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from contracts.worker import LOG_BATCH_MAX_RECORDS, WorkerHeartbeat, WorkerLogBatch


def _record(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "logged_at": datetime.now(UTC).isoformat(),
        "level": "info",
        "event": "job_claimed",
    }
    data.update(overrides)
    return data


def test_heartbeat_reports_tools_and_cpu() -> None:
    beat = WorkerHeartbeat.model_validate(
        {
            "tool_modules": ["nuclei"],
            "tools": [{"name": "nuclei", "version": "3.11.1"}, {"name": "x", "version": None}],
            "cpu_percent": 12.5,
        }
    )

    assert beat.tools[1].version is None


@pytest.mark.parametrize("cpu", [-1, 100.1])
def test_heartbeat_rejects_cpu_out_of_range(cpu: float) -> None:
    with pytest.raises(ValidationError):
        WorkerHeartbeat.model_validate({"tool_modules": [], "tools": [], "cpu_percent": cpu})


def test_tool_version_is_required_even_when_null() -> None:
    with pytest.raises(ValidationError):
        WorkerHeartbeat.model_validate({"tool_modules": [], "tools": [{"name": "nuclei"}]})


def test_log_batch_accepts_records() -> None:
    batch = WorkerLogBatch.model_validate({"records": [_record(context={"tool_module": "nuclei"})]})

    assert batch.records[0].event == "job_claimed"


@pytest.mark.parametrize(
    "records",
    [
        [],
        [_record(level="debug")],
        [_record(event="Job Claimed")],
        [_record()] * (LOG_BATCH_MAX_RECORDS + 1),
    ],
)
def test_log_batch_rejects_bad_records(records: list[dict[str, object]]) -> None:
    with pytest.raises(ValidationError):
        WorkerLogBatch.model_validate({"records": records})

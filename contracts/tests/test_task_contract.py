"""Task and job spec models reject malformed data: .claude/rules/testing.md."""

import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from contracts.tasks import JOB_QUEUE_PREFIX, RUN_JOB_TASK, EngineSpec, JobSpec, RunJobTask


def _spec(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "nuclei",
        "target": ["app.example.com"],
        "params": {"rate": 10},
        "timeout_minutes": 60,
        "heartbeat_seconds": 30,
    }
    data.update(overrides)
    return data


def test_task_name_and_queue_prefix_match_the_contract() -> None:
    assert RUN_JOB_TASK == "worker.run_job"
    assert f"{JOB_QUEUE_PREFIX}nuclei" == "job.nuclei"


def test_run_job_task_carries_only_the_job_id() -> None:
    job_id = uuid4()

    assert RunJobTask.model_validate({"job_id": str(job_id)}).job_id == job_id
    with pytest.raises(ValidationError):
        RunJobTask.model_validate({"job_id": str(job_id), "target": ["app.example.com"]})


@pytest.mark.parametrize(
    "overrides",
    [
        {"target": []},
        {"target": [""]},
        {"timeout_minutes": 0},
        {"heartbeat_seconds": 0},
        {"tool_module": ""},
        {"command": "nuclei -u x"},
    ],
)
def test_job_spec_rejects_bad_fields(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        JobSpec.model_validate(_spec(**overrides))


def test_secrets_are_masked_in_repr_but_sent_in_json() -> None:
    spec = JobSpec.model_validate(
        _spec(
            proxy_url="http://user:pass@proxy.example.net:8080",
            engine={
                "name": "osmedeus",
                "base_url": "https://engine.example.net",
                "api_key": "engine-key",
                "variables": {"GITHUB_TOKEN": "variable-value"},
            },
        )
    )

    assert "pass@" not in repr(spec)
    assert "engine-key" not in repr(spec)
    assert "variable-value" not in repr(spec)
    wire = json.loads(spec.model_dump_json())
    assert wire["proxy_url"] == "http://user:pass@proxy.example.net:8080"
    assert wire["engine"]["api_key"] == "engine-key"
    assert wire["engine"]["variables"] == {"GITHUB_TOKEN": "variable-value"}
    assert JobSpec.model_validate(wire) == spec


def test_job_spec_without_proxy_or_engine_round_trips() -> None:
    spec = JobSpec.model_validate(_spec())

    wire = json.loads(spec.model_dump_json())

    assert wire["proxy_url"] is None
    assert wire["engine"] is None
    assert JobSpec.model_validate(wire) == spec


def test_engine_spec_requires_api_key() -> None:
    with pytest.raises(ValidationError):
        EngineSpec.model_validate({"name": "vigolium", "base_url": "https://engine.example.net"})

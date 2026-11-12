"""Celery task and job spec shared by the dispatcher and the worker.

Contract: docs/integrations/external-services.md. Redis carries only the job ID;
the worker fetches targets, parameters and credentials by claiming the job over
HTTPS, so nothing sensitive sits in the queue (G5, G7).
"""

from typing import Annotated, Any, Final
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_serializer

RUN_JOB_TASK: Final = "worker.run_job"
# Queue of a job = JOB_QUEUE_PREFIX + tool_module.name, for example `job.nuclei`.
JOB_QUEUE_PREFIX: Final = "job."
# Background queues of the core. The Redis ACL denies workers any write to them.
PARSE_QUEUE: Final = "parse"
SCHEDULE_QUEUE: Final = "schedule"


class RunJobTask(BaseModel):
    """Arguments of `worker.run_job`. The job ID is the only field allowed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    job_id: UUID


class EngineSpec(BaseModel):
    """Engine connection handed to a runner that drives an engine workflow."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: Annotated[str, Field(min_length=1, max_length=100)]
    base_url: Annotated[str, Field(min_length=1, max_length=2048)]
    api_key: SecretStr
    variables: dict[str, SecretStr] = Field(default_factory=dict)
    # `engine.settings` without credentials; the runner maps it to run options.
    settings: dict[str, Any] = Field(default_factory=dict)

    # SecretStr hides the value in repr and logs; JSON on the wire must carry it.
    @field_serializer("api_key", when_used="json")
    def _reveal_api_key(self, value: SecretStr) -> str:
        return value.get_secret_value()

    @field_serializer("variables", when_used="json")
    def _reveal_variables(self, value: dict[str, SecretStr]) -> dict[str, str]:
        return {name: secret.get_secret_value() for name, secret in value.items()}


class JobSpec(BaseModel):
    """Body of a successful claim: everything the runner may use for this job.

    `params` was checked against the tool module schema when the job was
    created; the runner checks it again before building the command.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    tool_module: Annotated[str, Field(min_length=1, max_length=100)]
    target: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=2048)]], Field(min_length=1)
    ]
    params: dict[str, Any] = Field(default_factory=dict)
    timeout_minutes: Annotated[int, Field(gt=0)]
    # job_heartbeat_seconds from system_setting: the worker cannot read the database.
    heartbeat_seconds: Annotated[int, Field(gt=0)]
    proxy_url: SecretStr | None = None
    engine: EngineSpec | None = None

    @field_serializer("proxy_url", when_used="json")
    def _reveal_proxy_url(self, value: SecretStr | None) -> str | None:
        return None if value is None else value.get_secret_value()

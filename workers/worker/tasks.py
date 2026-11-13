"""Task `worker.run_job`: claim, run, upload raw output, finish.

Flow and failure handling: docs/integrations/external-services.md,
.claude/rules/error-handling.md. The worker never retries a failed job.
"""

import shutil
from pathlib import Path
from uuid import UUID

import structlog
from pydantic import ValidationError

from contracts.job_status import FinishStatus, JobFinish
from contracts.tasks import RUN_JOB_TASK, JobSpec, RunJobTask
from contracts.tool_modules import is_wildcard_target
from contracts.worker import ToolVersion
from worker.celery_app import app, runtime
from worker.client import BackendClient, BackendError, JobConflictError
from worker.runners import RUNNERS, RunResult

log = structlog.get_logger(__name__)


def _tool_version(job: JobSpec, tools: list[ToolVersion]) -> str | None:
    runner_cls = RUNNERS.get(job.tool_module)
    if runner_cls is None:
        return None
    versions = {tool.name: tool.version for tool in tools}
    return versions.get(runner_cls.spec().tools[0])


def _run(job: JobSpec, client: BackendClient, workdir: Path) -> RunResult:
    runner_cls = RUNNERS.get(job.tool_module)
    if runner_cls is None:
        return RunResult(FinishStatus.FAILED, "tool module is not installed on this worker")
    try:
        params = runner_cls.check_params(job.params)
    except ValidationError:
        return RunResult(FinishStatus.FAILED, "job parameters do not match the tool module schema")
    # The backend refuses this pairing at creation and dispatch; a tool given
    # `*.example.com` literally would fail in its own, less clear way.
    if not runner_cls.spec().accepts_wildcard and any(map(is_wildcard_target, job.target)):
        return RunResult(FinishStatus.FAILED, "tool module does not accept a wildcard target")
    runner = runner_cls()
    result = runner.run(job, params, workdir, lambda: client.job_heartbeat(job.job_id).action)
    for path in runner.raw_output_paths(workdir):
        client.upload_raw_output(job.job_id, path)
    return result


def execute_job(
    job_id: UUID, client: BackendClient, workroot: Path, tools: list[ToolVersion]
) -> None:
    """Run one job end to end. Errors end in `finish` with `failed`, never a retry."""
    structlog.contextvars.bind_contextvars(job_id=str(job_id))
    try:
        try:
            job = client.claim(job_id)
        except JobConflictError:
            # Already claimed, cancelled or finished: drop the task.
            log.info("job_claim_conflict")
            return
        structlog.contextvars.bind_contextvars(tool_module=job.tool_module)
        log.info("job_claimed")
        workdir = workroot / str(job_id)
        workdir.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            result = _run(job, client, workdir)
        except JobConflictError:
            # The backend no longer counts this worker as the job owner.
            log.warning("job_ownership_lost")
            return
        except BackendError:
            # Retries ran out. The dispatcher fails the job when heartbeats stop.
            log.exception("job_backend_unreachable")
            return
        except Exception:
            log.exception("job_runner_error")
            result = RunResult(FinishStatus.FAILED, "runner error")
        client.finish(
            job_id,
            JobFinish(
                status=result.status,
                status_reason=result.reason,
                tool_version=result.tool_version or _tool_version(job, tools),
            ),
        )
        log.info("job_finished", status=result.status.value)
        shutil.rmtree(workdir, ignore_errors=True)
    except BackendError:
        log.exception("job_backend_unreachable")
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "tool_module")


def _run_job(job_id: str) -> None:
    task = RunJobTask.model_validate({"job_id": job_id})
    execute_job(task.job_id, runtime.client(), runtime.workdir(), runtime.tools)


# Plain call instead of a decorator: Celery ships no type hints.
run_job = app.task(name=RUN_JOB_TASK, acks_late=True, ignore_result=True)(_run_job)

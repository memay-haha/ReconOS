"""Job status, heartbeat answer and finish body: docs/data/schema.md."""

import pytest
from pydantic import ValidationError

from contracts.job_status import (
    STATUS_REASON_MAX_LENGTH,
    FinishStatus,
    JobFinish,
    JobHeartbeatAction,
    JobHeartbeatResponse,
    JobStatus,
)


def test_job_status_values_match_the_schema() -> None:
    assert [status.value for status in JobStatus] == [
        "pending_approval",
        "queued",
        "dispatched",
        "running",
        "completed",
        "failed",
        "cancelled",
    ]


def test_heartbeat_answer_is_continue_or_cancel() -> None:
    assert JobHeartbeatResponse.model_validate({"action": "cancel"}).action is (
        JobHeartbeatAction.CANCEL
    )
    with pytest.raises(ValidationError):
        JobHeartbeatResponse.model_validate({"action": "pause"})


def test_finish_accepts_the_three_outcomes() -> None:
    for status in ("completed", "failed", "cancelled"):
        assert JobFinish.model_validate({"status": status}).status == FinishStatus(status)


@pytest.mark.parametrize(
    "body",
    [
        {"status": "running"},
        {"status": "failed", "status_reason": ""},
        {"status": "failed", "status_reason": "x" * (STATUS_REASON_MAX_LENGTH + 1)},
        {"status": "completed", "tool_version": ""},
        {"status": "completed", "extra": 1},
    ],
)
def test_finish_rejects_bad_body(body: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        JobFinish.model_validate(body)

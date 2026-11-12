"""Worker logging: masking, buffer limits, batch shipping."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from contracts.worker import WorkerLogBatch, WorkerLogRecord
from worker.logging import (
    MASK,
    LogBuffer,
    LogShipper,
    _to_record,
    flush_logs,
    mask_credentials,
)


def _record(event: str = "job_claimed") -> WorkerLogRecord:
    return WorkerLogRecord(logged_at=datetime.now(UTC), level="info", event=event)


def test_mask_walks_nested_objects_and_lists() -> None:
    masked = mask_credentials(
        None,
        "info",
        {
            "event": "x",
            "worker_token": "t",
            "Authorization": "Bearer t",
            "proxy_url": "http://u:p@h",
            "nested": {"api_key": "k", "items": [{"password": "p"}, "plain"]},
        },
    )

    assert masked["worker_token"] == MASK
    assert masked["Authorization"] == MASK
    assert masked["proxy_url"] == MASK
    assert masked["nested"] == {"api_key": MASK, "items": [{"password": MASK}, "plain"]}


def test_debug_records_never_leave_stdout() -> None:
    assert _to_record({"event": "x", "level": "debug"}) is None


def test_record_moves_extra_fields_to_context() -> None:
    job_id = uuid4()

    record = _to_record(
        {
            "event": "job_claimed",
            "level": "info",
            "logged_at": "2026-11-12T00:00:00Z",
            "job_id": str(job_id),
            "service": "worker",
            "tool_module": "nuclei",
            "path": ["a"],
        }
    )

    assert record is not None
    assert record.job_id == job_id
    assert record.context == {"tool_module": "nuclei", "path": "['a']"}


def test_record_with_bad_event_name_is_dropped() -> None:
    assert _to_record({"event": "Not An Event", "level": "info"}) is None


def test_full_buffer_drops_oldest_and_counts() -> None:
    buffer = LogBuffer(max_records=2)
    first, second, third = _record("a"), _record("b"), _record("c")
    for record in (first, second, third):
        buffer.add(record)

    assert buffer.take() == [second, third]
    assert buffer.take_dropped() == 1


def test_failed_batch_goes_back_for_the_next_round() -> None:
    buffer = LogBuffer()
    buffer.add(_record())

    def fail(_: WorkerLogBatch) -> None:
        raise OSError

    assert flush_logs(fail, buffer) is False
    assert len(buffer) == 1

    sent: list[WorkerLogBatch] = []
    assert flush_logs(sent.append, buffer) is True
    assert len(sent[0].records) == 1
    assert len(buffer) == 0


def test_put_back_keeps_newest_when_full() -> None:
    buffer = LogBuffer(max_records=1)
    buffer.add(_record("new"))

    buffer.put_back([_record("old")])

    assert [r.event for r in buffer.take()] == ["new"]
    assert buffer.take_dropped() == 1


def test_flush_reports_overflow(capsys: pytest.CaptureFixture[str]) -> None:
    buffer = LogBuffer(max_records=1)
    buffer.add(_record("a"))
    buffer.add(_record("b"))

    assert flush_logs(lambda _: None, buffer) is True
    assert buffer.dropped == 0
    assert "log_buffer_overflow" in capsys.readouterr().out


def test_empty_buffer_sends_nothing() -> None:
    sent: list[WorkerLogBatch] = []

    assert flush_logs(sent.append, LogBuffer()) is True
    assert sent == []


def test_shipper_flushes_on_stop_with_final_send() -> None:
    from worker.logging import BUFFER

    regular: list[WorkerLogBatch] = []
    final: list[WorkerLogBatch] = []
    BUFFER.add(_record())
    shipper = LogShipper(regular.append, final_send=final.append, interval=3600)
    shipper.start()

    shipper.stop()
    shipper.join(timeout=5)

    assert regular == []
    assert len(final) == 1

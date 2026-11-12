"""Shared fixtures of the worker tests. No test runs a real tool or reaches a target."""

from collections.abc import Iterator

import pytest
import structlog

from worker.logging import BUFFER


@pytest.fixture(autouse=True)
def _empty_log_buffer() -> Iterator[None]:
    BUFFER.take(len(BUFFER) or 1)
    BUFFER.take_dropped()
    yield
    structlog.contextvars.clear_contextvars()
    # A test that configured logging bound stdout of its own capture.
    structlog.reset_defaults()

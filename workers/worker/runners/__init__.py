"""Runners register themselves on import: one line per tool module."""

from worker.runners import nuclei as nuclei
from worker.runners.base import RUNNERS, Runner, RunResult

__all__ = ["RUNNERS", "RunResult", "Runner"]

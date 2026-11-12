"""Runners register themselves on import: one line per tool module."""

from worker.runners import gowitness as gowitness
from worker.runners import nuclei as nuclei
from worker.runners import osmedeus_domain_extensive as osmedeus_domain_extensive
from worker.runners import osmedeus_domain_lite as osmedeus_domain_lite
from worker.runners import osmedeus_general as osmedeus_general
from worker.runners.base import RUNNERS, Runner, RunResult

__all__ = ["RUNNERS", "RunResult", "Runner"]

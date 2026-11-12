"""Worker heartbeat: installed tool modules, tool versions, CPU load.

Contract: POST /worker/heartbeat in docs/integrations/external-services.md.
"""

import threading
from collections.abc import Callable
from pathlib import Path
from typing import Final

import structlog

from contracts.worker import ToolVersion, WorkerHeartbeat
from worker.runners import RUNNERS

PROC_STAT: Final = Path("/proc/stat")

log = structlog.get_logger(__name__)


def read_cpu_times(stat: Path = PROC_STAT) -> tuple[int, int] | None:
    """(idle, total) jiffies of all CPUs, None when /proc is not available."""
    try:
        first_line = stat.read_text(encoding="ascii").splitlines()[0]
    except OSError, IndexError:
        return None
    fields = [int(value) for value in first_line.split()[1:]]
    # idle + iowait count as idle time.
    idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
    return idle, sum(fields)


class CpuSampler:
    """Average CPU load between two calls, 0 to 100."""

    def __init__(self, read: Callable[[], tuple[int, int] | None] = read_cpu_times) -> None:
        self._read = read
        self._previous = read()

    def sample(self) -> float | None:
        current = self._read()
        previous, self._previous = self._previous, current
        if current is None or previous is None:
            return None
        idle = current[0] - previous[0]
        total = current[1] - previous[1]
        if total <= 0:
            return None
        return round(max(0.0, min(100.0, 100.0 * (total - idle) / total)), 1)


def installed_tools(tool_modules: list[str]) -> list[ToolVersion]:
    """Version of every tool behind the installed tool modules, read once."""
    tools: dict[str, str | None] = {}
    for name in tool_modules:
        runner_cls = RUNNERS.get(name)
        if runner_cls is None:
            log.error("tool_module_not_installed", tool_module=name)
            continue
        version = runner_cls().read_version()
        for tool in runner_cls.spec().tools:
            tools.setdefault(tool, version)
    return [ToolVersion(name=name, version=version) for name, version in tools.items()]


class HeartbeatLoop(threading.Thread):
    """Sends the worker heartbeat right away, then every `interval` seconds."""

    def __init__(
        self,
        send: Callable[[WorkerHeartbeat], None],
        tool_modules: list[str],
        tools: list[ToolVersion],
        interval: float,
        sampler: CpuSampler | None = None,
    ) -> None:
        super().__init__(name="worker-heartbeat", daemon=True)
        self._send = send
        self._tool_modules = tool_modules
        self._tools = tools
        self._interval = interval
        self._sampler = sampler or CpuSampler()
        self._stop_event = threading.Event()

    def beat(self) -> None:
        body = WorkerHeartbeat(
            tool_modules=self._tool_modules,
            tools=self._tools,
            cpu_percent=self._sampler.sample(),
        )
        try:
            self._send(body)
        except Exception as exc:  # noqa: BLE001  the next beat tries again
            log.warning("worker_heartbeat_failed", error=type(exc).__name__)

    def run(self) -> None:
        self.beat()
        while not self._stop_event.wait(self._interval):
            self.beat()

    def stop(self) -> None:
        self._stop_event.set()

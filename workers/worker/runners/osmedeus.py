"""Shared runner of the Osmedeus workflow tool modules.

Not a tool module itself: each `osmedeus_<workflow>.py` registers a subclass.
The runner drives the engine over REST only (G1), one run per target with a
workspace unique to the job (G8), then packs every workspace into one raw
output file. It never reads the files it packs: parsing happens in the backend.
Calls, package layout: docs/integrations/external-services.md.
"""

import math
import re
import time
import zipfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import IO, Any, ClassVar, Final

import httpx
import structlog
from pydantic import BaseModel, ConfigDict

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import EngineSpec, JobSpec
from contracts.tool_modules import OsmedeusParams, ToolParams
from contracts.tool_modules.osmedeus import (
    ENGINE,
    MANIFEST_FILENAME,
    RAW_OUTPUT_FILENAME,
    OsmedeusManifest,
    OsmedeusRun,
    OsmedeusRunStatus,
    flow_of,
    workspace_name,
)
from worker.runners.base import Runner, RunResult
from worker.runners.engine_client import EngineClient, EngineError

API_KEY_HEADER: Final = "x-osm-api-key"
# The engine zips the whole workspace before it answers.
DOWNLOAD_TIMEOUT: Final = httpx.Timeout(connect=10.0, read=600.0, write=60.0, pool=10.0)
DOWNLOAD_CHUNK_BYTES: Final = 1024 * 1024
# Uncompressed size cap of the package: a hostile engine zip stops here.
PACKAGE_MAX_BYTES: Final = 10 * 1024**3
# engine.settings.scan_preset to the Osmedeus run tactic.
TACTICS: Final[dict[str, str]] = {"quick": "aggressive", "balanced": "default", "deep": "gently"}
TERMINAL: Final = frozenset(
    {OsmedeusRunStatus.COMPLETED, OsmedeusRunStatus.FAILED, OsmedeusRunStatus.CANCELLED}
)
# Keys the runner owns in the run params; an engine variable cannot override them.
RESERVED_PARAMS: Final = frozenset({"target", "space_name", "tactic", "threads_hold"})
# File name the engine gives the zip it keeps in its snapshot folder.
SNAPSHOT_NAME: Final = re.compile(r'filename="?([A-Za-z0-9._-]{1,255}\.zip)"?')

log = structlog.get_logger(__name__)


class PackageTooLargeError(Exception):
    """The workspaces unpack to more than PACKAGE_MAX_BYTES."""


class _RunCreated(BaseModel):
    model_config = ConfigDict(extra="ignore")

    run_uuid: str


class _RunData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: OsmedeusRunStatus


class _RunEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: _RunData


class _ServerInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: str | None = None


class OsmedeusClient(EngineClient):
    """REST client of one Osmedeus server."""

    engine = ENGINE

    def auth_headers(self, api_key: str) -> dict[str, str]:
        return {API_KEY_HEADER: api_key}

    def version(self) -> str | None:
        response = self._send(lambda: self._http.get("/server-info"), "server_info")
        return self._json(response, _ServerInfo, "server_info").version

    def create_run(self, body: dict[str, Any]) -> str:
        response = self._send(lambda: self._http.post("/osm/api/runs", json=body), "create_run")
        return self._json(response, _RunCreated, "create_run").run_uuid

    def run_status(self, run_uuid: str) -> OsmedeusRunStatus:
        response = self._send(lambda: self._http.get(f"/osm/api/runs/{run_uuid}"), "get_run")
        return self._json(response, _RunEnvelope, "get_run").data.status

    def cancel_run(self, run_uuid: str) -> None:
        # 400 means the run already ended: nothing left to stop.
        response = self._send(lambda: self._http.delete(f"/osm/api/runs/{run_uuid}"), "cancel_run")
        if response.status_code > 400:
            raise EngineError("cancel_run", f"status {response.status_code}")

    def download_workspace(self, workspace: str, path: Path) -> tuple[bool, str | None]:
        """Save the zip of a workspace.

        Returns whether the engine had the workspace, and the name of the zip the
        engine kept in its snapshot folder when it gave one.
        """

        def fetch() -> httpx.Response:
            request = self._http.build_request(
                "GET", f"/osm/api/snapshot-download/{workspace}", timeout=DOWNLOAD_TIMEOUT
            )
            response = self._http.send(request, stream=True)
            if response.status_code != 200:
                response.read()
                return response
            try:
                with path.open("wb") as file:
                    for chunk in response.iter_bytes(DOWNLOAD_CHUNK_BYTES):
                        file.write(chunk)
            finally:
                response.close()
            return response

        response = self._send(fetch, "download_workspace")
        if response.status_code == 404:
            return False, None
        if response.status_code != 200:
            raise EngineError("download_workspace", f"status {response.status_code}")
        match = SNAPSHOT_NAME.search(response.headers.get("content-disposition", ""))
        name = match.group(1) if match else None
        # Only a zip of this workspace is ever deleted.
        return True, name if name and name.startswith(f"{workspace}_") else None

    def delete_snapshot(self, name: str) -> None:
        """Delete a zip the engine kept from a download: one per download."""
        response = self._send(
            lambda: self._http.delete(f"/osm/api/snapshots/{name}"), "delete_snapshot"
        )
        if response.status_code >= 400 and response.status_code != 404:
            raise EngineError("delete_snapshot", f"status {response.status_code}")


@dataclass(slots=True)
class _Outcome:
    status: FinishStatus = FinishStatus.COMPLETED
    reason: str | None = None

    def fail(self, reason: str) -> None:
        if self.status is FinishStatus.COMPLETED:
            self.status, self.reason = FinishStatus.FAILED, reason


def _safe_member(name: str) -> str | None:
    """Relative POSIX path of a zip entry, None when it could leave its folder."""
    if "\\" in name or name.startswith("/"):
        return None
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ("..", "") for part in path.parts):
        return None
    return path.as_posix()


def _chunks(source: IO[bytes]) -> Iterator[bytes]:
    while chunk := source.read(DOWNLOAD_CHUNK_BYTES):
        yield chunk


def build_package(output: Path, manifest: OsmedeusManifest, workspaces: dict[int, Path]) -> None:
    """Write `osmedeus.zip`: the manifest, then each workspace under `<index>/`."""
    total = dropped = 0
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as package:
        package.writestr(MANIFEST_FILENAME, manifest.model_dump_json(indent=2))
        for index, source_path in sorted(workspaces.items()):
            with zipfile.ZipFile(source_path) as source:
                for info in source.infolist():
                    if info.is_dir():
                        continue
                    name = _safe_member(info.filename)
                    if name is None:
                        log.warning("engine_zip_entry_skipped", engine=ENGINE, index=index)
                        continue
                    if "/" not in name:
                        # Workspace root: the engine's own run files (state, logs,
                        # resolved workflow). They echo every run param, engine
                        # variables included, so they never reach the package (G7).
                        dropped += 1
                        continue
                    with source.open(info) as reader, package.open(f"{index}/{name}", "w") as out:
                        # Count real bytes: the size in the entry header is engine data.
                        for chunk in _chunks(reader):
                            total += len(chunk)
                            if total > PACKAGE_MAX_BYTES:
                                raise PackageTooLargeError
                            out.write(chunk)
    if dropped:
        log.info("engine_run_files_dropped", engine=ENGINE, files=dropped)


class OsmedeusRunner(Runner):
    """Base of the `osmedeus-<flow>` runners. Subclasses only set `tool_module`."""

    output_files: ClassVar[tuple[str, ...]] = (RAW_OUTPUT_FILENAME,)

    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._transport = transport
        self._sleep = sleep

    def version_args(self) -> list[str]:
        # No local binary: the engine reports its version per job.
        return []

    def read_version(self) -> str | None:
        return None

    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        message = "an engine runner calls REST, it starts no process"
        raise NotImplementedError(message)

    @staticmethod
    def run_params(engine: EngineSpec, params: OsmedeusParams, workspace: str) -> dict[str, str]:
        """`params` of a run: engine variables first, then the keys the runner owns."""
        values = {
            key: secret.get_secret_value()
            for key, secret in engine.variables.items()
            if key not in RESERVED_PARAMS
        }
        values["space_name"] = workspace
        tactic = TACTICS.get(str(engine.settings.get("scan_preset", "balanced")))
        if tactic is not None:
            values["tactic"] = tactic
        if params.threads:
            values["threads_hold"] = str(params.threads)
        return values

    def _wait(
        self,
        api: OsmedeusClient,
        run_uuid: str,
        job: JobSpec,
        deadline: float,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float],
    ) -> tuple[OsmedeusRunStatus, str | None]:
        """Poll the run until it ends. The reason is set when the runner stopped it."""
        while True:
            remaining = deadline - clock()
            if remaining <= 0:
                return OsmedeusRunStatus.CANCELLED, "timeout"
            self._sleep(min(job.heartbeat_seconds, remaining))
            if heartbeat() is JobHeartbeatAction.CANCEL:
                return OsmedeusRunStatus.CANCELLED, "cancel"
            status = api.run_status(run_uuid)
            if status in TERMINAL:
                return status, None

    def run(
        self,
        job: JobSpec,
        params: ToolParams,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float] = time.monotonic,
    ) -> RunResult:
        assert isinstance(params, OsmedeusParams)  # noqa: S101  narrowed by check_params
        engine = job.engine
        if engine is None or not engine.base_url:
            return RunResult(FinishStatus.FAILED, "engine is not configured")
        structlog.contextvars.bind_contextvars(engine=ENGINE)
        try:
            return self._run(job, params, engine, workdir, heartbeat, clock)
        finally:
            structlog.contextvars.unbind_contextvars("engine")

    def _run(
        self,
        job: JobSpec,
        params: OsmedeusParams,
        engine: EngineSpec,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float],
    ) -> RunResult:
        deadline = clock() + job.timeout_minutes * 60
        flow = flow_of(self.tool_module)
        outcome = _Outcome()
        runs: list[OsmedeusRun] = []
        workspaces: dict[int, Path] = {}
        version: str | None = None
        with OsmedeusClient(engine, transport=self._transport, sleep=self._sleep) as api:
            try:
                version = api.version()
            except EngineError as exc:
                log.warning("engine_unavailable", error=str(exc))
                return RunResult(FinishStatus.FAILED, "engine is unreachable")
            for index, target in enumerate(job.target, start=1):
                workspace = workspace_name(job.job_id, index)
                remaining = deadline - clock()
                if remaining <= 0:
                    outcome.fail("engine run exceeded the job time limit")
                    break
                body = {
                    "flow": flow,
                    "target": target,
                    "params": self.run_params(engine, params, workspace),
                    "timeout": max(1, math.ceil(remaining / 60)),
                }
                try:
                    run_uuid = api.create_run(body)
                except EngineError as exc:
                    log.warning("engine_run_not_created", index=index, error=str(exc))
                    runs.append(
                        OsmedeusRun(
                            index=index,
                            target=target,
                            workspace=workspace,
                            status=OsmedeusRunStatus.MISSING,
                            has_output=False,
                        )
                    )
                    outcome.fail("engine refused the run")
                    break
                log.info("engine_run_created", index=index, run_uuid=run_uuid)
                stopped: str | None = None
                try:
                    status, stopped = self._wait(api, run_uuid, job, deadline, heartbeat, clock)
                except EngineError as exc:
                    log.warning("engine_run_lost", index=index, error=str(exc))
                    status, stopped = OsmedeusRunStatus.FAILED, "lost"
                if stopped is not None:
                    self._cancel(api, run_uuid)
                has_output = self._download(api, workspace, workdir, index, workspaces)
                runs.append(
                    OsmedeusRun(
                        index=index,
                        target=target,
                        workspace=workspace,
                        run_uuid=run_uuid,
                        status=status,
                        has_output=has_output,
                    )
                )
                log.info("engine_run_finished", index=index, status=status.value)
                if stopped == "cancel":
                    outcome.status, outcome.reason = FinishStatus.CANCELLED, "job cancelled"
                    break
                if stopped == "timeout":
                    outcome.fail("engine run exceeded the job time limit")
                    break
                if stopped == "lost":
                    outcome.fail("engine is unreachable")
                    break
                if status is not OsmedeusRunStatus.COMPLETED:
                    outcome.fail("engine run failed")
        manifest = OsmedeusManifest(
            tool_module=self.tool_module, flow=flow, engine_version=version, runs=runs
        )
        try:
            build_package(workdir / RAW_OUTPUT_FILENAME, manifest, workspaces)
        except PackageTooLargeError:
            (workdir / RAW_OUTPUT_FILENAME).unlink(missing_ok=True)
            return RunResult(FinishStatus.FAILED, "engine output exceeds the size limit", version)
        finally:
            for path in workspaces.values():
                path.unlink(missing_ok=True)
        return RunResult(outcome.status, outcome.reason, version)

    def _cancel(self, api: OsmedeusClient, run_uuid: str) -> None:
        try:
            api.cancel_run(run_uuid)
        except EngineError as exc:
            # The engine stops the run by itself at its own timeout.
            log.warning("engine_run_cancel_failed", run_uuid=run_uuid, error=str(exc))

    def _download(
        self, api: OsmedeusClient, workspace: str, workdir: Path, index: int, into: dict[int, Path]
    ) -> bool:
        path = workdir / f"engine-{index}.zip"
        snapshot: str | None = None
        try:
            found, snapshot = api.download_workspace(workspace, path)
        except EngineError as exc:
            log.warning("engine_workspace_unavailable", index=index, error=str(exc))
            found = False
        if snapshot is not None:
            try:
                api.delete_snapshot(snapshot)
            except EngineError as exc:
                # A leftover zip only costs engine disk: docs/ops/deployment.md.
                log.warning("engine_snapshot_not_deleted", index=index, error=str(exc))
        if found and not zipfile.is_zipfile(path):
            log.warning("engine_workspace_not_zip", index=index)
            found = False
        if found:
            into[index] = path
        else:
            path.unlink(missing_ok=True)
        return found

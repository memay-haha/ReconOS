"""Factories for test rows: .claude/rules/testing.md.

Plain functions over the test session, so any test module can import them
without a fixture. Names use reserved documentation values only.
"""

import itertools
import json
import secrets
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.core.crypto import encrypt
from app.finding import service as finding_service
from app.finding.models import Finding
from app.finding.schemas import FindingBatch
from app.job.models import Job
from app.parser.nuclei import finding_from_line
from app.program.models import Program, ProgramStatus, ProgramUser, Proxy
from app.raw_output.models import RawOutput
from app.scope.models import ScopeRule
from app.tool_module.models import ToolModule
from app.user.models import Worker, WorkerToken
from app.user.service import hash_worker_token

_counter = itertools.count()


async def make_program(
    session: AsyncSession,
    *,
    name: str | None = None,
    status: ProgramStatus = ProgramStatus.ACTIVE,
    created_by: uuid.UUID | None = None,
    **columns: object,
) -> Program:
    program = Program(
        name=name or f"program-{next(_counter)}-{uuid.uuid4().hex[:8]}",
        bounty_type=str(columns.pop("bounty_type", "bounty")),
        status=status.value,
        created_by=created_by,
        **columns,
    )
    if status is ProgramStatus.ARCHIVED:
        program.archived_at = datetime.now(UTC)
    session.add(program)
    await session.flush()
    return program


async def assign(session: AsyncSession, program: Program, user_id: uuid.UUID) -> None:
    session.add(ProgramUser(program_id=program.id, user_id=user_id))
    await session.flush()


async def make_proxy(
    session: AsyncSession,
    program: Program,
    *,
    name: str | None = None,
    url: str = "http://198.51.100.10:3128",
    is_enabled: bool = True,
) -> Proxy:
    proxy = Proxy(
        program_id=program.id,
        name=name or f"proxy-{next(_counter)}",
        url_encrypted=encrypt(url, context="proxy.url_encrypted"),
        is_enabled=is_enabled,
    )
    session.add(proxy)
    await session.flush()
    return proxy


async def make_scope_rule(
    session: AsyncSession,
    program: Program,
    value: str = "example.com",
    *,
    scope_type: str = "in_scope",
    rule_type: str = "domain",
    reason: str | None = None,
) -> ScopeRule:
    """A rule written as given, without the service's canonicalisation."""
    rule = ScopeRule(
        program_id=program.id,
        scope_type=scope_type,
        rule_type=rule_type,
        value=value,
        reason=reason,
    )
    session.add(rule)
    await session.flush()
    return rule


async def nuclei(session: AsyncSession) -> ToolModule:
    """The nuclei row seeded by migration 0003."""
    row = await session.scalar(select(ToolModule).where(ToolModule.name == "nuclei"))
    assert row is not None
    return row


async def make_worker(
    session: AsyncSession,
    *,
    name: str | None = None,
    tool_modules: list[str] | None = None,
    online: bool = True,
) -> tuple[Worker, str]:
    """A worker and the plain token for its Authorization header."""
    worker = Worker(
        name=name or f"worker-{next(_counter)}-{uuid.uuid4().hex[:6]}",
        tool_modules=tool_modules if tool_modules is not None else ["nuclei"],
        tool_versions=[{"name": "nuclei", "version": "3.3.0"}],
        last_heartbeat_at=datetime.now(UTC) if online else None,
    )
    session.add(worker)
    await session.flush()
    token = secrets.token_urlsafe(32)
    session.add(WorkerToken(worker_id=worker.id, token_hash=hash_worker_token(token)))
    await session.flush()
    return worker, token


async def make_job(
    session: AsyncSession,
    program: Program,
    tool_module: ToolModule,
    *,
    status: str = "queued",
    target: list[str] | None = None,
    priority: int = 1,
    worker_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
    **columns: object,
) -> Job:
    job = Job(
        program_id=program.id,
        tool_module_id=tool_module.id,
        status=status,
        priority=priority,
        target=target or ["a.example.com"],
        params={},
        worker_id=worker_id,
        created_by=created_by,
        **columns,
    )
    session.add(job)
    await session.flush()
    await session.refresh(job)
    return job


async def tool_module_named(session: AsyncSession, name: str) -> ToolModule:
    """A tool module row seeded by migration, for example `osmedeus-general` (0005)."""
    row = await session.scalar(select(ToolModule).where(ToolModule.name == name))
    assert row is not None
    return row


async def tool_module_without_parser(session: AsyncSession) -> ToolModule:
    """A tool module row no parser claims: every seeded tool module has one since batch 6."""
    row = await session.scalar(select(ToolModule).where(ToolModule.name == "no-parser-test"))
    if row is None:
        row = ToolModule(name="no-parser-test")
        session.add(row)
        await session.flush()
        await session.refresh(row)
    return row


async def make_raw_output(
    session: AsyncSession,
    job: Job,
    *,
    filename: str = "osmedeus.zip",
    parse_status: str = "pending",
) -> RawOutput:
    """Metadata only: tests hand the parser the bytes, MinIO is not touched."""
    row = RawOutput(
        job_id=job.id,
        filename=filename,
        object_key=f"{job.program_id}/{job.id}/{filename}",
        content_type="application/zip",
        size_bytes=0,
        sha256="0" * 64,
        parse_status=parse_status,
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


def zip_directory(source: Path, target: Path) -> Path:
    """Pack a sample raw output tree, as the runner packs a workspace."""
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source).as_posix())
    return target


async def make_findings(
    session: AsyncSession,
    program: Program,
    lines: list[dict[str, object]],
    *,
    job: Job | None = None,
    raw_output: RawOutput | None = None,
    tool_module: str = "nuclei",
) -> list[Finding]:
    """Findings written the way the parser writes them, from nuclei result objects."""
    batch = FindingBatch(
        findings=[finding_from_line(json.dumps(line), tool_module) for line in lines]
    )
    origin = asset_service.Provenance(
        program_id=program.id,
        job_id=job.id if job else None,
        raw_output_id=raw_output.id if raw_output else None,
    )
    rules = await asset_service.load_scope_rules(session, program.id)
    await finding_service.ingest(session, batch, origin, rules)
    keys = [record.dedup_key for record in batch.findings]
    rows = {
        row.dedup_key: row
        for row in await session.scalars(
            select(Finding).where(Finding.program_id == program.id, Finding.dedup_key.in_(keys))
        )
    }
    return [rows[key] for key in dict.fromkeys(keys)]


def nuclei_line(
    template_id: str = "git-config",
    matched_at: str = "https://a.example.com/.git/config",
    severity: str = "medium",
    **extra: object,
) -> dict[str, object]:
    """One nuclei JSONL result; documentation hosts only."""
    return {
        "template-id": template_id,
        "info": {"name": f"{template_id} finding", "severity": severity},
        "matched-at": matched_at,
        **extra,
    }

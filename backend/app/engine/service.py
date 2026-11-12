"""Engines: connection, write-only credentials, variables, live reads over REST.

One `engine` row per engine named in code, seeded by migration; S16 and S17
only edit it. API keys and variable values are encrypted (`app/core/crypto.py`),
never returned, logged or audited (G7). Public API for the modules above (job):
`engine_spec_for`. Job and tool module counts are read by table name, the way
tool_module reads job: docs/architecture/dependency-graph.md.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
import structlog
from pydantic import ValidationError
from sqlalchemy import Boolean, Integer, Text, column, func, select, table, update
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.crypto import decrypt, encrypt
from app.core.db import independent_session, notify_dispatcher
from app.core.errors import (
    BadRequestError,
    EngineUnavailableError,
    FieldError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.engine.adapters import (
    ADAPTERS,
    EngineAdapter,
    EngineCheckResult,
    EngineModule,
    EngineWorkflowDetail,
    EngineWorkflowItem,
    LlmConfig,
)
from app.engine.models import Engine, EngineVariable
from app.engine.schemas import (
    ENGINE_SETTINGS,
    EngineModulePage,
    EngineModulesPatch,
    EnginePage,
    EngineResponse,
    EngineSettings,
    EngineSort,
    EngineTestResponse,
    EngineUpdateRequest,
    EngineVariablePage,
    EngineVariableResponse,
    VariableSort,
)
from contracts.tasks import EngineSpec
from contracts.tool_modules import TOOL_MODULES

log = structlog.get_logger()

RESOURCE = "engine"
# Associated data of each ciphertext: app/core/crypto.py.
API_KEY_CONTEXT = "engine.api_key_encrypted"
LLM_API_KEY_CONTEXT = "engine.llm_api_key_encrypted"
VARIABLE_CONTEXT = "engine_variable.value_encrypted"

_tool_module = table(
    "tool_module",
    column("id", PG_UUID(as_uuid=True)),
    column("name", Text),
    column("is_enabled", Boolean),
    column("max_concurrency", Integer),
)
_job = table("job", column("tool_module_id", PG_UUID(as_uuid=True)), column("status", Text))

# Test hook: the adapters' HTTP transport. None in production.
_transport: httpx.AsyncBaseTransport | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _tool_modules_of(engine_name: str) -> list[str]:
    return [spec.name for spec in TOOL_MODULES.values() if spec.runs_on == engine_name]


async def _slots(session: AsyncSession, engine_name: str) -> tuple[int, int]:
    """Running jobs and summed max_concurrency of the enabled tool modules on the engine."""
    names = _tool_modules_of(engine_name)
    if not names:
        return 0, 0
    total = await session.scalar(
        select(func.coalesce(func.sum(_tool_module.c.max_concurrency), 0)).where(
            _tool_module.c.name.in_(names), _tool_module.c.is_enabled.is_(True)
        )
    )
    used = await session.scalar(
        select(func.count())
        .select_from(_job.join(_tool_module, _job.c.tool_module_id == _tool_module.c.id))
        .where(_tool_module.c.name.in_(names), _job.c.status == "running")
    )
    return int(used or 0), int(total or 0)


async def _response(session: AsyncSession, row: Engine) -> EngineResponse:
    used, total = await _slots(session, row.name)
    uptime = (
        max(0, int((_now() - row.ok_since).total_seconds())) if row.ok_since is not None else None
    )
    return EngineResponse(
        id=row.id,
        name=row.name,
        base_url=row.base_url,
        is_enabled=row.is_enabled,
        settings=row.settings,
        updated_by=row.updated_by,
        updated_at=row.updated_at,
        version=row.version,
        last_tested_at=row.last_tested_at,
        last_test_ok=row.last_test_ok,
        api_key_updated_at=row.api_key_updated_at,
        has_api_key=row.api_key_encrypted is not None,
        has_llm_api_key=row.llm_api_key_encrypted is not None,
        uptime_seconds=uptime,
        slots_used=used,
        slots_total=total,
    )


async def get_engine(session: AsyncSession, engine_id: uuid.UUID) -> Engine:
    row = await session.get(Engine, engine_id)
    if row is None or row.name not in ENGINE_SETTINGS:
        raise NotFoundError(detail="engine does not exist")
    return row


async def list_engines(
    session: AsyncSession, *, limit: int, cursor: str | None, sort: EngineSort = "name"
) -> EnginePage:
    """Engines are few (one row per engine in code), so paging runs in memory."""
    rows = [
        row
        for row in await session.scalars(select(Engine).order_by(Engine.name))
        if row.name in ENGINE_SETTINGS
    ]
    descending = sort.startswith("-")
    rows.sort(key=lambda row: (row.name, str(row.id)), reverse=descending)
    if cursor is not None:
        seen_name, seen_id = decode_cursor(cursor)
        if not isinstance(seen_name, str):
            raise BadRequestError(detail="cursor is not valid")
        seen = (seen_name, str(seen_id))
        rows = [
            row
            for row in rows
            if ((row.name, str(row.id)) < seen if descending else (row.name, str(row.id)) > seen)
        ]
    size = max(1, min(limit, MAX_LIMIT))
    page = rows[:size]
    next_cursor = encode_cursor(page[-1].name, page[-1].id) if len(rows) > size else None
    return EnginePage(
        items=[await _response(session, row) for row in page],
        next_cursor=next_cursor,
        total=len(rows),
    )


def _checked_settings(row: Engine, settings: dict[str, Any]) -> dict[str, Any]:
    model = ENGINE_SETTINGS[row.name]
    try:
        checked = model.model_validate(settings)
    except ValidationError as err:
        errors: list[FieldError] = [
            {
                "field": ".".join(["settings", *(str(part) for part in item["loc"])]),
                "code": item["type"],
            }
            for item in err.errors()
        ]
        raise ValidationFailedError(
            detail="settings do not match the engine", errors=errors
        ) from err
    return checked.model_dump(mode="json", exclude_none=True)


async def update_engine(
    session: AsyncSession, *, actor: User, engine_id: uuid.UUID, changes: EngineUpdateRequest
) -> EngineResponse:
    """Superadmin edits the connection. Keys are write-only; an omitted key is kept."""
    row = await session.get(Engine, engine_id, with_for_update=True)
    if row is None or row.name not in ENGINE_SETTINGS:
        raise NotFoundError(detail="engine does not exist")
    settings_model: type[EngineSettings] = ENGINE_SETTINGS[row.name]
    sent = changes.model_fields_set
    errors: list[FieldError] = [
        {"field": name, "code": "null_not_allowed"}
        for name in ("base_url", "is_enabled", "settings")
        if name in sent and getattr(changes, name) is None
    ]
    if changes.llm_api_key is not None and not settings_model.accepts_llm_api_key:
        errors.append({"field": "llm_api_key", "code": "not_supported"})
    if errors:
        raise ValidationFailedError(detail="engine update is not valid", errors=errors)

    before: dict[str, Any] = {}
    after: dict[str, Any] = {}

    def change(name: str, value: object) -> None:
        if getattr(row, name) != value:
            before[name] = getattr(row, name)
            after[name] = value
            setattr(row, name, value)

    if changes.base_url is not None:
        change("base_url", str(changes.base_url).rstrip("/"))
    if changes.settings is not None:
        change("settings", _checked_settings(row, changes.settings))
    if changes.api_key is not None:
        row.api_key_encrypted = encrypt(changes.api_key, context=API_KEY_CONTEXT)
        row.api_key_updated_at = _now()
        # Only the fact of the change is audited, never the key (G7).
        after["api_key"] = "changed"
    if changes.llm_api_key is not None:
        row.llm_api_key_encrypted = encrypt(changes.llm_api_key, context=LLM_API_KEY_CONTEXT)
        after["llm_api_key"] = "changed"
    if changes.is_enabled is not None:
        if changes.is_enabled and (not row.base_url or row.api_key_encrypted is None):
            raise ValidationFailedError(
                detail="set base_url and api_key before enabling the engine",
                errors=[{"field": "is_enabled", "code": "engine_not_configured"}],
            )
        change("is_enabled", changes.is_enabled)
    if after:
        row.updated_by = actor.id
        await session.flush()
        await session.refresh(row)
        await audit.record(
            session,
            action="engine_updated",
            user_id=actor.id,
            resource_type=RESOURCE,
            resource_id=row.id,
            detail={"before": before, "after": after},
        )
        # Engine jobs wait on an enabled engine.
        await notify_dispatcher(session, "engine_updated")
    return await _response(session, row)


def _adapter(row: Engine) -> EngineAdapter:
    adapter_cls = ADAPTERS.get(row.name)
    if adapter_cls is None:  # pragma: no cover - ENGINE_SETTINGS and ADAPTERS list the same names
        raise NotFoundError(detail="engine does not exist")
    if not row.base_url or row.api_key_encrypted is None:
        raise EngineUnavailableError(detail="engine has no base_url or API key")
    api_key = decrypt(row.api_key_encrypted, context=API_KEY_CONTEXT)
    return adapter_cls(row.base_url, api_key, transport=_transport)


async def test_engine(
    session: AsyncSession, *, actor: User, engine_id: uuid.UUID
) -> EngineTestResponse:
    """Reach the engine with the stored key and record the outcome on the row.

    A failed test answers an error, which rolls the request back, so its outcome
    is written through an independent session: S16 still shows the last test.
    """
    row = await get_engine(session, engine_id)
    adapter = _adapter(row)
    structlog.contextvars.bind_contextvars(engine=row.name)
    now = _now()
    try:
        version = await adapter.check()
    except EngineUnavailableError:
        async with independent_session() as other:
            await other.execute(
                update(Engine)
                .where(Engine.id == row.id)
                .values(last_tested_at=now, last_test_ok=False, ok_since=None)
            )
        await audit.record_detached(
            action="engine_tested",
            user_id=actor.id,
            resource_type=RESOURCE,
            resource_id=row.id,
            detail={"ok": False},
        )
        raise
    finally:
        structlog.contextvars.unbind_contextvars("engine")
    row.last_tested_at, row.last_test_ok, row.version = now, True, version
    if row.ok_since is None:
        row.ok_since = now
    await session.flush()
    await audit.record(
        session,
        action="engine_tested",
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=row.id,
        detail={"ok": True},
    )
    log.info("engine_tested", engine=row.name)
    return EngineTestResponse(version=version)


async def list_workflows(session: AsyncSession, engine_id: uuid.UUID) -> Page[EngineWorkflowItem]:
    row = await get_engine(session, engine_id)
    items = await _adapter(row).workflows()
    items.sort(key=lambda item: item.name)
    return Page[EngineWorkflowItem](items=items, total=len(items))


async def get_workflow(
    session: AsyncSession, engine_id: uuid.UUID, name: str
) -> EngineWorkflowDetail:
    row = await get_engine(session, engine_id)
    return await _adapter(row).workflow(name)


# ---------------------------------------------------------------- native modules, checks


def _module_page(items: list[EngineModule]) -> EngineModulePage:
    items.sort(key=lambda item: (item.kind, item.name))
    return EngineModulePage(items=items, total=len(items))


async def list_modules(session: AsyncSession, engine_id: uuid.UUID) -> EngineModulePage:
    row = await get_engine(session, engine_id)
    with structlog.contextvars.bound_contextvars(engine=row.name):
        return _module_page(await _adapter(row).modules())


async def update_modules(
    session: AsyncSession, *, actor: User, engine_id: uuid.UUID, changes: EngineModulesPatch
) -> EngineModulePage:
    """Switch native modules on the engine itself: ReconOS stores no copy."""
    row = await get_engine(session, engine_id)
    wanted = {change.name: change.is_enabled for change in changes.modules}
    with structlog.contextvars.bound_contextvars(engine=row.name):
        items = await _adapter(row).set_modules(wanted)
    await audit.record(
        session,
        action="engine_modules_updated",
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=row.id,
        detail={"modules": wanted},
    )
    log.info("engine_modules_updated", engine=row.name, changed=len(wanted))
    return _module_page(items)


async def validate_engine(session: AsyncSession, engine_id: uuid.UUID) -> EngineCheckResult:
    row = await get_engine(session, engine_id)
    with structlog.contextvars.bound_contextvars(engine=row.name):
        return await _adapter(row).validate()


async def verify_model(
    session: AsyncSession, *, actor: User, engine_id: uuid.UUID
) -> EngineCheckResult:
    """Hand the stored LLM settings to the engine, then read its agent check.

    The engine keeps the settings it was given: the result describes them.
    """
    row = await get_engine(session, engine_id)
    adapter = _adapter(row)
    settings = row.settings
    llm = LlmConfig(
        provider=settings.get("llm_provider"),
        model=settings.get("llm_model"),
        base_url=settings.get("llm_base_url"),
        api_key=decrypt(row.llm_api_key_encrypted, context=LLM_API_KEY_CONTEXT)
        if row.llm_api_key_encrypted is not None
        else None,
    )
    with structlog.contextvars.bound_contextvars(engine=row.name):
        result = await adapter.verify_model(llm)
    await audit.record(
        session,
        action="engine_model_verified",
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=row.id,
        detail={"ok": result.ok},
    )
    return result


# ---------------------------------------------------------------- variables


async def list_variables(
    session: AsyncSession,
    engine_id: uuid.UUID,
    *,
    limit: int,
    cursor: str | None,
    sort: VariableSort = "key",
) -> EngineVariablePage:
    await get_engine(session, engine_id)
    descending = sort.startswith("-")
    key_order = EngineVariable.key.desc() if descending else EngineVariable.key.asc()
    id_order = EngineVariable.id.desc() if descending else EngineVariable.id.asc()
    stmt = select(EngineVariable).where(EngineVariable.engine_id == engine_id)
    total = await session.scalar(
        select(func.count())
        .select_from(EngineVariable)
        .where(EngineVariable.engine_id == engine_id)
    )
    if cursor is not None:
        seen_key, seen_id = decode_cursor(cursor)
        if not isinstance(seen_key, str):
            raise BadRequestError(detail="cursor is not valid")
        position = (
            (EngineVariable.key < seen_key)
            | ((EngineVariable.key == seen_key) & (EngineVariable.id < seen_id))
            if descending
            else (EngineVariable.key > seen_key)
            | ((EngineVariable.key == seen_key) & (EngineVariable.id > seen_id))
        )
        stmt = stmt.where(position)
    size = max(1, min(limit, MAX_LIMIT))
    rows = list(await session.scalars(stmt.order_by(key_order, id_order).limit(size + 1)))
    page = rows[:size]
    return EngineVariablePage(
        items=[
            EngineVariableResponse(
                id=row.id,
                engine_id=row.engine_id,
                key=row.key,
                updated_by=row.updated_by,
                updated_at=row.updated_at,
            )
            for row in page
        ],
        next_cursor=encode_cursor(page[-1].key, page[-1].id) if len(rows) > size else None,
        total=total or 0,
    )


async def put_variable(
    session: AsyncSession, *, actor: User, engine_id: uuid.UUID, key: str, value: str
) -> None:
    """Create or replace a variable. Only the key is audited (G7)."""
    row = await get_engine(session, engine_id)
    variable = await session.scalar(
        select(EngineVariable)
        .where(EngineVariable.engine_id == engine_id, EngineVariable.key == key)
        .with_for_update()
    )
    sealed = encrypt(value, context=VARIABLE_CONTEXT)
    if variable is None:
        session.add(
            EngineVariable(engine_id=row.id, key=key, value_encrypted=sealed, updated_by=actor.id)
        )
        action = "engine_variable_created"
    else:
        variable.value_encrypted = sealed
        variable.updated_by = actor.id
        action = "engine_variable_updated"
    await session.flush()
    await audit.record(
        session,
        action=action,
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=row.id,
        detail={"key": key},
    )


async def delete_variable(
    session: AsyncSession, *, actor: User, engine_id: uuid.UUID, key: str
) -> None:
    row = await get_engine(session, engine_id)
    variable = await session.scalar(
        select(EngineVariable).where(
            EngineVariable.engine_id == engine_id, EngineVariable.key == key
        )
    )
    if variable is None:
        raise NotFoundError(detail="engine variable does not exist")
    await session.delete(variable)
    await session.flush()
    await audit.record(
        session,
        action="engine_variable_deleted",
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=row.id,
        detail={"key": key},
    )


# ---------------------------------------------------------------- worker contract


async def engine_spec_for(session: AsyncSession, engine_name: str) -> EngineSpec | None:
    """Connection a claimed job runs against, decrypted. None when not usable.

    Never logged (G7): the caller puts it straight into the claim response.
    """
    row = await session.scalar(select(Engine).where(Engine.name == engine_name))
    if row is None or not row.is_enabled or not row.base_url or row.api_key_encrypted is None:
        return None
    variables = await session.scalars(
        select(EngineVariable).where(EngineVariable.engine_id == row.id)
    )
    return EngineSpec.model_validate(
        {
            "name": row.name,
            "base_url": row.base_url,
            "api_key": decrypt(row.api_key_encrypted, context=API_KEY_CONTEXT),
            "variables": {
                item.key: decrypt(item.value_encrypted, context=VARIABLE_CONTEXT)
                for item in variables
            },
            "settings": row.settings,
        }
    )


# ---------------------------------------------------------------- health for S15


@dataclass(frozen=True)
class EngineHealth:
    status: Literal["ok", "degraded", "down"]
    latency_ms: int | None
    version: str | None
    # Why the engine is not `ok`: a fixed English sentence, no URL, no key.
    message: str | None


async def health_check(session: AsyncSession, engine_name: str) -> EngineHealth:
    """One health check of `GET /system/health`: reach the engine, keep `ok_since`.

    A disabled engine or one without a connection is `down` without a call.
    `ok_since` starts at the first `ok` of a run and clears on any other result:
    docs/data/schema.md.
    """
    row = await session.scalar(select(Engine).where(Engine.name == engine_name))
    if row is None:
        return EngineHealth("down", None, None, "Engine is not registered.")
    if not row.is_enabled:
        return EngineHealth("down", None, row.version, "Engine is disabled.")
    if not row.base_url or row.api_key_encrypted is None:
        return EngineHealth("down", None, row.version, "Engine has no connection set.")
    started = time.monotonic()
    structlog.contextvars.bind_contextvars(engine=row.name)
    try:
        version = await _adapter(row).check()
    except EngineUnavailableError as error:
        row.ok_since = None
        await session.flush()
        return EngineHealth("down", None, row.version, error.detail or "Engine did not answer.")
    finally:
        structlog.contextvars.unbind_contextvars("engine")
    latency = int((time.monotonic() - started) * 1000)
    if row.ok_since is None:
        row.ok_since = _now()
    if version is not None:
        row.version = version
    await session.flush()
    return EngineHealth("ok", latency, row.version, None)

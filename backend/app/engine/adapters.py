"""REST clients the engine module uses to read an engine for S16, S17.

One adapter per engine name, picked from ADAPTERS: no branch on an engine name
in the service (.claude/rules/design-patterns.md). Calls are not retried: a
screen waits on them (docs/integrations/external-services.md). Every answer is
untrusted data, checked by a Pydantic model before use.
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Annotated, Any, Final, Literal
from urllib.parse import quote

import httpx
import structlog
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError

from app.core.errors import EngineUnavailableError, NotFoundError, ValidationFailedError

TIMEOUT: Final = httpx.Timeout(10.0)
# Workflows listed per call; an engine server holds a few dozen.
WORKFLOW_LIMIT: Final = 500
TEXT_MAX: Final = 2000

log = structlog.get_logger()


def _tag_list(value: object) -> object:
    # Osmedeus keeps tags as a list in its index and as "a, b" in workflow files.
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return [] if value is None else value


Text = Annotated[str, Field(max_length=TEXT_MAX)]
Tags = Annotated[list[Annotated[str, Field(max_length=100)]], BeforeValidator(_tag_list)]


class EngineWorkflowItem(BaseModel):
    name: str
    kind: str
    step_count: int | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)


class EngineWorkflowStep(BaseModel):
    name: str
    description: str | None = None


class EngineWorkflowDetail(EngineWorkflowItem):
    steps: list[EngineWorkflowStep] = Field(default_factory=list)


class EngineModule(BaseModel):
    name: str
    kind: Literal["active", "passive"]
    is_enabled: bool
    description: str | None = None


class EngineCheckIssue(BaseModel):
    level: Literal["critical", "advisory"]
    message: str


class EngineCheckResult(BaseModel):
    ok: bool
    issues: list[EngineCheckIssue] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class LlmConfig:
    """LLM settings of an engine, decrypted key included. Never logged (G7)."""

    provider: str | None
    model: str | None
    base_url: str | None
    api_key: str | None


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Version(_Loose):
    version: Annotated[str, Field(max_length=100)] | None = None


class _OsmWorkflow(_Loose):
    name: Annotated[str, Field(min_length=1, max_length=255)]
    kind: Annotated[str, Field(max_length=50)] = "module"
    description: Text | None = None
    tags: Tags = Field(default_factory=list)
    step_count: int = 0
    module_count: int = 0
    hidden: bool = False


class _OsmWorkflowPage(_Loose):
    data: list[_OsmWorkflow] = Field(default_factory=list)


class _OsmNamed(_Loose):
    name: Annotated[str, Field(max_length=255)]


class _OsmWorkflowDetail(_Loose):
    name: Annotated[str, Field(min_length=1, max_length=255)]
    kind: Annotated[str, Field(max_length=50)] = "module"
    description: Text | None = None
    tags: Tags = Field(default_factory=list)
    steps: list[_OsmNamed] | None = None
    modules: list[_OsmNamed] | None = None


class EngineAdapter(ABC):
    """Reads one engine. `base_url` and `api_key` come decrypted from the row."""

    def __init__(
        self, base_url: str, api_key: str, *, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._transport = transport

    @abstractmethod
    def auth_headers(self) -> dict[str, str]:
        """Header carrying the API key. Never logged."""

    async def _get(self, path: str, params: dict[str, str] | None = None) -> httpx.Response:
        return await self._request("GET", path, params=params)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        async with httpx.AsyncClient(
            base_url=self._base_url,
            headers=self.auth_headers(),
            timeout=TIMEOUT,
            transport=self._transport,
            follow_redirects=False,
        ) as client:
            try:
                response = await client.request(method, path, params=params, json=body)
            except httpx.HTTPError as exc:
                log.warning("engine_call_failed", path=path, error=type(exc).__name__)
                raise EngineUnavailableError(detail="engine did not answer") from exc
        if response.status_code in (401, 403):
            log.warning("engine_call_refused", path=path, status=response.status_code)
            raise EngineUnavailableError(detail="engine refused the API key")
        return response

    async def _json[M: BaseModel](
        self, path: str, model: type[M], params: dict[str, str] | None = None
    ) -> M:
        return self._checked(path, await self._get(path, params), model)

    @staticmethod
    def _checked[M: BaseModel](path: str, response: httpx.Response, model: type[M]) -> M:
        if response.status_code != 200:
            log.warning("engine_call_failed", path=path, status=response.status_code)
            raise EngineUnavailableError(detail="engine answered with an error")
        try:
            return model.model_validate_json(response.content)
        except ValidationError as exc:
            log.warning("engine_answer_invalid", path=path)
            raise EngineUnavailableError(detail="engine answered an unexpected body") from exc

    @abstractmethod
    async def check(self) -> str | None:
        """Reach the engine with the API key. Returns the version it reports."""

    async def workflows(self) -> list[EngineWorkflowItem]:
        raise NotFoundError(detail="engine has no workflows")

    async def workflow(self, name: str) -> EngineWorkflowDetail:
        raise NotFoundError(detail="engine has no workflows")

    async def modules(self) -> list[EngineModule]:
        raise NotFoundError(detail="engine has no native modules")

    async def set_modules(self, changes: dict[str, bool]) -> list[EngineModule]:
        raise NotFoundError(detail="engine has no native modules")

    async def validate(self) -> EngineCheckResult:
        raise NotFoundError(detail="engine has no configuration check")

    async def verify_model(self, llm: LlmConfig) -> EngineCheckResult:
        raise NotFoundError(detail="engine has no LLM model")


class OsmedeusAdapter(EngineAdapter):
    def auth_headers(self) -> dict[str, str]:
        return {"x-osm-api-key": self._api_key}

    async def check(self) -> str | None:
        # /server-info answers without a key, so a listing proves the key works.
        version = await self._json("/server-info", _Version)
        await self._json("/osm/api/workflows", _OsmWorkflowPage, {"limit": "1"})
        return version.version

    async def workflows(self) -> list[EngineWorkflowItem]:
        page = await self._json(
            "/osm/api/workflows", _OsmWorkflowPage, {"limit": str(WORKFLOW_LIMIT)}
        )
        return [
            EngineWorkflowItem(
                name=item.name,
                kind=item.kind,
                # A flow chains modules, a module chains steps.
                step_count=item.module_count or item.step_count,
                description=item.description or None,
                tags=item.tags,
            )
            for item in page.data
            if not item.hidden
        ]

    async def workflow(self, name: str) -> EngineWorkflowDetail:
        response = await self._get(f"/osm/api/workflows/{quote(name, safe='')}", {"json": "true"})
        if response.status_code == 404:
            raise NotFoundError(detail="workflow does not exist on the engine")
        if response.status_code != 200:
            raise EngineUnavailableError(detail="engine answered with an error")
        try:
            detail = _OsmWorkflowDetail.model_validate_json(response.content)
        except ValidationError as exc:
            raise EngineUnavailableError(detail="engine answered an unexpected body") from exc
        parts = [*(detail.modules or []), *(detail.steps or [])]
        return EngineWorkflowDetail(
            name=detail.name,
            kind=detail.kind,
            step_count=len(parts),
            description=detail.description or None,
            tags=detail.tags,
            steps=[EngineWorkflowStep(name=part.name) for part in parts],
        )


class _VigModule(_Loose):
    id: Annotated[str, Field(min_length=1, max_length=255)]
    type: str = ""
    short_description: Text | None = None
    description: Annotated[str, Field(max_length=100_000)] | None = None


class _VigModules(_Loose):
    modules: list[_VigModule] = Field(default_factory=list)


class _VigConfigEntry(_Loose):
    key: Annotated[str, Field(max_length=500)]
    value: Annotated[str, Field(max_length=1_000_000)] | None = None


class _VigConfig(_Loose):
    entries: list[_VigConfigEntry] = Field(default_factory=list)


class _VigConfigUpdate(_Loose):
    errors: list[Any] = Field(default_factory=list)


class _VigCheck(_Loose):
    status: Annotated[str, Field(max_length=50)] = ""
    message: Text | None = None


# Config keys of the module switch, per kind: Vigolium configuration docs,
# section `dynamic-assessment`. `all` runs every module of that kind.
MODULE_CONFIG_KEYS: Final[dict[str, str]] = {
    "active": "dynamic-assessment.enabled_modules.active_modules",
    "passive": "dynamic-assessment.enabled_modules.passive_modules",
}
ALL_MODULES: Final = "all"
# A failed diagnostic on these stops a native scan; any other check is advice.
CRITICAL_CHECKS: Final = frozenset({"database"})
AGENT_CHECK: Final = "agent"
CHECK_MESSAGE_MAX: Final = 500


def _module_list(value: str | None) -> set[str] | None:
    """Module ids a config value names; None when it names every module.

    GET /api/config flattens a list to a string whose exact form the docs do not
    show: a JSON array and a comma or space separated list are both read.
    """
    text = (value or "").strip()
    items: list[str] = []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        if isinstance(parsed, list):
            items = [str(item) for item in parsed]
        else:
            items = text.strip("[]").replace(",", " ").split()
    else:
        items = text.replace(",", " ").split()
    names = {item.strip().strip("\"'") for item in items if item.strip()}
    if not names or ALL_MODULES in names:
        return None
    return names


def _check_issues(body: dict[str, Any]) -> list[tuple[str, _VigCheck]]:
    """Every named check of a diagnostics answer, `tools` unfolded."""
    checks: list[tuple[str, _VigCheck]] = []
    for name, value in body.items():
        if name == "tools" and isinstance(value, dict):
            checks.extend(
                (f"tools.{tool}", _VigCheck.model_validate(item))
                for tool, item in value.items()
                if isinstance(item, dict)
            )
        elif isinstance(value, dict) and "status" in value:
            checks.append((name, _VigCheck.model_validate(value)))
    return checks


def _issue_text(name: str, check: _VigCheck) -> str:
    # Engine text is shown as text on S17, never as markup.
    return f"{name}: {check.message or check.status}"[:CHECK_MESSAGE_MAX]


class VigoliumAdapter(EngineAdapter):
    """Vigolium REST: info, native modules, diagnostics, LLM settings.

    Native module, configuration check and LLM endpoints come from the Vigolium
    REST docs and are not checked on a real engine yet: tech debt 8.
    """

    def auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    async def check(self) -> str | None:
        return (await self._json("/api/info", _Version)).version

    async def _enabled(self) -> dict[str, set[str] | None]:
        config = await self._json(
            "/api/config", _VigConfig, {"filter": "dynamic-assessment.enabled_modules"}
        )
        values = {entry.key: entry.value for entry in config.entries}
        return {kind: _module_list(values.get(key)) for kind, key in MODULE_CONFIG_KEYS.items()}

    async def _catalog(self) -> list[_VigModule]:
        listed = await self._json("/api/modules", _VigModules)
        return [module for module in listed.modules if module.type in MODULE_CONFIG_KEYS]

    async def modules(self) -> list[EngineModule]:
        catalog = await self._catalog()
        enabled = await self._enabled()
        return [self._module(module, enabled) for module in catalog]

    @staticmethod
    def _module(module: _VigModule, enabled: dict[str, set[str] | None]) -> EngineModule:
        names = enabled.get(module.type)
        return EngineModule(
            name=module.id,
            kind="active" if module.type == "active" else "passive",
            is_enabled=names is None or module.id in names,
            description=module.short_description or None,
        )

    async def set_modules(self, changes: dict[str, bool]) -> list[EngineModule]:
        catalog = await self._catalog()
        known = {module.id for module in catalog}
        unknown = sorted(set(changes) - known)
        if unknown:
            raise ValidationFailedError(
                detail="native module does not exist on the engine",
                errors=[{"field": "modules", "code": "not_found"}],
            )
        enabled = await self._enabled()
        current = {module.id: self._module(module, enabled) for module in catalog}
        update: dict[str, str] = {}
        for kind, key in MODULE_CONFIG_KEYS.items():
            ids = [module.id for module in catalog if module.type == kind]
            on = sorted(name for name in ids if changes.get(name, current[name].is_enabled))
            if not on and ids:
                # An empty list may read as the default (every module): refuse it.
                raise ValidationFailedError(
                    detail=f"keep at least one {kind} native module enabled",
                    errors=[{"field": "modules", "code": "module_required"}],
                )
            update[key] = ALL_MODULES if len(on) == len(ids) else ",".join(on)
        response = await self._request("POST", "/api/config", body=update)
        result = self._checked("/api/config", response, _VigConfigUpdate)
        if result.errors:
            log.warning("engine_config_refused", path="/api/config", errors=len(result.errors))
            raise EngineUnavailableError(detail="engine refused the module settings")
        return await self.modules()

    async def _diagnostics(self) -> dict[str, Any]:
        response = await self._get("/api/diagnostics")
        if response.status_code != 200:
            raise EngineUnavailableError(detail="engine answered with an error")
        try:
            body = json.loads(response.content)
        except ValueError as exc:
            raise EngineUnavailableError(detail="engine answered an unexpected body") from exc
        if not isinstance(body, dict):
            raise EngineUnavailableError(detail="engine answered an unexpected body")
        return body

    async def validate(self) -> EngineCheckResult:
        try:
            checks = _check_issues(await self._diagnostics())
        except ValidationError as exc:
            raise EngineUnavailableError(detail="engine answered an unexpected body") from exc
        issues = [
            EngineCheckIssue(
                level="critical"
                if name in CRITICAL_CHECKS and check.status == "error"
                else "advisory",
                message=_issue_text(name, check),
            )
            for name, check in checks
            if check.status in ("error", "warning")
        ]
        return EngineCheckResult(
            ok=not any(issue.level == "critical" for issue in issues), issues=issues
        )

    async def verify_model(self, llm: LlmConfig) -> EngineCheckResult:
        if llm.provider is None:
            return EngineCheckResult(
                ok=False,
                issues=[EngineCheckIssue(level="critical", message="LLM provider is not set")],
            )
        update = {"agent.olium.provider": llm.provider}
        if llm.model is not None:
            update["agent.olium.model"] = llm.model
            update["agent.olium.custom_provider.model_id"] = llm.model
        if llm.base_url is not None:
            update["agent.olium.custom_provider.base_url"] = llm.base_url
        if llm.api_key is not None:
            update["agent.olium.llm_api_key"] = llm.api_key
            update["agent.olium.custom_provider.api_key"] = llm.api_key
        response = await self._request("POST", "/api/config", body=update)
        result = self._checked("/api/config", response, _VigConfigUpdate)
        if result.errors:
            # The engine's text may quote a value: it is not passed on (G7).
            log.warning("engine_config_refused", path="/api/config", errors=len(result.errors))
            return EngineCheckResult(
                ok=False,
                issues=[
                    EngineCheckIssue(level="critical", message="engine refused the LLM settings")
                ],
            )
        try:
            checks = dict(_check_issues(await self._diagnostics()))
        except ValidationError as exc:
            raise EngineUnavailableError(detail="engine answered an unexpected body") from exc
        agent = checks.get(AGENT_CHECK)
        if agent is None:
            raise EngineUnavailableError(detail="engine answered an unexpected body")
        if agent.status == "ok":
            return EngineCheckResult(ok=True)
        return EngineCheckResult(
            ok=agent.status != "error",
            issues=[
                EngineCheckIssue(
                    level="critical" if agent.status == "error" else "advisory",
                    message=_issue_text(AGENT_CHECK, agent),
                )
            ],
        )


ADAPTERS: Final[dict[str, type[EngineAdapter]]] = {
    "osmedeus": OsmedeusAdapter,
    "vigolium": VigoliumAdapter,
}

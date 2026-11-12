"""REST clients the engine module uses to read an engine for S16, S17.

One adapter per engine name, picked from ADAPTERS: no branch on an engine name
in the service (.claude/rules/design-patterns.md). Calls are not retried: a
screen waits on them (docs/integrations/external-services.md). Every answer is
untrusted data, checked by a Pydantic model before use.
"""

from abc import ABC, abstractmethod
from typing import Annotated, Final
from urllib.parse import quote

import httpx
import structlog
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError

from app.core.errors import EngineUnavailableError, NotFoundError

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
        async with httpx.AsyncClient(
            base_url=self._base_url,
            headers=self.auth_headers(),
            timeout=TIMEOUT,
            transport=self._transport,
            follow_redirects=False,
        ) as client:
            try:
                response = await client.get(path, params=params)
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
        response = await self._get(path, params)
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


class VigoliumAdapter(EngineAdapter):
    """Connection test only; modules and checks arrive with the Vigolium batch."""

    def auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    async def check(self) -> str | None:
        return (await self._json("/api/info", _Version)).version


ADAPTERS: Final[dict[str, type[EngineAdapter]]] = {
    "osmedeus": OsmedeusAdapter,
    "vigolium": VigoliumAdapter,
}

"""REST client shared by the engine runners (Osmedeus, Vigolium).

Not a runner: each engine runner subclasses `EngineClient` and sets the header
that carries its API key. Retries network errors and 5xx with capped
exponential backoff; a 4xx is the engine's answer and goes back to the caller:
.claude/rules/error-handling.md, docs/integrations/external-services.md.
"""

import time
from collections.abc import Callable
from contextlib import AbstractContextManager
from types import TracebackType
from typing import Final, Self

import httpx
import structlog
from pydantic import BaseModel, ValidationError

from contracts.tasks import EngineSpec

MAX_RETRIES: Final = 5
BACKOFF_BASE_SECONDS: Final = 1.0
BACKOFF_MAX_SECONDS: Final = 30.0
TIMEOUT: Final = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0)

log = structlog.get_logger(__name__)


class EngineError(Exception):
    """The engine refused a call or stayed unreachable after retries.

    The message names the call and the problem only: no URL, key or body.
    """

    def __init__(self, action: str, problem: str) -> None:
        super().__init__(f"engine {problem} on {action}")


def backoff(attempt: int) -> float:
    return float(min(BACKOFF_BASE_SECONDS * 2.0**attempt, BACKOFF_MAX_SECONDS))


class EngineClient(AbstractContextManager["EngineClient"]):
    """HTTP client of one engine server, from the connection handed out at claim."""

    # Engine name for the `engine` log field: .claude/rules/logging.md.
    engine: str

    def __init__(
        self,
        engine: EngineSpec,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._sleep = sleep
        self._http = httpx.Client(
            base_url=engine.base_url.rstrip("/"),
            headers=self.auth_headers(engine.api_key.get_secret_value()),
            timeout=TIMEOUT,
            transport=transport,
            follow_redirects=False,
        )

    def auth_headers(self, api_key: str) -> dict[str, str]:
        """Header carrying the API key. Never logged (G7)."""
        raise NotImplementedError

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self._http.close()

    def _send(self, request: Callable[[], httpx.Response], action: str) -> httpx.Response:
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = request()
            except httpx.TransportError as exc:
                if attempt == MAX_RETRIES:
                    raise EngineError(action, "unreachable") from exc
                log.warning(
                    "engine_call_retry", engine=self.engine, action=action, attempt=attempt + 1
                )
                self._sleep(backoff(attempt))
                continue
            if response.status_code < 500:
                return response
            if attempt == MAX_RETRIES:
                break
            log.warning(
                "engine_call_retry",
                engine=self.engine,
                action=action,
                attempt=attempt + 1,
                status=response.status_code,
            )
            self._sleep(backoff(attempt))
        raise EngineError(action, "kept failing")

    def _json[M: BaseModel](self, response: httpx.Response, model: type[M], action: str) -> M:
        if response.status_code >= 400:
            raise EngineError(action, f"status {response.status_code}")
        try:
            return model.model_validate_json(response.content)
        except ValidationError as exc:
            raise EngineError(action, "unexpected body") from exc

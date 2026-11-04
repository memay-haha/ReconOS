"""Backend API entrypoint. Module routers are mounted on the versioned router."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, status

from app.audit_log.router import router as audit_log_router
from app.core.config import get_settings
from app.core.deps import csrf_guard
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.user.router import router as user_router

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Settings are read once here, so a missing variable stops the process at
    # startup rather than on the first request: docs/ops/configuration.md
    settings = get_settings()
    configure_logging(settings.log_level)
    yield


# Only POST /auth/login and GET /health may be reached without a session, so the
# interactive docs and the schema route stay off: docs/api/architecture.md. The
# CSRF check is declared here, not per handler, so every route inherits it.
app = FastAPI(
    title="ReconOS API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
    dependencies=[Depends(csrf_guard)],
)

install_error_handlers(app)

api_router = APIRouter(prefix=API_PREFIX)


@api_router.get(
    "/health",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["system"],
    summary="Liveness probe, no authentication",
)
async def health() -> None:
    """Report that the process is alive. It checks no dependency."""
    return None


app.include_router(api_router)
app.include_router(user_router)
app.include_router(audit_log_router)

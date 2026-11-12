"""Backend API entrypoint. Module routers are mounted on the versioned router."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, status

from app.alert.router import router as alert_router
from app.asset.router import router as asset_router
from app.audit_log.router import router as audit_log_router
from app.core.config import get_settings
from app.core.crypto import get_keyring
from app.core.deps import csrf_guard
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.realtime_router import router as realtime_router
from app.core.system_setting_router import router as system_setting_router
from app.dashboard.router import router as dashboard_router
from app.dispatcher.router import router as dispatcher_router
from app.engine.router import router as engine_router
from app.finding.router import router as finding_router
from app.job.router import router as job_router
from app.parser import registry as _parser_registry  # noqa: F401  # registers parsers before any upload
from app.program.router import router as program_router
from app.raw_output.router import router as raw_output_router
from app.report.router import router as report_router
from app.schedule.router import router as schedule_router
from app.scope.router import router as scope_router
from app.screenshot.router import router as screenshot_router
from app.tag.router import router as tag_router
from app.tool_module.router import router as tool_module_router
from app.user.router import router as user_router

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Settings are read once here, so a missing variable stops the process at
    # startup rather than on the first request: docs/ops/configuration.md
    settings = get_settings()
    configure_logging(settings.log_level)
    # A malformed RECONOS_ENCRYPTION_KEYS stops startup, not the first proxy write.
    get_keyring()
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
app.include_router(program_router)
app.include_router(scope_router)
app.include_router(tool_module_router)
app.include_router(engine_router)
app.include_router(job_router)
app.include_router(raw_output_router)
app.include_router(asset_router)
app.include_router(finding_router)
app.include_router(screenshot_router)
app.include_router(tag_router)
app.include_router(schedule_router)
app.include_router(report_router)
app.include_router(dispatcher_router)
app.include_router(realtime_router)
app.include_router(alert_router)
app.include_router(dashboard_router)
app.include_router(system_setting_router)

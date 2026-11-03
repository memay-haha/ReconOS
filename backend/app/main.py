"""Backend API entrypoint. Module routers are mounted on the versioned router."""

from fastapi import APIRouter, FastAPI, status

API_PREFIX = "/api/v1"

# Only POST /auth/login and GET /health may be reached without a session, so the
# interactive docs and the schema route stay off: docs/api/architecture.md.
app = FastAPI(
    title="ReconOS API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

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

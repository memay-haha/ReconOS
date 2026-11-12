"""The shape of the HTTP surface, frozen so a later batch cannot widen it.

Three properties no single handler can keep on its own: a route is reachable
without a session only when it is named below, a mutating route always refuses
a cross-site request, and the routes the app serves are the ones
docs/api/openapi.yaml promises, with the same query parameters. The frontend
client of batch 2b is generated from that file.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import yaml
from fastapi import APIRouter
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from httpx import AsyncClient

from app.core.deps import csrf_guard, current_user
from app.core.security import UNSAFE_METHODS
from app.main import API_PREFIX, app
from app.user.service import current_worker

OPENAPI_FILE = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.yaml"

# Reachable without a session: docs/api/architecture.md.
PUBLIC: set[tuple[str, str]] = {("POST", "/auth/login"), ("GET", "/health")}

# The thirteen endpoints of batch 2a plus the liveness probe:
# docs/superpowers/specs/2026-11-03-batch2a-backend-auth-design.md
BATCH_SURFACE: set[tuple[str, str]] = {
    ("POST", "/auth/login"),
    ("POST", "/auth/logout"),
    ("GET", "/auth/me"),
    ("POST", "/auth/password"),
    ("GET", "/users"),
    ("POST", "/users"),
    ("GET", "/users/{user_id}"),
    ("PATCH", "/users/{user_id}"),
    ("POST", "/users/{user_id}/lock"),
    ("POST", "/users/{user_id}/unlock"),
    ("GET", "/users/{user_id}/sessions"),
    ("GET", "/user-sessions"),
    ("DELETE", "/user-sessions/{user_session_id}"),
    ("GET", "/audit-logs"),
    ("GET", "/health"),
    # Batch 3, program module: docs/superpowers/specs/2026-11-02-implementation-roadmap-design.md
    ("GET", "/programs"),
    ("POST", "/programs"),
    ("POST", "/programs/bulk-pause"),
    ("POST", "/programs/bulk-resume"),
    ("POST", "/programs/bulk-archive"),
    ("POST", "/programs/bulk-delete"),
    ("GET", "/programs/{program_id}"),
    ("PATCH", "/programs/{program_id}"),
    ("DELETE", "/programs/{program_id}"),
    ("POST", "/programs/{program_id}/pause"),
    ("POST", "/programs/{program_id}/resume"),
    ("POST", "/programs/{program_id}/archive"),
    ("GET", "/programs/{program_id}/users"),
    ("POST", "/programs/{program_id}/users"),
    ("DELETE", "/programs/{program_id}/users/{user_id}"),
    ("GET", "/programs/{program_id}/proxies"),
    ("POST", "/programs/{program_id}/proxies"),
    ("PATCH", "/proxies/{proxy_id}"),
    ("DELETE", "/proxies/{proxy_id}"),
    # Batch 3, scope module.
    ("GET", "/programs/{program_id}/scope-rules"),
    ("POST", "/programs/{program_id}/scope-rules"),
    ("POST", "/programs/{program_id}/scope-rules/bulk-create"),
    ("PATCH", "/scope-rules/{scope_rule_id}"),
    ("DELETE", "/scope-rules/{scope_rule_id}"),
    ("POST", "/programs/{program_id}/scope-check"),
    # Batch 4, job backbone: tool modules, jobs, raw output, dispatcher, workers.
    ("GET", "/tool-modules"),
    ("GET", "/tool-modules/stats"),
    ("GET", "/tools"),
    ("PATCH", "/tool-modules/{tool_module_id}"),
    ("GET", "/jobs"),
    ("POST", "/jobs"),
    ("POST", "/jobs/bulk-create"),
    ("POST", "/jobs/bulk-retry"),
    ("POST", "/jobs/cleanup"),
    ("GET", "/jobs/{job_id}"),
    ("POST", "/jobs/{job_id}/cancel"),
    ("POST", "/jobs/{job_id}/retry"),
    ("POST", "/jobs/{job_id}/prioritize"),
    ("GET", "/jobs/{job_id}/raw-outputs"),
    ("GET", "/raw-outputs/{raw_output_id}"),
    ("GET", "/raw-outputs/{raw_output_id}/content"),
    ("POST", "/dispatcher/wake"),
    ("GET", "/dispatcher/status"),
    ("GET", "/workers"),
    ("POST", "/workers"),
    ("POST", "/workers/{worker_id}/tokens"),
    ("POST", "/worker-tokens/{worker_token_id}/revoke"),
    # The worker contract: a worker token, never a session.
    ("POST", "/worker/heartbeat"),
    ("POST", "/worker/logs"),
    ("POST", "/worker/jobs/{job_id}/claim"),
    ("POST", "/worker/jobs/{job_id}/heartbeat"),
    ("POST", "/worker/jobs/{job_id}/finish"),
    ("PUT", "/worker/jobs/{job_id}/raw-outputs/{filename}"),
    # Batch 5, engine connection and variables (S16, S17).
    ("GET", "/engines"),
    ("PATCH", "/engines/{engine_id}"),
    ("POST", "/engines/{engine_id}/test"),
    ("GET", "/engines/{engine_id}/workflows"),
    ("GET", "/engines/{engine_id}/workflows/{name}"),
    ("GET", "/engines/{engine_id}/variables"),
    ("PUT", "/engines/{engine_id}/variables/{key}"),
    ("DELETE", "/engines/{engine_id}/variables/{key}"),
    # Batch 9, Vigolium native modules and checks.
    ("GET", "/engines/{engine_id}/modules"),
    ("PATCH", "/engines/{engine_id}/modules"),
    ("POST", "/engines/{engine_id}/validate"),
    ("POST", "/engines/{engine_id}/verify-model"),
    # Batch 5, asset, tag and parse.
    ("POST", "/raw-outputs/{raw_output_id}/reparse"),
    ("GET", "/domains"),
    ("GET", "/domains/export"),
    ("GET", "/domains/summary"),
    ("POST", "/domains/bulk-delete"),
    ("GET", "/domains/{domain_id}"),
    ("DELETE", "/domains/{domain_id}"),
    ("GET", "/domains/{domain_id}/activity"),
    ("GET", "/ips"),
    ("GET", "/ips/export"),
    ("GET", "/ips/{ip_id}"),
    ("GET", "/urls"),
    ("GET", "/urls/export"),
    ("GET", "/urls/{url_id}"),
    ("GET", "/services"),
    ("GET", "/services/export"),
    ("GET", "/services/{service_id}"),
    ("GET", "/asset-events"),
    ("GET", "/technologies"),
    ("GET", "/tags"),
    ("POST", "/tags"),
    ("DELETE", "/tags/{tag_id}"),
    ("POST", "/asset-tags"),
    ("POST", "/asset-tags/bulk-create"),
    ("DELETE", "/asset-tags/{asset_tag_id}"),
    # Batch 6: findings and their triage.
    ("GET", "/findings"),
    ("GET", "/findings/export"),
    ("GET", "/findings/summary"),
    ("GET", "/findings/{finding_id}"),
    ("PATCH", "/findings/{finding_id}"),
    ("POST", "/findings/bulk-triage"),
    ("PUT", "/findings/{finding_id}/tags"),
}
# Reachable with a worker token only: docs/integrations/external-services.md.
WORKER_PREFIX = "/worker/"
MUTATING = sorted(pair for pair in BATCH_SURFACE if pair[0] in UNSAFE_METHODS)


def _api_routes(router: APIRouter) -> Iterator[APIRoute]:
    """Every APIRoute, through the wrapper an included router is held in."""
    for route in getattr(router, "routes", []):
        if isinstance(route, APIRoute):
            yield route
        else:
            included = getattr(route, "original_router", None)
            if included is not None:
                yield from _api_routes(included)


def _served() -> dict[tuple[str, str], APIRoute]:
    return {
        (method, route.path.removeprefix(API_PREFIX)): route
        for route in _api_routes(app.router)
        for method in (route.methods or set()) - {"HEAD", "OPTIONS"}
    }


def _dependency_calls(dependant: Dependant) -> set[Any]:
    found: set[Any] = set() if dependant.call is None else {dependant.call}
    for sub in dependant.dependencies:
        found |= _dependency_calls(sub)
    return found


def _spec() -> dict[str, Any]:
    return dict(yaml.safe_load(OPENAPI_FILE.read_text(encoding="utf-8")))


def _query_names(spec: dict[str, Any], entries: list[dict[str, Any]] | None) -> set[str]:
    names: set[str] = set()
    for entry in entries or []:
        reference = entry.get("$ref")
        resolved = (
            spec["components"]["parameters"][reference.rsplit("/", 1)[-1]]
            if reference is not None
            else entry
        )
        if resolved.get("in") == "query":
            names.add(str(resolved["name"]))
    return names


def _url(path: str) -> str:
    return f"{API_PREFIX}{path}".replace("{user_id}", str(uuid.uuid4())).replace(
        "{user_session_id}", str(uuid.uuid4())
    )


def test_the_served_surface_is_exactly_this_batch() -> None:
    assert set(_served()) == BATCH_SURFACE


@pytest.mark.parametrize(("method", "path"), sorted(BATCH_SURFACE))
def test_a_route_outside_the_allowlist_needs_a_session(method: str, path: str) -> None:
    calls = _dependency_calls(_served()[(method, path)].dependant)
    is_worker_route = path.startswith(WORKER_PREFIX)
    # A worker route takes the worker token and never a session; every other
    # route outside the public allowlist takes a session.
    assert (current_worker in calls) is is_worker_route
    assert (current_user in calls) is ((method, path) not in PUBLIC and not is_worker_route)


def test_csrf_is_declared_for_the_whole_application() -> None:
    # Declared once, not per handler, so a handler added later inherits it and
    # cannot be CSRF-open by forgetting a line: app/core/deps.py.
    assert csrf_guard in {item.dependency for item in app.router.dependencies}


@pytest.mark.parametrize(("method", "path"), MUTATING)
async def test_every_mutating_route_refuses_a_cross_site_request(
    client: AsyncClient, method: str, path: str
) -> None:
    # No session and no body: the check runs before either, so this answers
    # 403 rather than 401 or 422 on every mutating route.
    response = await client.request(method, _url(path), headers={"origin": "https://evil.example"})
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_the_documented_surface_covers_the_served_one() -> None:
    spec = _spec()
    documented = {
        (method.upper(), path)
        for path, operations in spec["paths"].items()
        for method in operations
        if method != "parameters"
    }
    assert documented >= BATCH_SURFACE


@pytest.mark.parametrize(("method", "path"), sorted(BATCH_SURFACE))
def test_the_documented_query_parameters_match_the_handler(method: str, path: str) -> None:
    spec = _spec()
    entry = spec["paths"][path]
    documented = _query_names(spec, entry.get("parameters")) | _query_names(
        spec, entry[method.lower()].get("parameters")
    )
    generated = app.openapi()["paths"][f"{API_PREFIX}{path}"][method.lower()]
    assert documented == _query_names(spec, generated.get("parameters"))

"""Scope and assets: matched domain count and the recompute task (debt 44)."""

from collections.abc import Awaitable, Callable

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.asset.ingest import Provenance
from app.asset.models import Domain
from app.asset.schemas import DomainRecord, IngestBatch
from app.core.identity import User, UserRole
from app.core.tasks import RECOMPUTE_IN_SCOPE_TASK, pending_tasks
from tests.factories import make_program, make_scope_rule

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


async def test_matched_domain_count_follows_rule_matching(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    await asset_service.ingest(
        db_session,
        IngestBatch(
            domains=[
                DomainRecord(name=name)
                for name in ("example.com", "a.example.com", "b.example.com", "x.example_com.org")
            ]
        ),
        Provenance(program.id, None, None),
        [],
    )
    await db_session.execute(
        update(Domain)
        .where(Domain.program_id == program.id, Domain.name == "b.example.com")
        .values(deleted_at=Domain.first_seen_at)
    )
    await make_scope_rule(db_session, program, "example.com")
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    await make_scope_rule(db_session, program, "192.0.2.0/24", rule_type="cidr")
    rows = (await client.get(f"{API}/programs/{program.id}/scope-rules")).json()["items"]
    counts = {row["value"]: row["matched_domain_count"] for row in rows}
    # The wildcard covers subdomains only; the soft-deleted one does not count.
    assert counts == {"example.com": 1, "*.example.com": 1, "192.0.2.0/24": 0}


async def test_every_rule_change_queues_the_recompute(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)

    def queued() -> list[str]:
        return [
            task.kwargs["program_id"]
            for task in pending_tasks(db_session)
            if task.name == RECOMPUTE_IN_SCOPE_TASK
        ]

    created = await client.post(
        f"{API}/programs/{program.id}/scope-rules",
        json={"scope_type": "in_scope", "rule_type": "domain", "value": "example.com"},
        headers=HEADERS,
    )
    assert created.status_code == 200
    assert queued() == [str(program.id)]
    rule_id = created.json()["id"]
    patched = await client.patch(
        f"{API}/scope-rules/{rule_id}", json={"value": "example.org"}, headers=HEADERS
    )
    assert patched.status_code == 200
    assert "matched_domain_count" not in patched.json()
    assert (await client.delete(f"{API}/scope-rules/{rule_id}", headers=HEADERS)).status_code == 204
    assert queued() == [str(program.id)] * 3

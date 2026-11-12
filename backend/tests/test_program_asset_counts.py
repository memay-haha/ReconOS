"""Computed fields of GET /programs from the asset and job tables (debt 47), and
the object purge after a hard delete (debt 45)."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.asset.ingest import Provenance
from app.asset.schemas import AddressRecord, DomainRecord, IngestBatch, ServiceRecord, UrlRecord
from app.core.identity import User, UserRole
from app.core.tasks import PURGE_PROGRAM_OBJECTS_TASK, pending_tasks
from tests.factories import make_job, make_program, make_scope_rule, nuclei

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


async def test_program_row_counts_its_assets(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, name="counted-program")
    empty = await make_program(db_session, name="counted-empty")
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    rules = await asset_service.load_scope_rules(db_session, program.id)
    await asset_service.ingest(
        db_session,
        IngestBatch(
            domains=[
                DomainRecord(
                    name="a.example.com",
                    addresses=[AddressRecord(address="192.0.2.1", record_type="a")],
                ),
                DomainRecord(name="b.example.org"),
            ],
            services=[
                ServiceRecord(address="192.0.2.1", port=443),
                ServiceRecord(address="192.0.2.2", port=443),
            ],
            urls=[UrlRecord(url="https://a.example.com/")],
        ),
        Provenance(program.id, None, None),
        rules,
    )
    finished = datetime(2026, 11, 1, tzinfo=UTC)
    await make_job(
        db_session, program, await nuclei(db_session), status="completed", finished_at=finished
    )
    row = (await client.get(f"{API}/programs/{program.id}")).json()
    assert (row["domain_count"], row["ip_count"], row["url_count"], row["service_count"]) == (
        2,
        2,
        1,
        2,
    )
    assert row["ip_resolved_count"] == 2
    assert row["service_port_count"] == 1
    assert row["scope_coverage"] == 0.5
    assert row["assets_new_today"] == {"domain": 2, "url": 1}
    assert row["last_job_finished_at"].startswith("2026-11-01")
    blank = (await client.get(f"{API}/programs/{empty.id}")).json()
    assert blank["domain_count"] == 0 and blank["scope_coverage"] is None

    listed = (
        await client.get(f"{API}/programs", params={"q": "counted-", "sort": "-domain_count"})
    ).json()["items"]
    assert [item["name"] for item in listed] == ["counted-program", "counted-empty"]
    with_domains = (
        await client.get(f"{API}/programs", params={"q": "counted-", "has_domain": "true"})
    ).json()["items"]
    assert [item["name"] for item in with_domains] == ["counted-program"]


async def test_hard_delete_queues_the_object_purge(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    program = await make_program(db_session)
    response = await client.delete(f"{API}/programs/{program.id}", headers=HEADERS)
    assert response.status_code == 204
    purges = [
        task.kwargs for task in pending_tasks(db_session) if task.name == PURGE_PROGRAM_OBJECTS_TASK
    ]
    assert purges == [{"program_id": str(program.id)}]

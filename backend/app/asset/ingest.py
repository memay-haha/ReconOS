"""Writing assets: batched upserts for the parser and the scope recompute.

Rules: docs/data/database.md, sections Upsert và khử trùng lặp and Đánh dấu scope.

- Each table is written with `INSERT ... ON CONFLICT` on its natural key, so
  parsing the same raw output twice adds no row.
- A new asset writes an `asset_event` of type `discovered`. A seen asset whose
  descriptive columns change writes `changed` with the old and new values. A
  seen asset with nothing new only moves `last_seen_at`.
- A column the tool did not report keeps its stored value: a later, poorer
  tool never erases what an earlier one found.
- An asset outside the program scope is still written, with `in_scope` false.
- A soft-deleted domain keeps `deleted_at`: it stays hidden and writes no event.

Only called from services and tasks; the transaction belongs to the caller.
"""

import hashlib
import ipaddress
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import SplitResult, urlsplit, urlunsplit

from sqlalchemy import ColumnElement, func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.asset.models import (
    AssetEvent,
    AssetEventType,
    AssetType,
    DnsStatus,
    Domain,
    DomainIp,
    Ip,
    Service,
    Technology,
    Url,
    UrlTechnology,
)
from app.asset.schemas import (
    DomainRecord,
    IngestBatch,
    IngestResult,
    IpRecord,
    ServiceRecord,
    UrlRecord,
)
from app.scope import service as scope_service
from app.scope.matching import Rule, RuleType, ScopeType, decide

# Rows per INSERT. Bounded so one statement stays well under the 32767 bind
# parameters asyncpg allows, whatever the number of columns.
BATCH_SIZE = 500
_DEFAULT_PORT = {"http": 80, "https": 443}


@dataclass(frozen=True)
class Provenance:
    """Where the assets of one parse come from: traced back by asset_event (G3, G6)."""

    program_id: uuid.UUID
    job_id: uuid.UUID | None
    raw_output_id: uuid.UUID | None


def _chunks[T](items: Sequence[T], size: int = BATCH_SIZE) -> Iterable[Sequence[T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


# ---------------------------------------------------------------- canonical values


def canonical_domain(raw: str) -> str | None:
    """Lower case, no trailing dot, plain hostname labels. None when unreadable."""
    name = raw.strip().rstrip(".").lower()
    if name.startswith("*."):
        name = name[2:]
    if not name or len(name) > 253 or not name.isascii():
        return None
    labels = name.split(".")
    for label in labels:
        if not label or len(label) > 63 or label[0] == "-" or label[-1] == "-":
            return None
        if not all(ch.isalnum() or ch in "-_" for ch in label):
            return None
    if len(labels) < 2 or _looks_like_ip(name):
        return None
    return name


def _looks_like_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def canonical_ip(raw: str) -> str | None:
    """Compressed text form of an IPv4 or IPv6 address. None when unreadable."""
    try:
        address = ipaddress.ip_address(raw.strip().strip("[]"))
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return str(address.ipv4_mapped)
    return str(address)


@dataclass(frozen=True)
class CanonicalUrl:
    url: str
    url_hash: bytes
    scheme: str
    host: str
    port: int
    path: str


def canonical_url(raw: str) -> CanonicalUrl | None:
    """Scheme and host lower case, default port and fragment dropped: docs/data/database.md."""
    try:
        parts: SplitResult = urlsplit(raw.strip())
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    if scheme not in _DEFAULT_PORT or not host:
        return None
    if canonical_ip(host) is None and canonical_domain(host) is None:
        return None
    effective_port = port if port is not None else _DEFAULT_PORT[scheme]
    shown_host = f"[{host}]" if ":" in host else host
    netloc = shown_host if effective_port == _DEFAULT_PORT[scheme] else f"{shown_host}:{port}"
    path = parts.path or "/"
    url = urlunsplit((scheme, netloc, path, parts.query, ""))
    return CanonicalUrl(
        url=url,
        url_hash=hashlib.sha256(url.encode("utf-8")).digest(),
        scheme=scheme,
        host=host,
        port=effective_port,
        path=path,
    )


def apex_of(name: str, rules: Sequence[Rule]) -> str:
    """The registrable root of a name.

    No public suffix list ships with the backend, so the base of the longest
    In-Scope domain or wildcard rule covering the name is taken first; it is
    the root the program declared. Otherwise the last two labels.
    """
    best: str | None = None
    for rule in rules:
        if rule.scope_type is not ScopeType.IN_SCOPE or rule.rule_type not in (
            RuleType.DOMAIN,
            RuleType.WILDCARD,
        ):
            continue
        base = rule.value.removeprefix("*.")
        if (name == base or name.endswith(f".{base}")) and (best is None or len(base) > len(best)):
            best = base
    return best or ".".join(name.split(".")[-2:])


def _in_scope(rules: Sequence[Rule], target: str) -> bool:
    return decide(rules, target).allowed


# ---------------------------------------------------------------- generic upsert


@dataclass(frozen=True)
class _Upserted:
    ids: dict[tuple[Any, ...], uuid.UUID]
    new: int


def _changes(
    before: dict[str, Any], after: dict[str, Any], columns: Sequence[str]
) -> dict[str, Any]:
    diff: dict[str, Any] = {}
    for column in columns:
        new_value = after.get(column)
        if new_value is None:
            continue
        old_value = before.get(column)
        if _comparable(old_value) != _comparable(new_value):
            diff[column] = {"old": _json_value(old_value), "new": _json_value(new_value)}
    return diff


def _comparable(value: object) -> object:
    return str(value) if isinstance(value, ipaddress.IPv4Address | ipaddress.IPv6Address) else value


def _json_value(value: object) -> object:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _key_value(value: object) -> object:
    # asyncpg answers inet as an ipaddress object; keys are compared as text.
    return str(value) if isinstance(value, ipaddress.IPv4Address | ipaddress.IPv6Address) else value


async def _upsert(
    session: AsyncSession,
    model: type[Domain] | type[Ip] | type[Service] | type[Url],
    *,
    key: Sequence[str],
    describe: Sequence[str],
    always: Sequence[str],
    rows: Sequence[dict[str, Any]],
    asset_type: AssetType,
    origin: Provenance,
    unset: dict[str, Any] | None = None,
    read: Sequence[str] = (),
) -> _Upserted:
    """Upsert rows sharing one natural key and write their asset events.

    `describe`: columns kept when the new value is None, compared for `changed`.
    `unset`: for a NOT NULL column, the value that means "not reported": the
    stored value wins over it, as over None.
    `always`: columns overwritten every time, never compared (`in_scope`).
    `read`: extra stored columns the skip rules need (`deleted_at`).
    """
    unset = unset or {}
    ids: dict[tuple[Any, ...], uuid.UUID] = {}
    new = 0
    table = model.__table__
    key_columns = [table.c[name] for name in key]
    # Sorted, so two parses of one program lock rows in the same order.
    ordered = sorted(rows, key=lambda row: tuple(str(row[name]) for name in key))
    for chunk in _chunks(ordered):
        keys = [tuple(row[name] for name in key) for row in chunk]
        existing_rows = (
            await session.execute(
                select(
                    table.c.id,
                    *key_columns,
                    *[table.c[name] for name in (*describe, *read)],
                ).where(tuple_(*key_columns).in_(keys))
            )
        ).mappings()
        existing = {
            tuple(_key_value(row[name]) for name in key): dict(row) for row in existing_rows
        }
        statement = insert(model).values(list(chunk))
        excluded = statement.excluded
        updates: dict[str, ColumnElement[Any]] = {
            name: func.coalesce(
                func.nullif(excluded[name], unset[name]) if name in unset else excluded[name],
                table.c[name],
            )
            for name in describe
        }
        updates.update({name: excluded[name] for name in always})
        updates["last_seen_at"] = func.now()
        statement = statement.on_conflict_do_update(index_elements=key_columns, set_=updates)
        returned = await session.execute(statement.returning(table.c.id, *key_columns))
        events: list[dict[str, Any]] = []
        rows_by_key = {tuple(_key_value(row[name]) for name in key): row for row in chunk}
        for returned_row in returned.mappings():
            row_key = tuple(_key_value(returned_row[name]) for name in key)
            asset_id: uuid.UUID = returned_row["id"]
            ids[row_key] = asset_id
            before = existing.get(row_key)
            if before is not None and before.get("deleted_at") is not None:
                continue
            if before is None:
                new += 1
                events.append(_event(asset_type, asset_id, AssetEventType.DISCOVERED, None, origin))
                continue
            reported = {
                name: value
                for name, value in rows_by_key[row_key].items()
                if name not in unset or value != unset[name]
            }
            diff = _changes(before, reported, describe)
            if diff:
                events.append(_event(asset_type, asset_id, AssetEventType.CHANGED, diff, origin))
        if events:
            await session.execute(insert(AssetEvent).values(events))
    return _Upserted(ids=ids, new=new)


def _event(
    asset_type: AssetType,
    asset_id: uuid.UUID,
    event_type: AssetEventType,
    diff: dict[str, Any] | None,
    origin: Provenance,
) -> dict[str, Any]:
    return {
        "program_id": origin.program_id,
        f"{asset_type.value}_id": asset_id,
        "event_type": event_type.value,
        "job_id": origin.job_id,
        "raw_output_id": origin.raw_output_id,
        "diff": diff,
    }


def _merge(rows: Iterable[dict[str, Any]], key: Sequence[str]) -> list[dict[str, Any]]:
    """One row per key: a later non-null value wins, so ON CONFLICT sees each key once."""
    merged: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in rows:
        row_key = tuple(row[name] for name in key)
        current = merged.get(row_key)
        if current is None:
            merged[row_key] = dict(row)
        else:
            current.update({name: value for name, value in row.items() if value is not None})
    return list(merged.values())


# ---------------------------------------------------------------- per table


async def _upsert_ips(
    session: AsyncSession, records: Sequence[IpRecord], rules: Sequence[Rule], origin: Provenance
) -> tuple[dict[str, uuid.UUID], int]:
    rows: list[dict[str, Any]] = []
    for record in records:
        address = canonical_ip(record.address)
        if address is None:
            continue
        rows.append(
            {
                "program_id": origin.program_id,
                "address": address,
                "asn": record.asn,
                "asn_org": record.asn_org,
                "country": record.country,
                "cdn_name": record.cdn_name,
                "ptr": record.ptr,
                "is_private": ipaddress.ip_address(address).is_private,
                "in_scope": _in_scope(rules, address),
            }
        )
    result = await _upsert(
        session,
        Ip,
        key=("program_id", "address"),
        describe=("asn", "asn_org", "country", "cdn_name", "ptr"),
        always=("in_scope", "is_private"),
        rows=_merge(rows, ("program_id", "address")),
        asset_type=AssetType.IP,
        origin=origin,
    )
    return {str(row_key[1]): asset_id for row_key, asset_id in result.ids.items()}, result.new


async def _upsert_domains(
    session: AsyncSession,
    records: Sequence[DomainRecord],
    rules: Sequence[Rule],
    origin: Provenance,
) -> tuple[dict[str, uuid.UUID], int]:
    rows: list[dict[str, Any]] = []
    for record in records:
        name = canonical_domain(record.name)
        if name is None:
            continue
        cname = canonical_domain(record.cname) if record.cname else None
        dns_status = record.dns_status
        if dns_status is None and record.addresses:
            dns_status = DnsStatus.RESOLVED
        rows.append(
            {
                "program_id": origin.program_id,
                "name": name,
                "apex": apex_of(name, rules),
                "cname": cname,
                "dns_status": dns_status.value if dns_status is not None else None,
                "is_wildcard": record.is_wildcard,
                "in_scope": _in_scope(rules, name),
            }
        )
    merged = _merge(rows, ("program_id", "name"))
    for row in merged:
        # NOT NULL columns: the insert needs a value, the update ignores it.
        if row["dns_status"] is None:
            row["dns_status"] = DnsStatus.UNKNOWN.value
        if row["is_wildcard"] is None:
            row["is_wildcard"] = False
    result = await _upsert(
        session,
        Domain,
        key=("program_id", "name"),
        describe=("cname", "dns_status", "is_wildcard"),
        unset={"dns_status": DnsStatus.UNKNOWN.value, "is_wildcard": False},
        always=("in_scope", "apex"),
        read=("deleted_at",),
        rows=merged,
        asset_type=AssetType.DOMAIN,
        origin=origin,
    )
    return {str(row_key[1]): asset_id for row_key, asset_id in result.ids.items()}, result.new


async def _link_domain_ips(
    session: AsyncSession,
    records: Sequence[DomainRecord],
    domain_ids: dict[str, uuid.UUID],
    ip_ids: dict[str, uuid.UUID],
) -> None:
    links: dict[tuple[uuid.UUID, uuid.UUID, str], dict[str, Any]] = {}
    for record in records:
        name = canonical_domain(record.name)
        domain_id = domain_ids.get(name or "")
        if domain_id is None:
            continue
        for address in record.addresses:
            ip_id = ip_ids.get(canonical_ip(address.address) or "")
            if ip_id is None:
                continue
            key = (domain_id, ip_id, address.record_type.value)
            links[key] = {"domain_id": key[0], "ip_id": key[1], "record_type": key[2]}
    ordered = sorted(links.values(), key=lambda row: (str(row["domain_id"]), str(row["ip_id"])))
    for chunk in _chunks(ordered):
        statement = insert(DomainIp).values(list(chunk))
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[DomainIp.domain_id, DomainIp.ip_id, DomainIp.record_type],
                set_={"last_seen_at": func.now()},
            )
        )


async def _upsert_services(
    session: AsyncSession,
    records: Sequence[ServiceRecord],
    ip_ids: dict[str, uuid.UUID],
    rules: Sequence[Rule],
    origin: Provenance,
) -> int:
    rows: list[dict[str, Any]] = []
    for record in records:
        address = canonical_ip(record.address)
        ip_id = ip_ids.get(address or "")
        if address is None or ip_id is None:
            continue
        rows.append(
            {
                "program_id": origin.program_id,
                "ip_id": ip_id,
                "port": record.port,
                "transport": record.transport.value,
                "name": record.name,
                "product": record.product,
                "version": record.version,
                "banner": record.banner,
                "in_scope": _in_scope(rules, address),
                # Seen open again: the next port scan decides closure.
                "closed_at": None,
            }
        )
    result = await _upsert(
        session,
        Service,
        key=("ip_id", "port", "transport"),
        describe=("name", "product", "version", "banner"),
        always=("in_scope", "closed_at"),
        rows=_merge(rows, ("ip_id", "port", "transport")),
        asset_type=AssetType.SERVICE,
        origin=origin,
    )
    return result.new


async def _upsert_urls(
    session: AsyncSession,
    records: Sequence[UrlRecord],
    domain_ids: dict[str, uuid.UUID],
    ip_ids: dict[str, uuid.UUID],
    rules: Sequence[Rule],
    origin: Provenance,
) -> int:
    rows: list[dict[str, Any]] = []
    technologies: dict[bytes, list[tuple[str, str | None, str | None]]] = {}
    for record in records:
        canonical = canonical_url(record.url)
        if canonical is None:
            continue
        address = canonical_ip(canonical.host)
        rows.append(
            {
                "program_id": origin.program_id,
                "url": canonical.url,
                "url_hash": canonical.url_hash,
                "scheme": canonical.scheme,
                "host": canonical.host,
                "port": canonical.port,
                "path": canonical.path,
                "domain_id": None if address else domain_ids.get(canonical.host),
                "ip_id": ip_ids.get(address) if address else None,
                "status_code": record.status_code,
                "title": record.title,
                "content_length": record.content_length,
                "content_type": record.content_type,
                "webserver": record.webserver,
                "favicon_hash": record.favicon_hash,
                "tls_not_after": record.tls_not_after,
                "in_scope": _in_scope(rules, canonical.url),
            }
        )
        if record.technologies:
            technologies.setdefault(canonical.url_hash, []).extend(
                (tech.name, tech.version, tech.category) for tech in record.technologies
            )
    result = await _upsert(
        session,
        Url,
        key=("program_id", "url_hash"),
        describe=(
            "domain_id",
            "ip_id",
            "status_code",
            "title",
            "content_length",
            "content_type",
            "webserver",
            "favicon_hash",
            "tls_not_after",
        ),
        always=("in_scope",),
        rows=_merge(rows, ("program_id", "url_hash")),
        asset_type=AssetType.URL,
        origin=origin,
    )
    url_ids = {row_key[1]: asset_id for row_key, asset_id in result.ids.items()}
    await _link_technologies(session, technologies, url_ids)
    return result.new


async def _link_technologies(
    session: AsyncSession,
    found: dict[bytes, list[tuple[str, str | None, str | None]]],
    url_ids: dict[bytes, uuid.UUID],
) -> None:
    catalogue: dict[str, str | None] = {}
    for entries in found.values():
        for name, _, category in entries:
            catalogue[name] = catalogue.get(name) or category
    if not catalogue:
        return
    names = sorted(catalogue)
    for chunk in _chunks(names):
        statement = insert(Technology).values(
            [{"name": name, "category": catalogue[name]} for name in chunk]
        )
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[Technology.name],
                set_={"category": func.coalesce(Technology.category, statement.excluded.category)},
            )
        )
    technology_ids = {
        row.name: row.id
        for row in await session.execute(
            select(Technology.id, Technology.name).where(Technology.name.in_(names))
        )
    }
    links: dict[tuple[uuid.UUID, uuid.UUID], dict[str, Any]] = {}
    for url_hash, entries in found.items():
        url_id = url_ids.get(url_hash)
        if url_id is None:
            continue
        for name, version, _ in entries:
            key = (url_id, technology_ids[name])
            previous = links.get(key)
            links[key] = {
                "url_id": key[0],
                "technology_id": key[1],
                "version": version or (previous or {}).get("version"),
            }
    ordered = sorted(
        links.values(), key=lambda row: (str(row["url_id"]), str(row["technology_id"]))
    )
    for link_chunk in _chunks(ordered):
        link_statement = insert(UrlTechnology).values(list(link_chunk))
        await session.execute(
            link_statement.on_conflict_do_update(
                index_elements=[UrlTechnology.url_id, UrlTechnology.technology_id],
                set_={
                    "version": func.coalesce(
                        link_statement.excluded.version, UrlTechnology.version
                    ),
                    "last_seen_at": func.now(),
                },
            )
        )


# ---------------------------------------------------------------- entry points


def _addresses_of(batch: IngestBatch) -> list[IpRecord]:
    """IPs named only inside a domain or service record still get their own row."""
    implied = [
        IpRecord(address=address.address)
        for record in batch.domains
        for address in record.addresses
    ]
    implied += [IpRecord(address=record.address) for record in batch.services]
    for record in batch.urls:
        canonical = canonical_url(record.url)
        if canonical is not None and canonical_ip(canonical.host) is not None:
            implied.append(IpRecord(address=canonical.host))
    # Explicit records last, so their details win the merge.
    return implied + list(batch.ips)


def _domains_of(batch: IngestBatch) -> list[DomainRecord]:
    """The host of every URL that is a name is a domain of the program too."""
    implied = []
    for record in batch.urls:
        canonical = canonical_url(record.url)
        if canonical is not None and canonical_ip(canonical.host) is None:
            implied.append(DomainRecord(name=canonical.host))
    return implied + list(batch.domains)


async def ingest(
    session: AsyncSession, batch: IngestBatch, origin: Provenance, rules: Sequence[Rule]
) -> IngestResult:
    """Write one batch of parsed assets. `rules` comes from `load_scope_rules`."""
    ip_ids, new_ips = await _upsert_ips(session, _addresses_of(batch), rules, origin)
    domains = _domains_of(batch)
    domain_ids, new_domains = await _upsert_domains(session, domains, rules, origin)
    await _link_domain_ips(session, domains, domain_ids, ip_ids)
    new_services = await _upsert_services(session, batch.services, ip_ids, rules, origin)
    new_urls = await _upsert_urls(session, batch.urls, domain_ids, ip_ids, rules, origin)
    return IngestResult(domain=new_domains, ip=new_ips, url=new_urls, service=new_services)


async def load_scope_rules(session: AsyncSession, program_id: uuid.UUID) -> list[Rule]:
    return await scope_service.load_rules(session, program_id)


# ---------------------------------------------------------------- scope recompute

RECOMPUTE_CHUNK = 1000


async def _recompute_table(
    session: AsyncSession,
    program_id: uuid.UUID,
    model: type[Domain] | type[Ip] | type[Url],
    target_column: InstrumentedAttribute[str],
    rules: Sequence[Rule],
) -> int:
    changed = 0
    last_id: uuid.UUID | None = None
    while True:
        stmt = (
            select(model.id, target_column, model.in_scope)
            .where(model.program_id == program_id)
            .order_by(model.id)
            .limit(RECOMPUTE_CHUNK)
        )
        if last_id is not None:
            stmt = stmt.where(model.id > last_id)
        rows = list(await session.execute(stmt))
        if not rows:
            return changed
        last_id = rows[-1][0]
        flips = {
            row[0]: verdict for row in rows if (verdict := _in_scope(rules, str(row[1]))) != row[2]
        }
        for value in (True, False):
            ids = [asset_id for asset_id, verdict in flips.items() if verdict is value]
            if ids:
                await session.execute(update(model).where(model.id.in_(ids)).values(in_scope=value))
        changed += len(flips)


async def recompute_in_scope(session: AsyncSession, program_id: uuid.UUID) -> int:
    """Re-mark every asset of the program against its current rules. Returns rows changed."""
    rules = await scope_service.load_rules(session, program_id)
    changed = await _recompute_table(session, program_id, Domain, Domain.name, rules)
    changed += await _recompute_table(session, program_id, Ip, Ip.address, rules)
    changed += await _recompute_table(session, program_id, Url, Url.url, rules)
    # A service follows its IP: docs/data/database.md, section Đánh dấu scope.
    result = await session.execute(
        update(Service)
        .where(
            Service.program_id == program_id,
            Service.ip_id == Ip.id,
            Service.in_scope.is_distinct_from(Ip.in_scope),
        )
        .values(in_scope=Ip.in_scope)
        .returning(Service.id)
    )
    return changed + len(result.all())


# ---------------------------------------------------------------- locating written assets


@dataclass(frozen=True)
class Located:
    """The row an ingest record landed on, for tables that link one asset."""

    asset_type: AssetType
    asset_id: uuid.UUID


async def locate(
    session: AsyncSession,
    program_id: uuid.UUID,
    records: Sequence[DomainRecord | IpRecord | ServiceRecord | UrlRecord],
) -> list[Located | None]:
    """The asset row of each record, in order, by natural key: call after `ingest`.

    None for a record whose value does not canonicalise, which `ingest` skipped
    too. A soft-deleted domain is still found: links to it stay (D5).
    """
    names = {n for r in records if isinstance(r, DomainRecord) if (n := canonical_domain(r.name))}
    addresses = {
        a
        for r in records
        if isinstance(r, IpRecord | ServiceRecord)
        if (a := canonical_ip(r.address))
    }
    urls = {c.url_hash for r in records if isinstance(r, UrlRecord) if (c := canonical_url(r.url))}
    domain_ids: dict[str, uuid.UUID] = {}
    ip_ids: dict[str, uuid.UUID] = {}
    url_ids: dict[bytes, uuid.UUID] = {}
    service_ids: dict[tuple[uuid.UUID, int, str], uuid.UUID] = {}
    for names_chunk in _chunks(sorted(names)):
        for row_id, name in await session.execute(
            select(Domain.id, Domain.name).where(
                Domain.program_id == program_id, Domain.name.in_(names_chunk)
            )
        ):
            domain_ids[name] = row_id
    for address_chunk in _chunks(sorted(addresses)):
        for row_id, address in await session.execute(
            select(Ip.id, func.host(Ip.address)).where(
                Ip.program_id == program_id, func.host(Ip.address).in_(address_chunk)
            )
        ):
            ip_ids[address] = row_id
    for hash_chunk in _chunks(sorted(urls)):
        for row_id, url_hash in await session.execute(
            select(Url.id, Url.url_hash).where(
                Url.program_id == program_id, Url.url_hash.in_(hash_chunk)
            )
        ):
            url_ids[url_hash] = row_id
    service_keys = sorted(
        {
            (ip_ids[a], r.port, r.transport.value)
            for r in records
            if isinstance(r, ServiceRecord)
            if (a := canonical_ip(r.address)) and a in ip_ids
        },
        key=str,
    )
    for key_chunk in _chunks(service_keys):
        for row_id, ip_id, port, transport in await session.execute(
            select(Service.id, Service.ip_id, Service.port, Service.transport).where(
                tuple_(Service.ip_id, Service.port, Service.transport).in_(key_chunk)
            )
        ):
            service_ids[(ip_id, port, transport)] = row_id
    found: list[Located | None] = []
    for record in records:
        found.append(_located(record, domain_ids, ip_ids, url_ids, service_ids))
    return found


def _located(
    record: DomainRecord | IpRecord | ServiceRecord | UrlRecord,
    domain_ids: dict[str, uuid.UUID],
    ip_ids: dict[str, uuid.UUID],
    url_ids: dict[bytes, uuid.UUID],
    service_ids: dict[tuple[uuid.UUID, int, str], uuid.UUID],
) -> Located | None:
    asset_id: uuid.UUID | None = None
    if isinstance(record, DomainRecord):
        name = canonical_domain(record.name)
        asset_id = domain_ids.get(name) if name else None
        return Located(AssetType.DOMAIN, asset_id) if asset_id else None
    if isinstance(record, UrlRecord):
        canonical = canonical_url(record.url)
        asset_id = url_ids.get(canonical.url_hash) if canonical else None
        return Located(AssetType.URL, asset_id) if asset_id else None
    address = canonical_ip(record.address)
    ip_id = ip_ids.get(address) if address else None
    if isinstance(record, IpRecord):
        return Located(AssetType.IP, ip_id) if ip_id else None
    if ip_id is None:
        return None
    asset_id = service_ids.get((ip_id, record.port, record.transport.value))
    return Located(AssetType.SERVICE, asset_id) if asset_id else None

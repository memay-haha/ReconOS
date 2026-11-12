"""Shared parser of the Osmedeus workflow tool modules: one `osmedeus.zip` per job.

Each workflow tool module has its own file, `osmedeus_<workflow>.py`, naming
its tool module on a subclass, as runners and contracts do.

Package layout and the files read: docs/integrations/external-services.md,
section Gói `osmedeus.zip`. The archive is never extracted to disk: each known
member is opened by its exact name and read line by line, so a hostile member
name (absolute, `..`) is simply never opened. Bytes read are counted against
MAX_UNPACKED_BYTES whatever the zip headers claim.

Nuclei results in the package become findings once the finding table exists
(batch 6); until then they are counted as skipped.
"""

import ipaddress
import json
import zipfile
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import IO, Any, Final

from pydantic import ValidationError

from app.asset.models import DnsStatus, RecordType
from app.asset.schemas import (
    AddressRecord,
    DomainRecord,
    IngestBatch,
    IpRecord,
    ServiceRecord,
    TechnologyRecord,
    UrlRecord,
)
from app.parser.base import (
    BATCH_RECORDS,
    MAX_ARCHIVE_MEMBERS,
    MAX_UNPACKED_BYTES,
    ParseDataError,
    Parser,
    ParseStats,
    read_lines,
)
from contracts.tool_modules.osmedeus import MANIFEST_FILENAME, OsmedeusManifest

MAX_MANIFEST_BYTES: Final = 1024 * 1024

# Reasons stored in raw_output.parse_error: short, English, nothing from the file.
TOO_LARGE: Final = "archive exceeds the unpacked size limit"
NOT_ZIP: Final = "raw output is not a zip archive"
TOO_MANY_MEMBERS: Final = "archive has too many members"
NO_MANIFEST: Final = "archive has no manifest"
MANIFEST_TOO_LARGE: Final = "manifest is too large"
MANIFEST_INVALID: Final = "manifest is not valid"


class _BadLineError(ValueError):
    """One line that does not fit its file format: dropped and counted."""


Record = DomainRecord | IpRecord | ServiceRecord | UrlRecord


class _Budget:
    """Bytes left to read out of the archive."""

    def __init__(self, limit: int) -> None:
        self.left = limit

    def take(self, size: int) -> None:
        self.left -= size
        if self.left < 0:
            raise ParseDataError(TOO_LARGE)


class _CountingReader:
    """A member stream that charges every byte read to the budget."""

    def __init__(self, stream: IO[bytes], budget: _Budget) -> None:
        self._stream = stream
        self._budget = budget

    def readline(self, size: int = -1, /) -> bytes:
        line = self._stream.readline(size)
        self._budget.take(len(line))
        return line


# ---------------------------------------------------------------- value coercion
# Raw output is untrusted: every field is checked for type before use.


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _texts(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _moment(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def _addresses(entry: dict[str, Any]) -> list[AddressRecord]:
    found = [AddressRecord(address=a, record_type=RecordType.A) for a in _texts(entry.get("a"))]
    found += [
        AddressRecord(address=a, record_type=RecordType.AAAA) for a in _texts(entry.get("aaaa"))
    ]
    return found


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value.strip("[]"))
    except ValueError:
        return False
    return True


# ---------------------------------------------------------------- line readers
# Each turns one line of one known file into records, or raises ValueError /
# ValidationError for a line that does not fit, which the caller drops.


def _domain_line(line: str) -> list[Record]:
    return [DomainRecord(name=line.split()[0])]


def _ip_line(line: str) -> list[Record]:
    return [IpRecord(address=line.split()[0].split(",")[0])]


def _url_line(line: str) -> list[Record]:
    return [UrlRecord(url=line.split()[0])]


def _open_port_line(line: str) -> list[Record]:
    host, _, port = line.split()[0].rpartition(":")
    host = host.strip("[]")
    if not _is_ip(host):
        # A name instead of an address gives no IP row to hang the service on.
        raise _BadLineError
    number = _int(port)
    if number is None:
        raise _BadLineError
    return [ServiceRecord(address=host, port=number)]


def _json(line: str) -> dict[str, Any]:
    entry = json.loads(line)
    if not isinstance(entry, dict):
        raise _BadLineError
    return entry


_DNSX_STATUS: Final = {"NOERROR": None, "NXDOMAIN": DnsStatus.NXDOMAIN}


def _dnsx_line(line: str) -> list[Record]:
    entry = _json(line)
    host = _text(entry.get("host"))
    if host is None:
        raise _BadLineError
    addresses = _addresses(entry)
    status_text = _text(entry.get("status_code"))
    status = _DNSX_STATUS.get(status_text or "")
    if addresses:
        status = DnsStatus.RESOLVED
    cnames = _texts(entry.get("cname"))
    return [
        DomainRecord(
            name=host,
            cname=cnames[0] if cnames else None,
            dns_status=status,
            addresses=addresses,
        )
    ]


def _technologies(value: object) -> list[TechnologyRecord]:
    found: list[TechnologyRecord] = []
    for item in _texts(value):
        name, _, version = item.partition(":")
        found.append(TechnologyRecord(name=name.strip(), version=version.strip() or None))
    return found


def _httpx_line(line: str) -> list[Record]:
    entry = _json(line)
    url = _text(entry.get("url"))
    if url is None:
        raise _BadLineError
    tls = entry.get("tls") if isinstance(entry.get("tls"), dict) else {}
    records: list[Record] = [
        UrlRecord(
            url=url,
            status_code=_int(entry.get("status_code")),
            title=_text(entry.get("title")),
            content_length=_int(entry.get("content_length")),
            content_type=_text(entry.get("content_type")),
            webserver=_text(entry.get("webserver")),
            favicon_hash=_text(entry.get("favicon")),
            tls_not_after=_moment(tls.get("not_after")) if isinstance(tls, dict) else None,
            technologies=_technologies(entry.get("tech")),
        )
    ]
    asn = entry.get("asn") if isinstance(entry.get("asn"), dict) else {}
    as_number = _text(asn.get("as_number")) if isinstance(asn, dict) else None
    for record in _addresses(entry):
        records.append(
            IpRecord(
                address=record.address,
                asn=_int((as_number or "").upper().removeprefix("AS")),
                asn_org=_text(asn.get("as_name")) if isinstance(asn, dict) else None,
                country=_text(asn.get("as_country")) if isinstance(asn, dict) else None,
                cdn_name=_text(entry.get("cdn_name")),
            )
        )
    host = _text(entry.get("input"))
    if host is not None and not _is_ip(host) and "/" not in host:
        records.append(DomainRecord(name=host.split(":")[0], addresses=_addresses(entry)))
    return records


def _nuclei_line(_: str) -> list[Record]:
    return []


LineReader = Callable[[str], list[Record]]

# Files of a workspace and how to read them. `{workspace}` is the workspace
# name of the run, read from the manifest. A missing file is skipped.
WORKSPACE_FILES: Final[tuple[tuple[str, LineReader | None], ...]] = (
    ("subdomain/final-{workspace}.txt", _domain_line),
    ("probing/dns-json-{workspace}.txt", _dnsx_line),
    ("probing/http-{workspace}.txt", _url_line),
    ("fingerprint/http-fingerprint-{workspace}.jsonl", _httpx_line),
    ("ipspace/ip-{workspace}.txt", _ip_line),
    ("portscan/open-ports-{workspace}.txt", _open_port_line),
    ("portscan/http-port-fingerprint-{workspace}.jsonl", _httpx_line),
    # Findings: batch 6. Listed so the skip is counted, not silent.
    ("vulnscan/nuclei-jsonl-{workspace}.txt", None),
)


class _Collector:
    def __init__(self) -> None:
        self.batch = IngestBatch()

    def add(self, record: Record) -> None:
        if isinstance(record, DomainRecord):
            self.batch.domains.append(record)
        elif isinstance(record, IpRecord):
            self.batch.ips.append(record)
        elif isinstance(record, ServiceRecord):
            self.batch.services.append(record)
        else:
            self.batch.urls.append(record)

    def full(self) -> bool:
        return len(self.batch) >= BATCH_RECORDS

    def take(self) -> IngestBatch:
        batch, self.batch = self.batch, IngestBatch()
        return batch


class OsmedeusParser(Parser):
    """Shared by every Osmedeus workflow: one subclass per tool module names it."""

    def parse(self, path: Path, stats: ParseStats) -> Iterator[IngestBatch]:
        try:
            archive = zipfile.ZipFile(path)
        except (zipfile.BadZipFile, OSError) as err:
            raise ParseDataError(NOT_ZIP) from err
        with archive:
            names = archive.namelist()
            if len(names) > MAX_ARCHIVE_MEMBERS:
                raise ParseDataError(TOO_MANY_MEMBERS)
            present = set(names)
            budget = _Budget(MAX_UNPACKED_BYTES)
            manifest = self._manifest(archive, present, budget)
            collector = _Collector()
            for run in manifest.runs:
                if not run.has_output:
                    continue
                for template, reader in WORKSPACE_FILES:
                    member = f"{run.index}/{template.format(workspace=run.workspace)}"
                    if member not in present:
                        continue
                    if reader is None:
                        stats.skip("nuclei")
                        continue
                    with archive.open(member) as stream:
                        for line in read_lines(_CountingReader(stream, budget), stats):
                            try:
                                records = reader(line)
                            except ValueError, ValidationError:
                                stats.dropped += 1
                                continue
                            for record in records:
                                collector.add(record)
                            if collector.full():
                                yield collector.take()
            last = collector.take()
            if len(last):
                yield last

    @staticmethod
    def _manifest(archive: zipfile.ZipFile, present: set[str], budget: _Budget) -> OsmedeusManifest:
        if MANIFEST_FILENAME not in present:
            raise ParseDataError(NO_MANIFEST)
        with archive.open(MANIFEST_FILENAME) as stream:
            raw = stream.read(MAX_MANIFEST_BYTES + 1)
        budget.take(len(raw))
        if len(raw) > MAX_MANIFEST_BYTES:
            raise ParseDataError(MANIFEST_TOO_LARGE)
        try:
            return OsmedeusManifest.model_validate_json(raw)
        except ValidationError as err:
            raise ParseDataError(MANIFEST_INVALID) from err

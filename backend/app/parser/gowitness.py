"""Parser of the `gowitness` tool module: `gowitness.jsonl`, one capture per line.

Fields read from gowitness 3.2.2 (`models.Result`): docs/integrations/external-services.md.
The PNG files of the job are raw outputs of their own; this parser reads only
the JSONL and names each image by `file_name`. The parser service links that
name to the image row. Every other file of the job (stdout, stderr, PNG) has
nothing for this parser and is marked `no_parser`.

Raw output is untrusted: every field is checked for type and cut to the bounds
of app/screenshot/schemas.py. Cookie values and the value of `Set-Cookie`
never leave this file (G7): only the cookie names are kept.
"""

import ipaddress
import json
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any, Final
from urllib.parse import urlsplit

from app.asset.schemas import TechnologyRecord, UrlRecord
from app.parser.base import BATCH_RECORDS, Batch, Parser, ParseStats, read_lines
from app.screenshot.schemas import (
    MAX_CONSOLE_ENTRIES,
    MAX_CONSOLE_MESSAGE,
    MAX_COOKIES,
    MAX_ERROR,
    MAX_HEADER_VALUE,
    MAX_HEADERS,
    MAX_HTML_BYTES,
    MAX_NETWORK_ENTRIES,
    MAX_SAN,
    MAX_TEXT,
    ScreenshotBatch,
    ScreenshotRecord,
)

OUTPUT_FILENAME: Final = "gowitness.jsonl"
# One line carries the page HTML and its network log, so it runs far past the
# 1 MiB of a nuclei line.
MAX_GOWITNESS_LINE_BYTES: Final = 16 * 1024 * 1024
MAX_TECHNOLOGIES: Final = 64
# gowitness writes Go's zero time for a field it did not fill.
_ZERO_YEAR: Final = 1


class BadGowitnessLineError(ValueError):
    """A line that is not a gowitness result: dropped and counted."""


def _text(value: object, limit: int = MAX_TEXT) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()[:limit] or None


def _int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return int(value)


def _objects(value: object, limit: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)][:limit]


def _time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    if moment.year <= _ZERO_YEAR or moment.tzinfo is None:
        return None
    return moment


def _iso(value: object) -> str | None:
    moment = _time(value)
    return moment.isoformat() if moment else None


def _ip(value: object) -> str | None:
    text = _text(value, 64)
    if text is None:
        return None
    try:
        return str(ipaddress.ip_address(text.strip("[]")))
    except ValueError:
        return None


def _cookie_names(value: str) -> str:
    """`Set-Cookie` lines reduced to cookie names (G7, M20)."""
    names = [line.split("=", 1)[0].strip() for line in value.splitlines() if "=" in line]
    return ", ".join(name for name in names if name)


def _headers(entries: list[dict[str, Any]]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for entry in entries:
        key = _text(entry.get("key"), 255)
        value = entry.get("value")
        if key is None or not isinstance(value, str):
            continue
        key = key.lower()
        if key == "set-cookie":
            value = _cookie_names(value)
        headers[key] = value[:MAX_HEADER_VALUE]
        if len(headers) >= MAX_HEADERS:
            break
    return headers


def _tls(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    san = [
        name
        for entry in _objects(value.get("san_list"), MAX_SAN)
        if (name := _text(entry.get("value"), 255))
    ]
    tls = {
        "protocol": _text(value.get("protocol"), 64),
        "cipher": _text(value.get("cipher"), 255),
        "issuer": _text(value.get("issuer")),
        "subject": _text(value.get("subject_name")),
        "san": san,
        "not_before": _iso(value.get("valid_from")),
        "not_after": _iso(value.get("valid_to")),
    }
    # A plain-HTTP page carries an empty TLS object.
    if tls["protocol"] is None and tls["subject"] is None and not san:
        return None
    return tls


def _network(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    log: list[dict[str, Any]] = []
    for entry in entries:
        url = _text(entry.get("url"))
        if url is None:
            continue
        status = _int(entry.get("status_code"))
        log.append(
            {
                # gowitness 3.2.2 records neither the method, the size nor the
                # duration of a request: tech-debt.md, debt 42.
                "method": None,
                "url": url,
                "status_code": status if status else None,
                "content_type": _text(entry.get("mime_type"), 255),
                "size_bytes": None,
                "duration_ms": None,
                "remote_ip": _ip(entry.get("remote_ip")),
            }
        )
    return log


def _console(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    log: list[dict[str, Any]] = []
    for entry in entries:
        message = _text(entry.get("value"), MAX_CONSOLE_MESSAGE)
        if message is None:
            continue
        level = _text(entry.get("type"), 64) or "console.log"
        log.append({"level": level.removeprefix("console."), "message": message, "at": None})
    return log


def _cookies(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cookies: list[dict[str, Any]] = []
    for entry in entries:
        name = _text(entry.get("name"), 255)
        if name is None:
            continue
        # `value` is never read (G7).
        cookies.append(
            {
                "name": name,
                "domain": _text(entry.get("domain"), 255),
                "path": _text(entry.get("path"), 1024),
                "expires": None if entry.get("session") is True else _iso(entry.get("expires")),
                "secure": entry.get("secure") is True,
                "http_only": entry.get("http_only") is True,
                "same_site": _text(entry.get("same_site"), 32),
            }
        )
    return cookies


def _remote_ip(network: list[dict[str, Any]], final_url: str | None) -> str | None:
    """IP of the server that answered the page: the network entry of the final URL."""
    for entry in network:
        if entry["url"] == final_url and entry["remote_ip"]:
            return str(entry["remote_ip"])
    return next((str(e["remote_ip"]) for e in network if e["remote_ip"]), None)


def _duration_ms(probed_at: datetime | None, entries: list[dict[str, Any]]) -> int | None:
    """From the start of the probe to the last network response gowitness saw."""
    if probed_at is None:
        return None
    times = [moment for entry in entries if (moment := _time(entry.get("time")))]
    if not times:
        return None
    elapsed = int((max(times) - probed_at).total_seconds() * 1000)
    return elapsed if elapsed >= 0 else None


def _html(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    data = value.encode("utf-8")
    if len(data) <= MAX_HTML_BYTES:
        return value
    return data[:MAX_HTML_BYTES].decode("utf-8", errors="ignore")


def _image_filename(value: object) -> str | None:
    name = _text(value, 255)
    if name is None or "/" in name or "\\" in name or ".." in name:
        return None
    return name


def _same_url(first: str, second: str) -> bool:
    a, b = urlsplit(first), urlsplit(second)
    return (a.scheme.lower(), a.netloc.lower(), a.path.rstrip("/"), a.query) == (
        b.scheme.lower(),
        b.netloc.lower(),
        b.path.rstrip("/"),
        b.query,
    )


def screenshot_from_line(line: str) -> ScreenshotRecord:
    """One gowitness JSONL line. Raises ValueError or ValidationError to drop it."""
    entry = json.loads(line)
    if not isinstance(entry, dict):
        raise BadGowitnessLineError
    url = _text(entry.get("url"))
    if url is None or urlsplit(url).scheme.lower() not in ("http", "https"):
        raise BadGowitnessLineError
    final_url = _text(entry.get("final_url"))
    status = _int(entry.get("response_code"))
    status = status if status and 100 <= status <= 999 else None
    title = _text(entry.get("title"), 1024)
    technologies = [
        TechnologyRecord(name=name)
        for item in _objects(entry.get("technologies"), MAX_TECHNOLOGIES)
        if (name := _text(item.get("value"), 255))
    ]
    # Status and title describe the page after redirects: they belong to the
    # URL asset only when the URL did not redirect.
    same_page = final_url is not None and _same_url(url, final_url)
    raw_network = _objects(entry.get("network"), MAX_NETWORK_ENTRIES)
    network = _network(raw_network)
    failed = entry.get("failed") is True
    probed_at = _time(entry.get("probed_at"))
    return ScreenshotRecord(
        url=UrlRecord(
            url=url,
            status_code=status if same_page else None,
            title=title if same_page else None,
            technologies=technologies,
        ),
        image_filename=None if failed else _image_filename(entry.get("file_name")),
        final_url=final_url,
        status_code=status,
        title=title,
        perception_hash=_text(entry.get("perception_hash"), 255),
        http_headers=_headers(_objects(entry.get("headers"), MAX_HEADERS * 2)),
        remote_ip=_remote_ip(network, final_url),
        duration_ms=_duration_ms(probed_at, raw_network),
        tls=_tls(entry.get("tls")),
        network_log=network,
        console_log=_console(_objects(entry.get("console"), MAX_CONSOLE_ENTRIES)),
        cookies=_cookies(_objects(entry.get("cookies"), MAX_COOKIES)),
        html=_html(entry.get("html")),
        is_failed=failed,
        error_message=_text(entry.get("failed_reason"), MAX_ERROR) if failed else None,
        captured_at=probed_at,
    )


class GowitnessParser(Parser):
    tool_modules = ("gowitness",)

    def accepts(self, filename: str) -> bool:
        return filename == OUTPUT_FILENAME

    def parse(self, path: Path, stats: ParseStats, tool_module: str) -> Iterator[Batch]:
        batch = ScreenshotBatch()
        with path.open("rb") as stream:
            for line in read_lines(stream, stats, limit=MAX_GOWITNESS_LINE_BYTES):
                try:
                    batch.screenshots.append(screenshot_from_line(line))
                except ValueError:
                    # pydantic's ValidationError is a ValueError too.
                    stats.dropped += 1
                    continue
                if len(batch) >= BATCH_RECORDS:
                    yield batch
                    batch = ScreenshotBatch()
        if len(batch):
            yield batch

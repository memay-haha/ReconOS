"""gowitness parser: sample JSONL to screenshot records, cookie values never kept (G7).

.claude/rules/testing.md, row Parser. Database writes: test_screenshot_endpoints.py.
"""

import json
from pathlib import Path

from app.parser.base import ParseStats
from app.parser.gowitness import GowitnessParser, screenshot_from_line
from app.parser.registry import parser_for
from app.screenshot.schemas import ScreenshotBatch, ScreenshotRecord

SAMPLE = Path(__file__).parent / "fixtures" / "raw_output" / "gowitness" / "gowitness.jsonl"


def _records(path: Path = SAMPLE) -> tuple[list[ScreenshotRecord], ParseStats]:
    stats = ParseStats()
    records: list[ScreenshotRecord] = []
    for batch in GowitnessParser().parse(path, stats, "gowitness"):
        assert isinstance(batch, ScreenshotBatch)
        records.extend(batch.screenshots)
    return records, stats


def test_registered_for_the_jsonl_only() -> None:
    parser = parser_for("gowitness")
    assert isinstance(parser, GowitnessParser)
    assert parser.accepts("gowitness.jsonl")
    for other in ("https---app.example.com.png", "stdout.txt", "stderr.txt"):
        assert not parser.accepts(other)


def test_sample_lines() -> None:
    records, stats = _records()

    assert [r.url.url for r in records] == [
        "https://app.example.com",
        "http://api.example.com:8080",
        "https://down.example.com",
        "https://evil.example.com",
    ]
    # `not json` and the ftp:// line are dropped.
    assert stats.dropped == 2
    app, api, down, evil = records
    assert app.image_filename == "https---app.example.com.png"
    assert app.status_code == 200
    assert app.perception_hash == "p:f0f0e0e0c0c08080"
    assert app.remote_ip == "192.0.2.10"
    assert app.duration_ms == 2000
    assert app.captured_at is not None
    assert app.tls is not None
    assert app.tls["san"] == ["app.example.com", "*.example.com"]
    assert app.tls["not_after"] == "2027-01-01T00:00:00+00:00"
    assert app.console_log == [{"level": "warn", "message": "deprecated API", "at": None}]
    assert app.network_log[0]["content_type"] == "text/html"
    assert app.html is not None
    assert "<script>" in app.html
    assert [t.name for t in app.url.technologies] == ["Nginx", "React"]
    # No redirect: the URL asset takes the page status and title.
    assert app.url.status_code == 200
    assert app.url.title == "App Login"
    # A redirect: status and title stay on the screenshot only.
    assert api.final_url == "https://api.example.com/docs"
    assert api.url.status_code is None
    assert api.tls is None
    assert down.is_failed
    assert down.image_filename is None
    assert down.error_message == "screenshot not captured"
    # A file name that leaves the folder is never linked.
    assert evil.image_filename is None


def test_cookie_values_never_leave_the_parser() -> None:
    records, _ = _records()
    app = records[0]

    assert app.cookies == [
        {
            "name": "session",
            "domain": "app.example.com",
            "path": "/",
            "expires": None,
            "secure": True,
            "http_only": True,
            "same_site": None,
        }
    ]
    assert app.http_headers["set-cookie"] == "session, lang"
    dumped = json.dumps([r.model_dump(mode="json") for r in records])
    assert "SECRETVALUE" not in dumped


def test_long_values_are_cut(tmp_path: Path) -> None:
    line = {
        "url": "https://big.example.com",
        "response_code": 200,
        "title": "t" * 5000,
        "html": "h" * (3 * 1024 * 1024),
        "headers": [{"key": f"x-{i}", "value": "v" * 10_000} for i in range(300)],
        "console": [{"type": "console.log", "value": "m"} for _ in range(1000)],
    }
    record = screenshot_from_line(json.dumps(line))

    assert record.title is not None
    assert len(record.title) == 1024
    assert record.html is not None
    assert len(record.html.encode()) == 2 * 1024 * 1024
    assert len(record.http_headers) == 100
    assert all(len(value) == 8 * 1024 for value in record.http_headers.values())
    assert len(record.console_log) == 200


def test_a_line_over_one_mebibyte_is_read(tmp_path: Path) -> None:
    path = tmp_path / "gowitness.jsonl"
    path.write_text(
        json.dumps({"url": "https://big.example.com", "html": "x" * (2 * 1024 * 1024)}) + "\n"
    )

    records, stats = _records(path)

    assert len(records) == 1
    assert stats.dropped == 0

"""Raw output file names cannot escape the job folder: .claude/rules/security.md."""

import pytest
from pydantic import ValidationError

from contracts.raw_output import CONTENT_TYPES, STDERR_FILENAME, STDOUT_FILENAME, RawOutputFile


@pytest.mark.parametrize("name", [STDOUT_FILENAME, STDERR_FILENAME, "nuclei.jsonl", "a-b_c.1.zip"])
def test_accepts_plain_names(name: str) -> None:
    assert RawOutputFile(filename=name).filename == name


@pytest.mark.parametrize(
    "name",
    ["", ".", "..", "a..b", "../etc/passwd", "dir/file.txt", "dir\\file.txt", "a b.txt", "x" * 256],
)
def test_rejects_unsafe_names(name: str) -> None:
    with pytest.raises(ValidationError):
        RawOutputFile(filename=name)


def test_jsonl_has_its_own_content_type() -> None:
    assert CONTENT_TYPES[".jsonl"] == "application/x-ndjson"

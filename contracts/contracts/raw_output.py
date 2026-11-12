"""Raw output upload contract: file names, content types, parse status.

Contract: docs/integrations/external-services.md. Storage: docs/data/database.md.
"""

from enum import StrEnum
from typing import Annotated, Final

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

# Letters, digits, `.`, `-`, `_` only, so a name can never leave the job folder
# in object storage: .claude/rules/security.md
RAW_OUTPUT_FILENAME_PATTERN: Final = r"^[A-Za-z0-9._-]{1,255}$"

STDOUT_FILENAME: Final = "stdout.txt"
STDERR_FILENAME: Final = "stderr.txt"

DEFAULT_CONTENT_TYPE: Final = "application/octet-stream"
# Content-Type the worker sends per file extension. Anything else is binary.
CONTENT_TYPES: Final[dict[str, str]] = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".zip": "application/zip",
    ".png": "image/png",
    ".html": "text/html",
}


def _reject_dot_segments(name: str) -> str:
    if ".." in name or name == ".":
        message = "raw output file name must not contain '..'"
        raise ValueError(message)
    return name


RawOutputFilename = Annotated[
    str,
    Field(pattern=RAW_OUTPUT_FILENAME_PATTERN),
    AfterValidator(_reject_dot_segments),
]


class RawOutputFile(BaseModel):
    """Path parameter of `PUT /worker/jobs/{job_id}/raw-outputs/{filename}`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    filename: RawOutputFilename


class ParseStatus(StrEnum):
    PENDING = "pending"
    PARSED = "parsed"
    FAILED = "failed"
    NO_PARSER = "no_parser"

"""sqlmap: SQL injection detection, exploit group, so every job waits for approval (G5).

Allowed: level, risk, technique, dbms, threads, timeout, retries, delay.
Not allowed, listed only to explain the choice: every takeover, file system,
registry and enumeration option (`--os-shell`, `--os-cmd`, `--os-pwn`,
`--file-read`, `--file-write`, `--file-dest`, `--reg-*`, `--dump`,
`--dump-all`, `--sql-query`, `--sql-shell`, `--passwords`), which go past
confirming the flaw; `--eval` (runs Python on the worker); `-u`, `-m`, `-r`,
`-g`, `-c` (targets come from the job only, G5); `--output-dir`,
`--results-file`, `--tmp-dir` (the runner names output paths); `--proxy`,
`--proxy-file` (the program proxy comes from the claim); `-H`, `--cookie`,
`--auth-cred` (may carry credentials); `--shell`, `--wizard`, `--update`.
The tested options live in tests: contracts/tests/test_tool_modules.py.
"""

from typing import Annotated, Literal

from pydantic import Field

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams

# sqlmap's technique letters: Boolean, Error, Union, Stacked, Time, inline Query.
Technique = Literal["B", "E", "U", "S", "T", "Q"]
# sqlmap aliases accepted by `--dbms`; empty lets sqlmap fingerprint.
Dbms = Literal["mysql", "postgresql", "mssql", "oracle", "sqlite"]


class SqlmapParams(ToolParams):
    level: Annotated[
        int, Field(title="Level", description="Depth of tests to perform.", ge=1, le=5)
    ] = 1
    risk: Annotated[
        int, Field(title="Risk", description="Risk of the payloads sqlmap sends.", ge=1, le=3)
    ] = 1
    technique: Annotated[
        tuple[Technique, ...],
        Field(
            title="Technique",
            description="Injection techniques to try. Empty uses every technique.",
            max_length=6,
        ),
    ] = ()
    dbms: Annotated[
        Dbms | None,
        Field(title="DBMS", description="Back-end DBMS. Empty lets sqlmap fingerprint it."),
    ] = None
    threads: Annotated[
        int, Field(title="Threads", description="Concurrent HTTP requests.", ge=1, le=10)
    ] = 1
    timeout: Annotated[
        int, Field(title="Timeout", description="Seconds to wait per request.", ge=1, le=60)
    ] = 30
    retries: Annotated[
        int, Field(title="Retries", description="Retries of a timed out request.", ge=0, le=5)
    ] = 3
    delay: Annotated[
        int,
        Field(title="Delay", description="Seconds to wait between requests.", ge=0, le=60),
    ] = 0


SQLMAP = ToolModuleSpec(
    name="sqlmap",
    title="sqlmap",
    description="SQL injection detection and confirmation.",
    group=ToolGroup.EXPLOIT,
    runs_on=None,
    tools=("sqlmap",),
    output_types=(OutputType.FINDING,),
    params=SqlmapParams,
)

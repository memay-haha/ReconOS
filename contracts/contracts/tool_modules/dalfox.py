"""dalfox: XSS scanner that sends payloads, exploit group, so every job waits for approval (G5).

Allowed: workers, delay, timeout, rate, retries, follow_redirects, skip_mining,
skip_discovery, deep_scan, only_poc.
Not allowed, listed only to explain the choice: `--blind`, `--blind-oob`,
`--blind-oob-secret`, `--custom-blind-xss-payload` (send target data to an
outside callback server); `--remote-payloads`, `--remote-wordlists` (fetch
lists from the internet); `--custom-payload`, `-W`/`--mining-dict-word`,
`--cookie-from-raw`, `--out-of-scope-file`, `--state-file`, `--baseline`,
`--config` (read paths on the worker); `-H`, `--cookies`, `-d`/`--data`,
`--include-request`, `--include-response` (may carry credentials into raw
output); `--sxss`, `--sxss-url`, `--session-check-url` (request URLs that did
not pass scope, G5); `-o`, `-f` (the runner names output files); `--proxy`
(the program proxy comes from the claim); `server`, `mcp` subcommands.
The tested options live in tests: contracts/tests/test_tool_modules.py.
"""

from typing import Annotated, Literal

from pydantic import Field

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams

# Finding tiers dalfox reports: verified, AST (DOM), reflected.
PocType = Literal["v", "a", "r"]


class DalfoxParams(ToolParams):
    workers: Annotated[
        int, Field(title="Workers", description="Concurrent workers per target.", ge=1, le=100)
    ] = 10
    delay: Annotated[
        int,
        Field(title="Delay", description="Milliseconds between requests.", ge=0, le=60000),
    ] = 0
    timeout: Annotated[
        int, Field(title="Timeout", description="Seconds to wait per request.", ge=1, le=60)
    ] = 10
    rate: Annotated[
        int,
        Field(
            title="Rate", description="Maximum requests per second, 0 for no cap.", ge=0, le=1000
        ),
    ] = 0
    retries: Annotated[
        int, Field(title="Retries", description="Retries of a failed request.", ge=0, le=5)
    ] = 0
    follow_redirects: Annotated[
        bool, Field(title="Follow redirects", description="Follow 3xx responses.")
    ] = False
    skip_mining: Annotated[
        bool, Field(title="Skip mining", description="Do not guess extra parameter names.")
    ] = False
    skip_discovery: Annotated[
        bool, Field(title="Skip discovery", description="Test the given parameters only.")
    ] = False
    deep_scan: Annotated[
        bool, Field(title="Deep scan", description="Keep testing after the first finding.")
    ] = False
    only_poc: Annotated[
        tuple[PocType, ...],
        Field(
            title="Report only",
            description="Finding tiers: v verified, a AST, r reflected. Empty reports all.",
            max_length=3,
        ),
    ] = ()


DALFOX = ToolModuleSpec(
    name="dalfox",
    title="Dalfox",
    description="XSS scanner that confirms reflected and DOM injection.",
    group=ToolGroup.EXPLOIT,
    runs_on=None,
    tools=("dalfox",),
    output_types=(OutputType.FINDING,),
    params=DalfoxParams,
)

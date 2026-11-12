"""nuclei: template-based vulnerability scanner.

Allowed: severity, tags, exclude_tags, rate, threads, timeout, retries.
Not allowed, listed only to explain the choice: `-t`/`-templates` with a
user path, `-code` and `-headless` (run local code or a browser on the worker),
`-u`/`-l` (targets come from the job only, G5), `-o` (the runner names output
files), `-proxy` (the program proxy comes from the claim), `-H` (headers may carry
credentials), update flags (the image pins the template version).
"""

from typing import Annotated, Literal

from pydantic import Field

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams

Severity = Literal["info", "low", "medium", "high", "critical"]
Tag = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]


class NucleiParams(ToolParams):
    severity: Annotated[
        tuple[Severity, ...],
        Field(
            title="Severity",
            description="Run only templates of these severities. Empty runs every severity.",
            max_length=5,
        ),
    ] = ()
    tags: Annotated[
        tuple[Tag, ...],
        Field(title="Tags", description="Run only templates with these tags.", max_length=20),
    ] = ()
    exclude_tags: Annotated[
        tuple[Tag, ...],
        Field(title="Exclude tags", description="Skip templates with these tags.", max_length=20),
    ] = ()
    rate: Annotated[
        int, Field(title="Rate", description="Maximum requests per second.", ge=1, le=1000)
    ] = 150
    threads: Annotated[
        int,
        Field(title="Threads", description="Templates executed in parallel.", ge=1, le=100),
    ] = 25
    timeout: Annotated[
        int, Field(title="Timeout", description="Seconds to wait per request.", ge=1, le=60)
    ] = 10
    retries: Annotated[
        int, Field(title="Retries", description="Retries of a failed request.", ge=0, le=5)
    ] = 1


NUCLEI = ToolModuleSpec(
    name="nuclei",
    title="Nuclei",
    description="Template-based vulnerability scanner.",
    group=ToolGroup.SCAN,
    runs_on=None,
    tools=("nuclei",),
    output_types=(OutputType.FINDING,),
    params=NucleiParams,
)

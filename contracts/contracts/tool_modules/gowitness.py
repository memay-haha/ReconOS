"""gowitness: headless Chrome screenshots of web targets.

Allowed: threads, timeout, delay, window_width, window_height.
Not allowed, listed only to explain the choice: `--write-db` and every database
writer (ReconOS never reads a gowitness database, G1), `--javascript` and
`--javascript-file` (run code in the browser of the worker), `--chrome-header`
(headers may carry credentials, G7), `--chrome-proxy` (puts the proxy on the
command line), `--chrome-path` and output paths (the runner sets them),
`--save-content` (stores every response body), `--screenshot-fullpage` (the
capture size would no longer be the window size the screenshot reports).
"""

from typing import Annotated

from pydantic import Field

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams


class GowitnessParams(ToolParams):
    threads: Annotated[
        int, Field(title="Threads", description="Pages captured in parallel.", ge=1, le=20)
    ] = 4
    timeout: Annotated[
        int,
        Field(
            title="Timeout",
            description="Seconds before a page counts as timed out.",
            ge=5,
            le=120,
        ),
    ] = 30
    delay: Annotated[
        int,
        Field(
            title="Delay",
            description="Seconds between navigation and the screenshot.",
            ge=0,
            le=15,
        ),
    ] = 3
    window_width: Annotated[
        int,
        Field(title="Window width", description="Browser window width in pixels.", ge=320, le=3840),
    ] = 1440
    window_height: Annotated[
        int,
        Field(
            title="Window height", description="Browser window height in pixels.", ge=240, le=2160
        ),
    ] = 900


GOWITNESS = ToolModuleSpec(
    name="gowitness",
    title="gowitness",
    description="Screenshots of web pages with headless Chrome, with TLS, headers and console.",
    group=ToolGroup.RECON,
    runs_on=None,
    tools=("gowitness",),
    output_types=(OutputType.SCREENSHOT, OutputType.URL),
    params=GowitnessParams,
)

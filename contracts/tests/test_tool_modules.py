"""Parameter schemas are allowlists: docs/architecture/modules.md."""

import pytest
from pydantic import ValidationError

from contracts.tool_modules import TOOL_MODULES, NucleiParams, ToolGroup


def test_every_tool_module_is_registered_under_its_name() -> None:
    assert all(name == spec.name for name, spec in TOOL_MODULES.items())
    assert TOOL_MODULES["nuclei"].group is ToolGroup.SCAN


def test_nuclei_defaults() -> None:
    params = NucleiParams()

    assert (params.rate, params.threads, params.timeout, params.retries) == (150, 25, 10, 1)
    assert params.severity == ()


def test_nuclei_param_schema_is_a_closed_object() -> None:
    schema = TOOL_MODULES["nuclei"].params.model_json_schema()

    assert schema["additionalProperties"] is False
    assert {"threads", "rate"} <= set(schema["properties"])


@pytest.mark.parametrize(
    "params",
    [
        {"code": True},
        {"templates": "/etc"},
        {"severity": ["urgent"]},
        {"tags": ["-code"]},
        {"tags": ["a,b"]},
        {"exclude_tags": ["UPPER"]},
        {"rate": 0},
        {"rate": 1001},
        {"threads": 101},
        {"timeout": 0},
        {"retries": 6},
    ],
)
def test_nuclei_rejects_params_outside_the_allowlist(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        NucleiParams.model_validate(params)


def test_gowitness_is_a_recon_tool_module_with_bounded_params() -> None:
    from contracts.tool_modules import GowitnessParams

    spec = TOOL_MODULES["gowitness"]
    assert spec.group is ToolGroup.RECON
    assert spec.params is GowitnessParams
    assert GowitnessParams().window_width == 1440
    schema = GowitnessParams.model_json_schema()
    assert schema["additionalProperties"] is False
    assert set(schema["properties"]) == {
        "threads",
        "timeout",
        "delay",
        "window_width",
        "window_height",
    }

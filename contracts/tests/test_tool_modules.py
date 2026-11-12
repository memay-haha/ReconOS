"""Parameter schemas are allowlists: docs/architecture/modules.md."""

import pytest
from pydantic import ValidationError

from contracts.tool_modules import TOOL_MODULES, NucleiParams, ToolGroup, VigoliumParams


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


def test_vigolium_runs_on_its_engine_and_yields_findings() -> None:
    spec = TOOL_MODULES["vigolium"]
    assert spec.runs_on == "vigolium"
    assert spec.group is ToolGroup.SCAN
    assert VigoliumParams() == VigoliumParams(strategy="balanced", threads=25, rate=100)
    schema = spec.params.model_json_schema()
    assert schema["additionalProperties"] is False
    assert set(schema["properties"]) == {"strategy", "threads", "rate"}


@pytest.mark.parametrize(
    "params",
    [
        {"targets": ["https://example.com"]},
        {"scope_origin": "all"},
        {"headers": {"Authorization": "Bearer x"}},
        {"modules": ["xss"]},
        {"strategy": "insane"},
        {"threads": 0},
        {"threads": 101},
        {"rate": 0},
        {"rate": 1001},
    ],
)
def test_vigolium_rejects_params_outside_the_allowlist(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        VigoliumParams.model_validate(params)

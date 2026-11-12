"""Parameter schemas are allowlists: docs/architecture/modules.md."""

import pytest
from pydantic import ValidationError

from contracts.tool_modules import (
    TOOL_MODULES,
    DalfoxParams,
    NucleiParams,
    SqlmapParams,
    ToolGroup,
    VigoliumParams,
)


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


# ---------------------------------------------------------------- exploit group


def test_sqlmap_and_dalfox_are_exploit_tool_modules() -> None:
    assert TOOL_MODULES["sqlmap"].group is ToolGroup.EXPLOIT
    assert TOOL_MODULES["dalfox"].group is ToolGroup.EXPLOIT


def test_sqlmap_accepts_params_inside_the_allowlist() -> None:
    params = SqlmapParams.model_validate(
        {"level": 5, "risk": 3, "technique": ["B", "T"], "dbms": "mysql", "threads": 10}
    )
    assert params.technique == ("B", "T")
    assert SqlmapParams().level == 1


# Every sqlmap option that goes past confirming the flaw, reads or writes the
# worker, or takes a target or credential from the caller: docs/architecture/modules.md.
@pytest.mark.parametrize(
    "params",
    [
        {"--os-shell": True},
        {"os_shell": True},
        {"--file-write": "/var/www/x.php"},
        {"file_write": "/var/www/x.php"},
        {"file_dest": "/var/www/x.php"},
        {"--dump-all": True},
        {"dump_all": True},
        {"dump": True},
        {"os_cmd": "id"},
        {"os_pwn": True},
        {"file_read": "/etc/passwd"},
        {"sql_shell": True},
        {"sql_query": "SELECT 1"},
        {"eval": "import os"},
        {"url": "https://example.com/?id=1"},
        {"proxy": "http://198.51.100.1:8080"},
        {"headers": "Cookie: a=b"},
        {"output_dir": "/"},
        {"level": 6},
        {"risk": 4},
        {"technique": ["X"]},
        {"technique": "BEUST; id"},
        {"dbms": "mysql --os-shell"},
        {"threads": 11},
        {"delay": 61},
    ],
)
def test_sqlmap_rejects_params_outside_the_allowlist(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        SqlmapParams.model_validate(params)


def test_dalfox_accepts_params_inside_the_allowlist() -> None:
    params = DalfoxParams.model_validate(
        {"workers": 20, "delay": 100, "skip_mining": True, "only_poc": ["v", "r"]}
    )
    assert params.only_poc == ("v", "r")
    assert DalfoxParams().workers == 10


@pytest.mark.parametrize(
    "params",
    [
        {"blind": "https://callback.example.com"},
        {"--blind": "https://callback.example.com"},
        {"blind_oob": True},
        {"remote_payloads": "portswigger"},
        {"remote_wordlists": "burp"},
        {"custom_payload": "/etc/passwd"},
        {"mining_dict_word": "/etc/passwd"},
        {"headers": ["Authorization: Bearer x"]},
        {"cookies": "a=b"},
        {"data": "a=b"},
        {"include_request": True},
        {"sxss": True},
        {"sxss_url": "https://example.org/"},
        {"config": "/var/www/x.php"},
        {"output": "/var/www/x.php"},
        {"proxy": "http://198.51.100.1:8080"},
        {"workers": 0},
        {"workers": 101},
        {"delay": 60001},
        {"rate": 1001},
        {"only_poc": ["i"]},
        {"follow_redirects": "yes please"},
    ],
)
def test_dalfox_rejects_params_outside_the_allowlist(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        DalfoxParams.model_validate(params)


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

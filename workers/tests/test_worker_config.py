"""Worker settings: comma list, _FILE credentials, Celery config."""

from pathlib import Path

import pytest
from pydantic import SecretStr

from worker.celery_app import TRANSPORT_OPTIONS, broker_url, build_config
from worker.config import WorkerSettings


def _settings(**overrides: object) -> WorkerSettings:
    data: dict[str, object] = {
        "api_url": "https://api.example.net",
        "worker_token": "t",
        "redis_url": "redis://worker@redis.example.net:6379/0",
        "redis_password": "p@ss/word",
        "worker_tool_modules": "nuclei, gowitness",
    }
    data.update(overrides)
    return WorkerSettings.model_validate(data)


def test_tool_modules_split_on_commas() -> None:
    assert _settings().worker_tool_modules == ["nuclei", "gowitness"]


def test_file_suffix_wins_over_plain_variable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    secret = tmp_path / "token"
    secret.write_text("from-file\n")
    monkeypatch.setenv("RECONOS_API_URL", "https://api.example.net")
    monkeypatch.setenv("RECONOS_WORKER_TOKEN", "from-env")
    monkeypatch.setenv("RECONOS_WORKER_TOKEN_FILE", str(secret))
    monkeypatch.setenv("RECONOS_REDIS_URL", "redis://worker@127.0.0.1:6379/0")
    monkeypatch.setenv("RECONOS_WORKER_TOOL_MODULES", "nuclei")

    settings = WorkerSettings()

    assert settings.worker_token.get_secret_value() == "from-file"
    assert "from-file" not in repr(settings)


def test_broker_url_adds_the_password_escaped() -> None:
    assert broker_url(_settings()) == "redis://worker:p%40ss%2Fword@redis.example.net:6379/0"
    assert broker_url(_settings(redis_password=None)) == "redis://worker@redis.example.net:6379/0"


def test_celery_config_listens_only_to_job_queues() -> None:
    config = build_config(_settings())

    assert set(config["task_queues"]) == {"job.nuclei", "job.gowitness"}
    assert config["accept_content"] == ["json"]
    assert config["task_acks_late"] is True
    assert config["worker_prefetch_multiplier"] == 1
    assert config["worker_enable_remote_control"] is False
    assert config["broker_transport_options"] is TRANSPORT_OPTIONS
    assert all(key.startswith("job.") for k, key in TRANSPORT_OPTIONS.items() if k.endswith("key"))
    assert "broker_use_ssl" not in config


def test_tls_redis_verifies_the_certificate() -> None:
    import ssl

    config = build_config(_settings(redis_url="rediss://worker@redis.example.net:6380/0"))

    assert config["broker_use_ssl"] == {"ssl_cert_reqs": ssl.CERT_REQUIRED}


def test_secret_fields_are_secret_str() -> None:
    settings = _settings()

    assert isinstance(settings.worker_token, SecretStr)
    assert isinstance(settings.redis_password, SecretStr)

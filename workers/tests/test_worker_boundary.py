"""Workers may only share code through contracts: docs/architecture/dependency-graph.md."""

import subprocess
import sys


def test_worker_package_imports() -> None:
    import worker

    assert worker.__name__ == "worker"


def test_worker_can_import_contracts() -> None:
    import contracts

    assert contracts.__name__ == "contracts"


def test_importing_worker_does_not_load_backend() -> None:
    # A fresh interpreter: a backend module already imported by another test would hide the leak.
    code = "import worker, sys; print('app' in sys.modules)"
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-I", "-c", code],
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )

    assert result.stdout.strip() == "False"

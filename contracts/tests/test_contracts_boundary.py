"""Contracts depends on no other package in the repo: docs/architecture/dependency-graph.md."""

import subprocess
import sys
from pathlib import Path


def test_contracts_package_imports() -> None:
    import contracts

    assert contracts.__name__ == "contracts"


def test_importing_contracts_loads_neither_backend_nor_worker() -> None:
    code = "import contracts, sys; print('app' in sys.modules, 'worker' in sys.modules)"
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-I", "-c", code],
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )

    assert result.stdout.strip() == "False False"


def test_contracts_source_has_no_backend_or_worker_import() -> None:
    package_root = Path(__file__).resolve().parents[1] / "contracts"
    offenders = [
        path.name
        for path in package_root.rglob("*.py")
        if any(
            line.startswith(("import app", "from app", "import worker", "from worker"))
            for line in path.read_text(encoding="utf-8").splitlines()
        )
    ]

    assert offenders == []

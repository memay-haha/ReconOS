# Đợt 2a: Nền tảng xác thực backend, kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng 13 endpoint xác thực và quản lý tài khoản của ReconOS, mỗi endpoint có test theo từng vai trò.

**Architecture:** Backend FastAPI chia module theo [dependency-graph.md](../../architecture/dependency-graph.md): `core` tầng 0, `audit_log` tầng 1, `user` tầng 2. Router chỉ nhận request và khai báo quyền, nghiệp vụ nằm trong service, truy vấn viết thẳng bằng SQLAlchemy `AsyncSession`. Một transaction cho mỗi request, riêng bản ghi đăng nhập sai và nhật ký từ chối quyền ghi qua session độc lập để không mất khi rollback.

**Tech Stack:** Python 3.15, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, Pydantic 2, argon2-cffi, zxcvbn, structlog, pytest.

**Spec:** [2026-11-03-batch2a-backend-auth-design.md](../specs/2026-11-03-batch2a-backend-auth-design.md)

## Global Constraints

- Đặc tả là tài liệu trong `docs/`. Gặp chỗ chưa có quyết định hoặc tài liệu mâu thuẫn: dừng, hỏi người dùng, không tự chọn.
- Comment, docstring, thông báo lỗi, commit message viết tiếng Anh: [coding-convention.md](../../../.claude/rules/coding-convention.md).
- Type hint cho mọi tham số và giá trị trả về. mypy chế độ strict. ❌ Không dùng `# type: ignore` thiếu mã lỗi và lý do.
- `async` cho mọi I/O: CSDL, Redis, MinIO, HTTP.
- ❌ Không `HTTPException` trong service. Ném lớp con của `AppError`, bộ xử lý chung trả RFC 9457: [error-handling.md](../../../.claude/rules/error-handling.md).
- ❌ Không tự `commit` hoặc `rollback` trong service ở luồng request. ❌ Không tạo `repository.py`. ❌ Không truy vấn trong `router.py`: [design-patterns.md](../../../.claude/rules/design-patterns.md).
- Sinh token và session ID bằng `secrets`. So sánh giá trị băm bằng `hmac.compare_digest`. ❌ Không dùng `random`.
- ❌ Không ghi mật khẩu, session ID, token vào mã, log, response, `audit_log.detail`: [logging.md](../../../.claude/rules/logging.md), [security.md](../../../.claude/rules/security.md).
- Response không chứa `password_hash`, `session_hash`.
- Ngưỡng vận hành đọc từ `system_setting`, mặc định theo [configuration.md](../../ops/configuration.md). ❌ Không viết số cố định trong mã nghiệp vụ.
- Mã lỗi và HTTP status theo bảng lỗi của [api/architecture.md](../../api/architecture.md).
- Độ phủ 100% nhánh cho `backend/app/core/security.py`.
- Chạy `make lint` và `make test` trước khi báo xong một thay đổi mã.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Giá trị mặc định dùng trong đợt này

| Tên thiết lập | Mặc định |
|---|---|
| `session_idle_timeout_minutes` | 30 |
| `session_absolute_timeout_hours` | 12 |
| `login_max_failures_per_account` | 5 |
| `login_max_failures_per_ip` | 20 |
| `login_failure_window_minutes` | 15 |

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `backend/app/core/identity.py` | Model `user`, `user_session`. Mọi tầng đều cần nên đặt ở `core` |
| `backend/app/core/security.py` | Mật khẩu, session ID, chính sách cookie, kiểm CSRF, dependency xác thực và phân quyền |
| `backend/app/core/system_setting.py` | Model `system_setting` và hàm đọc ngưỡng kèm cache 60 giây |
| `backend/app/core/deps.py` | Dependency FastAPI dùng chung: session của request và tài khoản đang gọi |
| `backend/app/core/pagination.py` | Mã hóa, giải mã cursor keyset và dựng trang kết quả |
| `backend/app/core/db.py` | Thêm hàm mở session độc lập cho bản ghi phải tồn tại sau rollback |
| `backend/app/audit_log/models.py` | Model `audit_log` |
| `backend/app/audit_log/service.py` | Ghi và đọc nhật ký thao tác |
| `backend/app/audit_log/router.py` | `GET /audit-logs` |
| `backend/app/user/models.py` | Model `login_attempt` |
| `backend/app/user/service.py` | Đăng nhập, phiên, quản lý tài khoản |
| `backend/app/user/router.py` | `/auth/*`, `/users/*`, `/user-sessions/*` |
| `backend/app/bootstrap.py` | Lệnh tạo Superadmin đầu tiên |
| `backend/migrations/versions/0002_accounts_and_audit.py` | Migration 5 bảng |

Mỗi module còn có `__init__.py` và `schemas.py`. Test đặt trong `backend/tests/` theo tên module.

---

### Task 1: Thư viện zxcvbn, biến bootstrap và chính sách mật khẩu

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/core/config.py`
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security_password.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Consumes: `Settings`, `get_settings` trong `app.core.config`. `ValidationFailedError` trong `app.core.errors`.
- Produces: `hash_password(password: str) -> str`, `verify_password(password_hash: str, password: str) -> bool`, `password_needs_rehash(password_hash: str) -> bool`, `burn_password_comparison() -> None`, `check_password_policy(password: str, *, user_inputs: Sequence[str] = ()) -> None`. Hằng `MIN_PASSWORD_LENGTH = 12`, `MAX_PASSWORD_LENGTH = 128`, `MIN_PASSWORD_SCORE = 3`. `Settings.bootstrap_admin_username: str | None`, `Settings.bootstrap_admin_password: SecretStr | None`.

- [ ] **Step 1: Thêm zxcvbn vào thư viện phụ thuộc**

Trong `backend/pyproject.toml`, thêm `"zxcvbn",` vào danh sách `dependencies`, giữ thứ tự chữ cái sau `uvicorn[standard]`.

Chạy: `uv sync`

- [ ] **Step 2: Viết test cho hai biến bootstrap**

Thêm vào `backend/tests/test_config.py`:

```python
def test_bootstrap_admin_variables_are_optional(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = build_settings(monkeypatch)
    assert settings.bootstrap_admin_username is None
    assert settings.bootstrap_admin_password is None


def test_bootstrap_admin_password_reads_file_suffix(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    secret_file = tmp_path / "admin_password"
    secret_file.write_text("correct horse battery staple\n", encoding="utf-8")
    monkeypatch.setenv("RECONOS_BOOTSTRAP_ADMIN_PASSWORD_FILE", str(secret_file))
    settings = build_settings(monkeypatch)
    assert settings.bootstrap_admin_password is not None
    assert settings.bootstrap_admin_password.get_secret_value() == "correct horse battery staple"
```

`build_settings` là helper sẵn có trong file test. Nếu chưa có, dựng `Settings()` sau khi `monkeypatch.setenv` đủ biến bắt buộc và `get_settings.cache_clear()`.

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_config.py -k bootstrap -v`
Expected: FAIL, `AttributeError` vì `Settings` chưa có trường.

- [ ] **Step 4: Thêm hai trường vào Settings**

Trong `backend/app/core/config.py`, thêm vào lớp `Settings`, ngay sau `db_pool_size`:

```python
    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: SecretStr | None = None
```

- [ ] **Step 5: Chạy lại test cấu hình**

Run: `uv run pytest backend/tests/test_config.py -v`
Expected: PASS

- [ ] **Step 6: Viết test cho chính sách mật khẩu**

Tạo `backend/tests/test_security_password.py`:

```python
import pytest

from app.core.errors import ValidationFailedError
from app.core.security import (
    burn_password_comparison,
    check_password_policy,
    hash_password,
    password_needs_rehash,
    verify_password,
)

STRONG = "troutmoonlit7Ladder!quay"


def test_hash_is_argon2id_and_verifies() -> None:
    stored = hash_password(STRONG)
    assert stored.startswith("$argon2id$")
    assert verify_password(stored, STRONG) is True


def test_verify_rejects_wrong_password() -> None:
    assert verify_password(hash_password(STRONG), "wrong password here") is False


def test_verify_rejects_malformed_hash() -> None:
    assert verify_password("not-a-hash", STRONG) is False


def test_fresh_hash_does_not_need_rehash() -> None:
    assert password_needs_rehash(hash_password(STRONG)) is False


def test_needs_rehash_on_malformed_hash() -> None:
    assert password_needs_rehash("not-a-hash") is True


def test_burn_comparison_does_not_raise() -> None:
    burn_password_comparison()


def test_policy_accepts_strong_password() -> None:
    check_password_policy(STRONG)


@pytest.mark.parametrize(
    ("password", "code"),
    [
        ("short1!aA", "password_too_short"),
        ("a" * 129, "password_too_long"),
        ("password1234", "password_too_weak"),
    ],
)
def test_policy_rejects(password: str, code: str) -> None:
    with pytest.raises(ValidationFailedError) as caught:
        check_password_policy(password)
    assert caught.value.errors is not None
    assert caught.value.errors[0]["code"] == code


def test_policy_rejects_password_built_from_username() -> None:
    with pytest.raises(ValidationFailedError):
        check_password_policy("trungnguyen2026", user_inputs=["trungnguyen"])
```

- [ ] **Step 7: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_security_password.py -v`
Expected: FAIL, `ModuleNotFoundError: app.core.security`.

- [ ] **Step 8: Viết phần mật khẩu của core/security.py**

Tạo `backend/app/core/security.py`:

```python
"""Authentication and authorization primitives shared by every module.

Password policy, session identifiers, cookie attributes, CSRF checks and the
FastAPI dependencies live here: docs/security/authentication.md and
docs/security/authorization.md. This file must keep 100% branch coverage.
"""

from collections.abc import Sequence

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError
from zxcvbn import zxcvbn

from app.core.errors import ValidationFailedError

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
MIN_PASSWORD_SCORE = 3

# argon2-cffi defaults to Argon2id, the variant authentication.md requires.
_hasher = PasswordHasher()
# A real hash to compare against when the account does not exist, so the
# response time does not reveal which usernames are real.
_BURN_HASH = _hasher.hash("reconos burn comparison value")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (Argon2Error, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except (Argon2Error, InvalidHashError):
        return True


def burn_password_comparison() -> None:
    verify_password(_BURN_HASH, "reconos wrong value")


def check_password_policy(password: str, *, user_inputs: Sequence[str] = ()) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationFailedError(
            detail="password is shorter than the minimum length",
            errors=[{"field": "password", "code": "password_too_short"}],
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValidationFailedError(
            detail="password is longer than the maximum length",
            errors=[{"field": "password", "code": "password_too_long"}],
        )
    score = int(zxcvbn(password, user_inputs=list(user_inputs))["score"])
    if score < MIN_PASSWORD_SCORE:
        raise ValidationFailedError(
            detail="password is too easy to guess",
            errors=[{"field": "password", "code": "password_too_weak"}],
        )
```

- [ ] **Step 9: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_security_password.py backend/tests/test_config.py -v`
Expected: PASS

- [ ] **Step 10: Khai báo bỏ qua kiểu cho zxcvbn nếu mypy báo thiếu stub**

Run: `uv run mypy backend`
Nếu báo `Cannot find implementation or library stub for module named "zxcvbn"`, thêm vào `pyproject.toml` ở gốc repo:

```toml
[[tool.mypy.overrides]]
module = ["zxcvbn.*"]
ignore_missing_imports = true
```

Thêm `zxcvbn` vào danh sách thư viện không có `py.typed` trong [tech-stack.md](../../architecture/tech-stack.md) nếu phải khai báo.

- [ ] **Step 11: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/pyproject.toml pyproject.toml backend/app/core/config.py backend/app/core/security.py backend/tests/test_security_password.py backend/tests/test_config.py
git commit -m "feat(core): argon2id hashing and zxcvbn password policy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Session ID và chính sách cookie theo môi trường

**Files:**
- Modify: `backend/app/core/security.py`
- Test: `backend/tests/test_security_session.py`

**Interfaces:**
- Consumes: `Settings` trong `app.core.config`.
- Produces: `new_session_id() -> str`, `hash_session_id(session_id: str) -> str`, `session_id_matches(stored_hash: str, session_id: str) -> bool`, `SessionCookie` dataclass với trường `name`, `secure`, `httponly`, `samesite`, `path`, `session_cookie(settings: Settings) -> SessionCookie`. Hằng `HOST_COOKIE_NAME = "__Host-reconos_session"`, `PLAIN_COOKIE_NAME = "reconos_session"`.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_security_session.py`:

```python
from app.core.security import (
    HOST_COOKIE_NAME,
    PLAIN_COOKIE_NAME,
    hash_session_id,
    new_session_id,
    session_cookie,
    session_id_matches,
)


def test_session_id_is_random_and_long_enough() -> None:
    first, second = new_session_id(), new_session_id()
    assert first != second
    # token_urlsafe(32) encodes 256 bits, well above the 128 bit floor.
    assert len(first) >= 43


def test_hash_is_stable_and_hides_the_identifier() -> None:
    session_id = new_session_id()
    digest = hash_session_id(session_id)
    assert digest == hash_session_id(session_id)
    assert session_id not in digest
    assert len(digest) == 64


def test_matches_only_the_right_identifier() -> None:
    session_id = new_session_id()
    assert session_id_matches(hash_session_id(session_id), session_id) is True
    assert session_id_matches(hash_session_id(session_id), new_session_id()) is False


def test_https_origin_uses_host_prefix(settings_factory) -> None:
    cookie = session_cookie(settings_factory(public_origin="https://reconos.example.com"))
    assert cookie.name == HOST_COOKIE_NAME
    assert cookie.secure is True
    assert cookie.httponly is True
    assert cookie.samesite == "lax"
    assert cookie.path == "/"


def test_http_origin_drops_prefix_and_secure(settings_factory) -> None:
    cookie = session_cookie(settings_factory(public_origin="http://localhost:3000"))
    assert cookie.name == PLAIN_COOKIE_NAME
    assert cookie.secure is False
```

- [ ] **Step 2: Thêm fixture settings_factory**

Trong `backend/tests/conftest.py`, thêm fixture dựng `Settings` với giá trị bắt buộc giả và cho ghi đè từng trường:

```python
@pytest.fixture
def settings_factory() -> Callable[..., Settings]:
    def build(**overrides: object) -> Settings:
        values: dict[str, object] = {
            "database_url": "postgresql+asyncpg://reconos@localhost/reconos_test",
            "db_password": "x",
            "log_database_url": "postgresql+asyncpg://reconos@localhost/reconos_log_test",
            "log_db_password": "x",
            "redis_url": "redis://localhost:6379/0",
            "s3_endpoint": "http://localhost:9000",
            "s3_bucket": "reconos-test",
            "s3_access_key": "x",
            "s3_secret_key": "x",
            "encryption_keys": "k1:" + "0" * 44,
            "public_origin": "https://reconos.example.com",
        }
        values.update(overrides)
        return Settings(**values)  # type: ignore[arg-type]  # dict built from known field names

    return build
```

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_security_session.py -v`
Expected: FAIL, `ImportError` vì chưa có `new_session_id`.

- [ ] **Step 4: Thêm phần phiên và cookie vào core/security.py**

Bổ sung import ở đầu file và khối mã sau phần mật khẩu:

```python
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from urllib.parse import urlsplit

from app.core.config import Settings

SESSION_ID_BYTES = 32
HOST_COOKIE_NAME = "__Host-reconos_session"
PLAIN_COOKIE_NAME = "reconos_session"


def new_session_id() -> str:
    return secrets.token_urlsafe(SESSION_ID_BYTES)


def hash_session_id(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def session_id_matches(stored_hash: str, session_id: str) -> bool:
    return hmac.compare_digest(stored_hash, hash_session_id(session_id))


@dataclass(frozen=True)
class SessionCookie:
    """Cookie attributes. The __Host- prefix needs Secure, which needs https."""

    name: str
    secure: bool
    httponly: bool = True
    samesite: str = "lax"
    path: str = "/"


def session_cookie(settings: Settings) -> SessionCookie:
    secure = urlsplit(settings.public_origin).scheme == "https"
    return SessionCookie(name=HOST_COOKIE_NAME if secure else PLAIN_COOKIE_NAME, secure=secure)
```

- [ ] **Step 5: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_security_session.py -v`
Expected: PASS

- [ ] **Step 6: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/core/security.py backend/tests/test_security_session.py backend/tests/conftest.py
git commit -m "feat(core): session identifiers and environment aware cookie policy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Kiểm CSRF

**Files:**
- Modify: `backend/app/core/security.py`
- Test: `backend/tests/test_security_csrf.py`

**Interfaces:**
- Consumes: `ForbiddenError` trong `app.core.errors`, `session_cookie` từ Task 2.
- Produces: `enforce_csrf(request: Request, settings: Settings) -> None`, hằng `UNSAFE_METHODS: frozenset[str]`.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_security_csrf.py`:

```python
import pytest
from starlette.datastructures import Headers
from starlette.requests import Request

from app.core.errors import ForbiddenError
from app.core.security import HOST_COOKIE_NAME, enforce_csrf

ORIGIN = "https://reconos.example.com"


def build_request(method: str, headers: dict[str, str], cookie: bool = False) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    if cookie:
        raw.append((b"cookie", f"{HOST_COOKIE_NAME}=value".encode()))
    scope = {"type": "http", "method": method, "headers": raw, "path": "/"}
    return Request(scope)


def test_get_is_never_blocked(settings_factory) -> None:
    enforce_csrf(build_request("GET", {}), settings_factory(public_origin=ORIGIN))


def test_same_origin_post_passes(settings_factory) -> None:
    request = build_request("POST", {"origin": ORIGIN, "sec-fetch-site": "same-origin"})
    enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_other_origin_is_rejected(settings_factory) -> None:
    request = build_request("POST", {"origin": "https://evil.example"})
    with pytest.raises(ForbiddenError):
        enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_cross_site_fetch_is_rejected(settings_factory) -> None:
    request = build_request("POST", {"origin": ORIGIN, "sec-fetch-site": "cross-site"})
    with pytest.raises(ForbiddenError):
        enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_both_headers_missing_with_session_cookie_is_rejected(settings_factory) -> None:
    request = build_request("POST", {}, cookie=True)
    with pytest.raises(ForbiddenError):
        enforce_csrf(request, settings_factory(public_origin=ORIGIN))


def test_both_headers_missing_without_cookie_passes(settings_factory) -> None:
    enforce_csrf(build_request("POST", {}), settings_factory(public_origin=ORIGIN))
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_security_csrf.py -v`
Expected: FAIL, `ImportError` vì chưa có `enforce_csrf`.

- [ ] **Step 3: Thêm hàm kiểm CSRF**

Bổ sung vào `backend/app/core/security.py`:

```python
from fastapi import Request

from app.core.errors import ForbiddenError

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def enforce_csrf(request: Request, settings: Settings) -> None:
    """Reject browser requests a different site could have triggered.

    Rules and reasoning: docs/api/architecture.md, section Chống CSRF.
    """
    if request.method not in UNSAFE_METHODS:
        return
    origin = request.headers.get("origin")
    fetch_site = request.headers.get("sec-fetch-site")
    if origin is not None and origin != settings.public_origin:
        raise ForbiddenError(detail="request origin is not allowed")
    if fetch_site == "cross-site":
        raise ForbiddenError(detail="cross-site request is not allowed")
    if origin is None and fetch_site is None:
        if session_cookie(settings).name in request.cookies:
            raise ForbiddenError(detail="request carries a session cookie without origin headers")
```

- [ ] **Step 4: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_security_csrf.py -v`
Expected: PASS

- [ ] **Step 5: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/core/security.py backend/tests/test_security_csrf.py
git commit -m "feat(core): reject cross-site state changing requests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Năm bảng CSDL và migration

**Files:**
- Create: `backend/app/core/identity.py`
- Create: `backend/app/user/__init__.py`, `backend/app/user/models.py`
- Create: `backend/app/audit_log/__init__.py`, `backend/app/audit_log/models.py`
- Create: `backend/app/core/system_setting.py`
- Modify: `backend/app/core/models.py`
- Create: `backend/migrations/versions/0002_accounts_and_audit.py`
- Test: `backend/tests/test_models_schema.py`

**Interfaces:**
- Consumes: `Base` trong `app.core.db`.
- Produces: `User`, `UserSession`, `UserRole` trong `app.core.identity`; `LoginAttempt` trong `app.user.models`; `AuditLog` trong `app.audit_log.models`; `SystemSetting` trong `app.core.system_setting`. `UserRole` là `StrEnum` với giá trị `superadmin`, `admin`, `user`.

Cột theo [erd.mermaid](../../data/erd.mermaid). `user` là từ khóa của PostgreSQL, SQLAlchemy tự đặt dấu nháy nên giữ nguyên tên bảng.

- [ ] **Step 1: Viết test schema**

Tạo `backend/tests/test_models_schema.py`:

```python
from app.audit_log.models import AuditLog
from app.core.system_setting import SystemSetting
from app.core.identity import User, UserRole, UserSession
from app.user.models import LoginAttempt


def test_tables_are_named_after_the_schema_document() -> None:
    assert User.__tablename__ == "user"
    assert UserSession.__tablename__ == "user_session"
    assert LoginAttempt.__tablename__ == "login_attempt"
    assert AuditLog.__tablename__ == "audit_log"
    assert SystemSetting.__tablename__ == "system_setting"


def test_user_columns_match_the_erd() -> None:
    assert set(User.__table__.columns.keys()) == {
        "id",
        "username",
        "display_name",
        "password_hash",
        "role",
        "is_locked",
        "last_login_at",
        "created_at",
        "updated_at",
    }
    assert User.__table__.columns["username"].unique is True


def test_user_session_hash_is_unique() -> None:
    assert UserSession.__table__.columns["session_hash"].unique is True


def test_login_attempt_has_no_foreign_key() -> None:
    # Failed logins are recorded for usernames that do not exist.
    assert not LoginAttempt.__table__.foreign_keys


def test_audit_log_has_no_foreign_key() -> None:
    # The log is written from its own transaction, so it cannot depend on
    # rows another transaction has not committed yet.
    assert not AuditLog.__table__.foreign_keys


def test_roles_match_the_glossary() -> None:
    assert [role.value for role in UserRole] == ["superadmin", "admin", "user"]
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_models_schema.py -v`
Expected: FAIL, `ModuleNotFoundError: app.core.identity`.

- [ ] **Step 3: Viết model danh tính và model của module user**

Tạo `backend/app/core/identity.py`:

```python
"""Identity tables. They live in core because every tier needs to know who is
calling: docs/architecture/dependency-graph.md.

Account behaviour stays in the `user` module. This file holds the tables and
nothing else.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserRole(StrEnum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    USER = "user"


class User(Base):
    __tablename__ = "user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    username: Mapped[str] = mapped_column(Text, unique=True)
    display_name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text)
    is_locked: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class UserSession(Base):
    __tablename__ = "user_session"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    session_hash: Mapped[str] = mapped_column(Text, unique=True)
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

Tạo `backend/app/user/__init__.py` rỗng và `backend/app/user/models.py`:

```python
"""Tables owned by the user module: docs/data/schema.md."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LoginAttempt(Base):
    """One row per failed login. No foreign key: the username may not exist."""

    __tablename__ = "login_attempt"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    username: Mapped[str] = mapped_column(Text, index=True)
    ip_address: Mapped[str] = mapped_column(INET, index=True)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), index=True
    )
```

- [ ] **Step 4: Viết model của module audit_log**

Tạo `backend/app/audit_log/__init__.py` rỗng và `backend/app/audit_log/models.py`:

```python
"""Operator action log (G7). Append only: no update, no delete."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    # The list screen reads newest first, keyset paged on created_at plus id.
    __table_args__ = (Index("ix_audit_log_created_at_id", text("created_at DESC"), "id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # No foreign key on any actor column. The log only ever gains rows and is
    # written from its own transaction: docs/data/schema.md.
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    worker_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    program_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(Text, index=True)
    resource_type: Mapped[str | None] = mapped_column(Text)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
```

- [ ] **Step 5: Viết model system_setting**

Tạo `backend/app/core/system_setting.py`:

```python
"""Operational thresholds Superadmin edits at runtime: docs/ops/configuration.md."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SystemSetting(Base):
    __tablename__ = "system_setting"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
```

- [ ] **Step 6: Đăng ký model cho Alembic**

Sửa `backend/app/core/models.py`:

```python
"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md.
"""

from app.audit_log.models import AuditLog
from app.core.db import Base
from app.core.system_setting import SystemSetting
from app.core.identity import User, UserSession
from app.user.models import LoginAttempt

__all__ = ["AuditLog", "Base", "LoginAttempt", "SystemSetting", "User", "UserSession"]
```

- [ ] **Step 7: Chạy test schema, xác nhận đạt**

Run: `uv run pytest backend/tests/test_models_schema.py -v`
Expected: PASS

- [ ] **Step 8: Sinh migration và đọc lại**

```bash
make dev-up
uv run alembic -c backend/alembic.ini revision --autogenerate -m "accounts and audit"
```

Đổi tên file sinh ra thành `backend/migrations/versions/0002_accounts_and_audit.py`. Đọc lại toàn bộ nội dung và sửa cho đúng:
- Thứ tự tạo bảng: `user` trước `user_session`, `audit_log`, `system_setting`.
- Ràng buộc giá trị của `role`: thêm `sa.CheckConstraint("role IN ('superadmin', 'admin', 'user')", name="role_allowed")` vào `op.create_table` của `user`.
- Xác nhận không có lệnh nào đụng bảng `app_log` của CSDL log.

- [ ] **Step 8B: Dựng fixture CSDL cho test**

`backend/tests/conftest.py` của đợt 1 chưa có fixture CSDL. Thêm vào cuối file:

```python
from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.db import build_engine


@pytest_asyncio.fixture(scope="session")
async def db_engine() -> AsyncIterator[AsyncEngine]:
    engine = build_engine()
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_detached_rows(db_engine: AsyncEngine) -> None:
    """Clear rows an earlier test committed outside its own transaction.

    record_detached and record_failed_login write on their own connection, so
    the per-test rollback does not remove them. Cleaning at the start, not at
    teardown, keeps a test that fails midway from poisoning the next one.
    """
    async with db_engine.begin() as connection:
        await connection.execute(text("DELETE FROM login_attempt"))
        await connection.execute(text("DELETE FROM audit_log"))


@pytest_asyncio.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """One transaction per test, rolled back at the end: .claude/rules/testing.md"""
    connection = await db_engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()
```

Thêm vào `pytest_configure` dòng ghim origin để chính sách cookie và kiểm CSRF trong test luôn xác định:

```python
    os.environ["RECONOS_PUBLIC_ORIGIN"] = "https://reconos.example.com"
```

Xác nhận `pyproject.toml` ở gốc repo có `asyncio_mode = "auto"` trong `[tool.pytest.ini_options]`. Nếu chưa, thêm vào.

- [ ] **Step 9: Chạy migration và kiểm tra bảng**

```bash
make migrate
uv run python -c "import asyncio, asyncpg, os; print('ok')"
```

Thêm test vào `backend/tests/test_models_schema.py`, dùng fixture session sẵn có của bộ test:

```python
@pytest.mark.asyncio
async def test_migration_creates_every_table(db_session: AsyncSession) -> None:
    rows = await db_session.execute(
        text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND tablename IN ('user', 'user_session', 'login_attempt', "
            "'audit_log', 'system_setting')"
        )
    )
    assert len(rows.scalars().all()) == 5
```

- [ ] **Step 10: Chạy test, lint và commit**

```bash
uv run pytest backend/tests/test_models_schema.py -v
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/user backend/app/audit_log backend/app/core/system_setting.py backend/app/core/models.py backend/migrations/versions/0002_accounts_and_audit.py backend/tests/test_models_schema.py
git commit -m "feat(db): accounts, sessions, login attempts, audit log and settings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Đọc ngưỡng vận hành kèm cache 60 giây

**Files:**
- Modify: `backend/app/core/system_setting.py`
- Test: `backend/tests/test_system_setting.py`

**Interfaces:**
- Consumes: `SystemSetting` từ Task 4, `AsyncSession`.
- Produces: `DEFAULT_SETTINGS: dict[str, int]`, `async get_int_setting(session: AsyncSession, key: str) -> int`, `clear_setting_cache() -> None`, hằng `SETTING_CACHE_SECONDS = 60`.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_system_setting.py`:

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.system_setting import (
    DEFAULT_SETTINGS,
    SystemSetting,
    clear_setting_cache,
    get_int_setting,
)


@pytest.fixture(autouse=True)
def _clean_cache() -> None:
    clear_setting_cache()


def test_defaults_match_the_configuration_document() -> None:
    assert DEFAULT_SETTINGS["session_idle_timeout_minutes"] == 30
    assert DEFAULT_SETTINGS["session_absolute_timeout_hours"] == 12
    assert DEFAULT_SETTINGS["login_max_failures_per_account"] == 5
    assert DEFAULT_SETTINGS["login_max_failures_per_ip"] == 20
    assert DEFAULT_SETTINGS["login_failure_window_minutes"] == 15


@pytest.mark.asyncio
async def test_missing_row_falls_back_to_default(db_session: AsyncSession) -> None:
    assert await get_int_setting(db_session, "login_max_failures_per_account") == 5


@pytest.mark.asyncio
async def test_stored_row_wins(db_session: AsyncSession) -> None:
    db_session.add(SystemSetting(key="login_max_failures_per_account", value=9))
    await db_session.flush()
    assert await get_int_setting(db_session, "login_max_failures_per_account") == 9


@pytest.mark.asyncio
async def test_value_is_cached_within_the_window(db_session: AsyncSession) -> None:
    assert await get_int_setting(db_session, "login_max_failures_per_ip") == 20
    db_session.add(SystemSetting(key="login_max_failures_per_ip", value=99))
    await db_session.flush()
    assert await get_int_setting(db_session, "login_max_failures_per_ip") == 20
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_system_setting.py -v`
Expected: FAIL, `ImportError` vì chưa có `get_int_setting`.

- [ ] **Step 3: Viết hàm đọc ngưỡng**

Bổ sung vào `backend/app/core/system_setting.py`:

```python
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Defaults come from docs/ops/configuration.md. A missing row uses the default.
DEFAULT_SETTINGS: dict[str, int] = {
    "session_idle_timeout_minutes": 30,
    "session_absolute_timeout_hours": 12,
    "login_max_failures_per_account": 5,
    "login_max_failures_per_ip": 20,
    "login_failure_window_minutes": 15,
}
# configuration.md promises an edit applies within 60 seconds.
SETTING_CACHE_SECONDS = 60

_cache: dict[str, tuple[float, int]] = {}


def clear_setting_cache() -> None:
    _cache.clear()


async def get_int_setting(session: AsyncSession, key: str) -> int:
    cached = _cache.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < SETTING_CACHE_SECONDS:
        return cached[1]
    stored = await session.scalar(select(SystemSetting.value).where(SystemSetting.key == key))
    value = DEFAULT_SETTINGS[key] if stored is None else int(stored)
    _cache[key] = (now, value)
    return value
```

- [ ] **Step 4: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_system_setting.py -v`
Expected: PASS

- [ ] **Step 5: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/core/system_setting.py backend/tests/test_system_setting.py
git commit -m "feat(core): read operational thresholds with a 60 second cache

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Session độc lập và ghi nhật ký thao tác

**Files:**
- Modify: `backend/app/core/db.py`
- Create: `backend/app/audit_log/service.py`
- Test: `backend/tests/test_audit_log_service.py`

**Interfaces:**
- Consumes: `AuditLog` từ Task 4, `build_engine`, `session_scope` trong `app.core.db`.
- Produces: `independent_session()` context manager trong `app.core.db`. Trong `app.audit_log.service`: `async record(session: AsyncSession, *, action: str, user_id: uuid.UUID | None = None, resource_type: str | None = None, resource_id: uuid.UUID | None = None, detail: dict[str, Any] | None = None, ip_address: str | None = None) -> None` và `async record_detached(*, action: str, ...) -> None` dùng session riêng.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_audit_log_service.py`:

```python
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log import service as audit_service
from app.audit_log.models import AuditLog


@pytest.mark.asyncio
async def test_record_writes_one_row(db_session: AsyncSession) -> None:
    actor = uuid.uuid4()
    await audit_service.record(
        db_session, action="user_created", user_id=actor, resource_type="user"
    )
    await db_session.flush()
    stored = (await db_session.execute(select(AuditLog))).scalars().all()
    assert len(stored) == 1
    assert stored[0].action == "user_created"
    assert stored[0].user_id == actor


@pytest.mark.asyncio
async def test_record_accepts_a_system_action(db_session: AsyncSession) -> None:
    await audit_service.record(db_session, action="user_created")
    await db_session.flush()
    stored = (await db_session.execute(select(AuditLog))).scalars().one()
    assert stored.user_id is None


@pytest.mark.asyncio
async def test_detached_record_survives_a_rollback(db_session: AsyncSession) -> None:
    await audit_service.record_detached(action="permission_denied")
    await db_session.rollback()
    total = await db_session.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.action == "permission_denied")
    )
    assert total == 1
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_audit_log_service.py -v`
Expected: FAIL, `ModuleNotFoundError: app.audit_log.service`.

- [ ] **Step 3: Thêm session độc lập vào core/db.py**

Bổ sung vào cuối `backend/app/core/db.py`:

```python
@lru_cache
def get_engine() -> AsyncEngine:
    """One engine per process. Building an engine per call opens a new pool."""
    return build_engine()


@asynccontextmanager
async def independent_session() -> AsyncIterator[AsyncSession]:
    """A transaction of its own, so the row survives a rolled back request.

    Failed logins and permission denials must stay on record even though the
    request itself returns an error: docs/security/authorization.md. The audit
    table carries no foreign key, so this write never waits on another
    transaction: docs/data/schema.md.
    """
    async with session_scope(get_engine()) as session:
        yield session
```

Thêm `from functools import lru_cache` vào đầu file.

- [ ] **Step 4: Viết service ghi nhật ký**

Tạo `backend/app/audit_log/service.py`:

```python
"""Writing and reading the operator action log (G7).

Every module records through this service. audit_log sits below the business
modules so even `user` can call it: docs/architecture/dependency-graph.md.
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log.models import AuditLog
from app.core.db import independent_session


async def record(
    session: AsyncSession,
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    session.add(
        AuditLog(
            action=action,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
        )
    )


async def record_detached(
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Record through a session of its own, for requests that end in an error."""
    async with independent_session() as session:
        await record(
            session,
            action=action,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
        )
```

- [ ] **Step 5: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_audit_log_service.py -v`
Expected: PASS

- [ ] **Step 6: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/core/db.py backend/app/audit_log/service.py backend/tests/test_audit_log_service.py
git commit -m "feat(audit_log): record actions, including from rolled back requests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Dependency xác thực và phân quyền

**Files:**
- Modify: `backend/app/core/security.py`
- Test: `backend/tests/test_security_dependencies.py`

**Interfaces:**
- Consumes: `User`, `UserSession` từ Task 4, `get_int_setting` từ Task 5, `record_detached` từ Task 6, `UnauthenticatedError`, `ForbiddenError`.
- Produces: `async load_current_user(request: Request, session: AsyncSession, settings: Settings) -> User`, `require_roles(*roles: UserRole) -> Callable[..., Awaitable[User]]`, `ALL_PROGRAMS` sentinel, `async allowed_program_ids(user: User) -> frozenset[uuid.UUID] | AllPrograms`.

Hàm lọc program ở đợt này trả `ALL_PROGRAMS` cho Superadmin và Admin, trả tập rỗng cho User. Đợt 3 nối vào bảng `program_user`.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_security_dependencies.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.security import (
    ALL_PROGRAMS,
    allowed_program_ids,
    hash_session_id,
    load_current_user,
    new_session_id,
    require_roles,
)
from app.core.identity import User, UserRole, UserSession


async def make_session(
    db_session: AsyncSession, user: User, *, idle_minutes: int = 0, expired: bool = False
) -> str:
    session_id = new_session_id()
    now = datetime.now(UTC)
    db_session.add(
        UserSession(
            user_id=user.id,
            session_hash=hash_session_id(session_id),
            last_seen_at=now - timedelta(minutes=idle_minutes),
            expires_at=now - timedelta(hours=1) if expired else now + timedelta(hours=12),
        )
    )
    await db_session.flush()
    return session_id


@pytest.mark.asyncio
async def test_no_cookie_is_unauthenticated(db_session, settings_factory, request_factory) -> None:
    with pytest.raises(UnauthenticatedError):
        await load_current_user(request_factory(), db_session, settings_factory())


@pytest.mark.asyncio
async def test_valid_cookie_returns_the_account(
    db_session, settings_factory, request_factory, user_factory
) -> None:
    user = await user_factory(role=UserRole.ADMIN)
    session_id = await make_session(db_session, user)
    found = await load_current_user(
        request_factory(session_id=session_id), db_session, settings_factory()
    )
    assert found.id == user.id


@pytest.mark.asyncio
async def test_absolute_expiry_rejects(
    db_session, settings_factory, request_factory, user_factory
) -> None:
    user = await user_factory()
    session_id = await make_session(db_session, user, expired=True)
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=session_id), db_session, settings_factory()
        )


@pytest.mark.asyncio
async def test_idle_expiry_rejects(
    db_session, settings_factory, request_factory, user_factory
) -> None:
    user = await user_factory()
    session_id = await make_session(db_session, user, idle_minutes=31)
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=session_id), db_session, settings_factory()
        )


@pytest.mark.asyncio
async def test_locked_account_rejects(
    db_session, settings_factory, request_factory, user_factory
) -> None:
    user = await user_factory(is_locked=True)
    session_id = await make_session(db_session, user)
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=session_id), db_session, settings_factory()
        )


@pytest.mark.asyncio
async def test_unknown_cookie_rejects(
    db_session, settings_factory, request_factory
) -> None:
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=new_session_id()), db_session, settings_factory()
        )


@pytest.mark.asyncio
async def test_role_guard_allows_and_denies(db_session, user_factory) -> None:
    admin = await user_factory(role=UserRole.ADMIN)
    guard = require_roles(UserRole.SUPERADMIN)
    with pytest.raises(ForbiddenError):
        await guard(admin, db_session)
    allow = require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    assert (await allow(admin, db_session)).id == admin.id


@pytest.mark.asyncio
async def test_program_filter_skeleton(user_factory) -> None:
    assert await allowed_program_ids(await user_factory(role=UserRole.SUPERADMIN)) is ALL_PROGRAMS
    assert await allowed_program_ids(await user_factory(role=UserRole.ADMIN)) is ALL_PROGRAMS
    assert await allowed_program_ids(await user_factory(role=UserRole.USER)) == frozenset()
```

- [ ] **Step 2: Thêm fixture request_factory và user_factory**

Trong `backend/tests/conftest.py`:

```python
@pytest.fixture
def request_factory() -> Callable[..., Request]:
    def build(session_id: str | None = None, method: str = "GET") -> Request:
        headers: list[tuple[bytes, bytes]] = []
        if session_id is not None:
            headers.append((b"cookie", f"{HOST_COOKIE_NAME}={session_id}".encode()))
        return Request({"type": "http", "method": method, "headers": headers, "path": "/"})

    return build


@pytest.fixture
def user_factory(db_session: AsyncSession) -> Callable[..., Awaitable[User]]:
    counter = itertools.count()

    async def build(
        role: UserRole = UserRole.USER, is_locked: bool = False, password: str = "troutmoonlit7Ladder!quay"
    ) -> User:
        user = User(
            username=f"account{next(counter)}",
            display_name="Test Account",
            password_hash=hash_password(password),
            role=role.value,
            is_locked=is_locked,
        )
        db_session.add(user)
        await db_session.flush()
        return user

    return build
```

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_security_dependencies.py -v`
Expected: FAIL, `ImportError` vì chưa có `load_current_user`.

- [ ] **Step 4: Viết dependency**

Bổ sung vào `backend/app/core/security.py`:

```python
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log import service as audit_service
from app.core.errors import UnauthenticatedError
from app.core.system_setting import get_int_setting
from app.core.identity import User, UserRole, UserSession


class AllPrograms:
    """Marker for an account that sees every program."""


ALL_PROGRAMS: Final = AllPrograms()


async def load_current_user(
    request: Request, session: AsyncSession, settings: Settings
) -> User:
    session_id = request.cookies.get(session_cookie(settings).name)
    if session_id is None:
        raise UnauthenticatedError(detail="no session cookie")
    row = (
        await session.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.session_hash == hash_session_id(session_id))
        )
    ).first()
    if row is None:
        raise UnauthenticatedError(detail="session not found")
    user_session, user = row
    now = datetime.now(UTC)
    if user_session.expires_at <= now:
        raise UnauthenticatedError(detail="session reached its maximum lifetime")
    idle_minutes = await get_int_setting(session, "session_idle_timeout_minutes")
    if user_session.last_seen_at + timedelta(minutes=idle_minutes) <= now:
        raise UnauthenticatedError(detail="session expired after inactivity")
    if user.is_locked:
        raise UnauthenticatedError(detail="account is locked")
    user_session.last_seen_at = now
    return user


def require_roles(*roles: UserRole) -> Callable[[User, AsyncSession], Awaitable[User]]:
    """Deny by default: an endpoint without a guard is callable by nobody."""
    allowed = {role.value for role in roles}

    async def guard(user: User, session: AsyncSession) -> User:
        if user.role not in allowed:
            await audit_service.record_detached(
                action="permission_denied", user_id=user.id, detail={"required": sorted(allowed)}
            )
            raise ForbiddenError(detail="role is not allowed to perform this action")
        return user

    return guard


async def allowed_program_ids(user: User) -> frozenset[uuid.UUID] | AllPrograms:
    """Programs the account may read.

    Superadmin and Admin see everything. The assignment table `program_user`
    arrives in batch 3, which is where the User branch starts querying it.
    """
    if user.role in {UserRole.SUPERADMIN.value, UserRole.ADMIN.value}:
        return ALL_PROGRAMS
    return frozenset()
```

- [ ] **Step 5: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_security_dependencies.py -v`
Expected: PASS

- [ ] **Step 6: Kiểm độ phủ nhánh của security.py**

Run: `uv run pytest --cov=backend/app/core/security.py --cov-branch --cov-report=term-missing backend/tests`
Expected: 100%. Thiếu nhánh nào thì bổ sung test cho đúng nhánh đó, không sửa mã để né.

- [ ] **Step 7: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/core/security.py backend/tests/test_security_dependencies.py backend/tests/conftest.py
git commit -m "feat(core): session and role dependencies, deny by default

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Phân trang cursor keyset

**Files:**
- Create: `backend/app/core/pagination.py`
- Test: `backend/tests/test_pagination.py`

**Interfaces:**
- Consumes: `BadRequestError` trong `app.core.errors`.
- Produces: `encode_cursor(sort_value: object, row_id: uuid.UUID) -> str`, `decode_cursor(cursor: str) -> tuple[object, uuid.UUID]`, `Page` là `pydantic.BaseModel` generic với trường `items`, `next_cursor`, `total`, `total_is_estimate`. Hằng `DEFAULT_LIMIT = 50`, `MAX_LIMIT = 200`.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_pagination.py`:

```python
import uuid

import pytest

from app.core.errors import BadRequestError
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor, encode_cursor


def test_round_trip() -> None:
    row_id = uuid.uuid4()
    value, decoded_id = decode_cursor(encode_cursor("2026-11-03T08:00:00+00:00", row_id))
    assert value == "2026-11-03T08:00:00+00:00"
    assert decoded_id == row_id


def test_cursor_hides_its_content() -> None:
    cursor = encode_cursor("secret-sort-value", uuid.uuid4())
    assert "secret-sort-value" not in cursor


@pytest.mark.parametrize("cursor", ["not-base64!", "", "YWJj"])
def test_broken_cursor_is_a_bad_request(cursor: str) -> None:
    with pytest.raises(BadRequestError):
        decode_cursor(cursor)


def test_limits_match_the_api_document() -> None:
    assert DEFAULT_LIMIT == 50
    assert MAX_LIMIT == 200
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_pagination.py -v`
Expected: FAIL, `ModuleNotFoundError: app.core.pagination`.

- [ ] **Step 3: Viết module phân trang**

Tạo `backend/app/core/pagination.py`:

```python
"""Keyset pagination shared by every list endpoint: docs/api/architecture.md.

The cursor carries the sort value and the id of the last row. Clients treat it
as opaque, so the encoding may change without an API version bump.
"""

import base64
import binascii
import json
import uuid
from typing import Any

from pydantic import BaseModel

from app.core.errors import BadRequestError

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class Page[ItemT](BaseModel):
    items: list[ItemT]
    next_cursor: str | None = None
    total: int
    total_is_estimate: bool = False


def encode_cursor(sort_value: object, row_id: uuid.UUID) -> str:
    payload = json.dumps({"v": sort_value, "id": str(row_id)}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str) -> tuple[Any, uuid.UUID]:
    try:
        payload = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")))
        return payload["v"], uuid.UUID(payload["id"])
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError, KeyError, ValueError) as err:
        raise BadRequestError(detail="cursor is not valid") from err
```

- [ ] **Step 4: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_pagination.py -v`
Expected: PASS

- [ ] **Step 5: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/core/pagination.py backend/tests/test_pagination.py
git commit -m "feat(core): keyset cursor pagination helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Đăng nhập, đăng xuất, tài khoản hiện tại, đổi mật khẩu

**Files:**
- Create: `backend/app/user/schemas.py`, `backend/app/user/service.py`, `backend/app/user/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth_endpoints.py`

**Interfaces:**
- Consumes: mọi thứ từ Task 1 đến Task 8.
- Produces: router `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/password`. Trong `service`: `async login`, `async logout`, `async change_password`, `async revoke_sessions_for_user`. Dependency `current_user` và `get_db` dùng chung cho Task 10 và 11.

- [ ] **Step 1: Viết test cho luồng đăng nhập**

Tạo `backend/tests/test_auth_endpoints.py`:

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log.models import AuditLog
from app.core.identity import UserRole
from app.user.models import LoginAttempt

PASSWORD = "troutmoonlit7Ladder!quay"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


@pytest.mark.asyncio
async def test_login_sets_cookie_and_records_audit(
    client: AsyncClient, db_session: AsyncSession, user_factory
) -> None:
    user = await user_factory(role=UserRole.ADMIN, password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 204
    assert any("reconos_session" in name for name in response.cookies)
    actions = (await db_session.execute(select(AuditLog.action))).scalars().all()
    assert "login_succeeded" in actions


@pytest.mark.asyncio
async def test_wrong_password_and_unknown_user_answer_the_same(
    client: AsyncClient, user_factory
) -> None:
    user = await user_factory(password=PASSWORD)
    wrong = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": "definitely wrong here"},
        headers=HEADERS,
    )
    unknown = await client.post(
        "/api/v1/auth/login",
        json={"username": "nobody-at-all", "password": PASSWORD},
        headers=HEADERS,
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["code"] == unknown.json()["code"] == "unauthenticated"


@pytest.mark.asyncio
async def test_locked_account_cannot_log_in(client: AsyncClient, user_factory) -> None:
    user = await user_factory(is_locked=True, password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_failed_login_is_recorded_even_though_the_request_fails(
    client: AsyncClient, db_session: AsyncSession, user_factory
) -> None:
    user = await user_factory(password=PASSWORD)
    await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": "definitely wrong here"},
        headers=HEADERS,
    )
    total = await db_session.scalar(
        select(func.count()).select_from(LoginAttempt).where(LoginAttempt.username == user.username)
    )
    assert total == 1


@pytest.mark.asyncio
async def test_too_many_failures_returns_429(client: AsyncClient, user_factory) -> None:
    user = await user_factory(password=PASSWORD)
    for _ in range(5):
        await client.post(
            "/api/v1/auth/login",
            json={"username": user.username, "password": "definitely wrong here"},
            headers=HEADERS,
        )
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]


@pytest.mark.asyncio
async def test_cross_site_login_is_rejected(client: AsyncClient, user_factory) -> None:
    user = await user_factory(password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers={"origin": "https://evil.example"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_me_requires_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_me_returns_the_account_without_secrets(
    client: AsyncClient, logged_in
) -> None:
    user = await logged_in(role=UserRole.USER)
    body = (await client.get("/api/v1/auth/me")).json()
    assert body["username"] == user.username
    assert body["role"] == "user"
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_logout_clears_the_session(client: AsyncClient, logged_in) -> None:
    await logged_in()
    assert (await client.post("/api/v1/auth/logout", headers=HEADERS)).status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_password_change_requires_the_current_password(
    client: AsyncClient, logged_in
) -> None:
    await logged_in()
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": "wrong one here", "new_password": "bramble7Quartz!tide"},
        headers=HEADERS,
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_password_change_rejects_a_weak_password(client: AsyncClient, logged_in) -> None:
    await logged_in()
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "password1234"},
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "password_too_weak"
```

- [ ] **Step 2: Thêm fixture client và logged_in**

Thêm vào `backend/tests/conftest.py`:

```python
@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Drive the real app, but inside the transaction of the test."""
    from httpx import ASGITransport, AsyncClient

    from app.main import app
    from app.user.router import get_db

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://reconos.example.com"
    ) as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
def logged_in(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> Callable[..., Awaitable[User]]:
    """Create an account and log the shared client in as that account."""
    password = "troutmoonlit7Ladder!quay"

    async def build(role: UserRole = UserRole.USER) -> User:
        user = await user_factory(role=role, password=password)
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": user.username, "password": password},
            headers={
                "origin": "https://reconos.example.com",
                "sec-fetch-site": "same-origin",
            },
        )
        assert response.status_code == 204
        return user

    return build
```

`base_url` dùng https để cookie có cờ `Secure` vẫn được httpx giữ lại giữa các request.

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_auth_endpoints.py -v`
Expected: FAIL, 404 vì chưa gắn router.

- [ ] **Step 4: Viết schema**

- [ ] **Step 3B: Viết dependency dùng chung trong `core`**

`audit_log` ở tầng 1 cũng cần biết ai đang đăng nhập, mà nó không gọi lên module `user` ở tầng 2 được. Nên dependency dùng chung nằm ở `core`.

Tạo `backend/app/core/deps.py`:

```python
"""FastAPI dependencies every module shares: the request session and the caller.

They live in `core` because a module at any tier declares them, and no module
may call a module above it: docs/architecture/dependency-graph.md.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_engine, session_scope
from app.core.identity import User
from app.core.security import load_current_user


async def get_db() -> AsyncIterator[AsyncSession]:
    """One transaction per request, on the engine shared by the process."""
    async with session_scope(get_engine()) as session:
        yield session


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def current_user(request: Request, session: DbDep, settings: SettingsDep) -> User:
    return await load_current_user(request, session, settings)


CurrentUser = Annotated[User, Depends(current_user)]
```

⚠️ `get_db` must use `get_engine()` from Task 6, not `build_engine()`. Building an engine per request opens a new connection pool on every call.

Tạo `backend/app/user/schemas.py`:

```python
"""Request and response bodies of the user module. No secret ever goes out."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.identity import UserRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)
    role: UserRole


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: UserRole | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: UserRole
    is_locked: bool
    last_login_at: datetime | None
    created_at: datetime


class UserSessionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
```

- [ ] **Step 5: Viết service đăng nhập và phiên**

Tạo `backend/app/user/service.py` với các hàm sau. Ghi chú quan trọng: ném lỗi trước khi commit thì bản ghi `login_attempt` mất, nên dùng `record_failed_login` qua session độc lập.

```python
"""Accounts, sessions and the login flow: docs/security/authentication.md."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log import service as audit_service
from app.core.db import independent_session
from app.core.errors import ConflictError, NotFoundError, RateLimitedError, UnauthenticatedError
from app.core.security import (
    burn_password_comparison,
    check_password_policy,
    hash_password,
    hash_session_id,
    new_session_id,
    verify_password,
)
from app.core.system_setting import get_int_setting
from app.core.identity import User, UserRole, UserSession
from app.user.models import LoginAttempt


async def _window_start(session: AsyncSession) -> tuple[datetime, int]:
    minutes = await get_int_setting(session, "login_failure_window_minutes")
    return datetime.now(UTC) - timedelta(minutes=minutes), minutes


async def check_login_allowed(session: AsyncSession, username: str, ip_address: str) -> None:
    since, minutes = await _window_start(session)
    by_account = await session.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.username == username, LoginAttempt.attempted_at >= since)
    )
    by_ip = await session.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.ip_address == ip_address, LoginAttempt.attempted_at >= since)
    )
    max_account = await get_int_setting(session, "login_max_failures_per_account")
    max_ip = await get_int_setting(session, "login_max_failures_per_ip")
    if (by_account or 0) >= max_account or (by_ip or 0) >= max_ip:
        raise RateLimitedError(detail=f"too many failed logins, retry in {minutes} minutes")


async def record_failed_login(username: str, ip_address: str) -> None:
    """Separate transaction: the request itself ends in 401 and rolls back."""
    async with independent_session() as session:
        session.add(LoginAttempt(username=username, ip_address=ip_address))
        await audit_service.record(
            session, action="login_failed", detail={"username": username}, ip_address=ip_address
        )


async def login(
    session: AsyncSession, *, username: str, password: str, ip_address: str, user_agent: str | None
) -> str:
    await check_login_allowed(session, username, ip_address)
    user = await session.scalar(select(User).where(User.username == username))
    if user is None:
        burn_password_comparison()
        await record_failed_login(username, ip_address)
        raise UnauthenticatedError(detail="invalid username or password")
    if not verify_password(user.password_hash, password) or user.is_locked:
        await record_failed_login(username, ip_address)
        raise UnauthenticatedError(detail="invalid username or password")

    await session.execute(delete(LoginAttempt).where(LoginAttempt.username == username))
    session_id = new_session_id()
    hours = await get_int_setting(session, "session_absolute_timeout_hours")
    now = datetime.now(UTC)
    session.add(
        UserSession(
            user_id=user.id,
            session_hash=hash_session_id(session_id),
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=now + timedelta(hours=hours),
        )
    )
    user.last_login_at = now
    await audit_service.record(
        session, action="login_succeeded", user_id=user.id, ip_address=ip_address
    )
    return session_id


async def logout(session: AsyncSession, *, user: User, session_id: str) -> None:
    await session.execute(
        delete(UserSession).where(UserSession.session_hash == hash_session_id(session_id))
    )
    await audit_service.record(session, action="logout", user_id=user.id)


async def change_password(
    session: AsyncSession, *, user: User, current_password: str, new_password: str, session_id: str
) -> None:
    if not verify_password(user.password_hash, current_password):
        raise UnauthenticatedError(detail="current password does not match")
    check_password_policy(new_password, user_inputs=[user.username, user.display_name])
    user.password_hash = hash_password(new_password)
    await session.execute(
        delete(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.session_hash != hash_session_id(session_id),
        )
    )
    await audit_service.record(session, action="password_changed", user_id=user.id)
```

- [ ] **Step 6: Viết router auth**

Tạo `backend/app/user/router.py` với dependency dùng chung và 4 endpoint auth:

```python
"""HTTP surface of the user module. No query and no business rule lives here."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DbDep, SettingsDep
from app.core.security import enforce_csrf, session_cookie
from app.core.system_setting import get_int_setting
from app.user import service
from app.core.identity import User
from app.user.schemas import LoginRequest, PasswordChangeRequest, UserResponse

router = APIRouter(prefix="/api/v1", tags=["auth"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


@router.post("/auth/login", status_code=204)
async def login(
    request: Request, body: LoginRequest, session: DbDep, settings: SettingsDep, response: Response
) -> None:
    enforce_csrf(request, settings)
    session_id = await service.login(
        session,
        username=body.username,
        password=body.password,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    cookie = session_cookie(settings)
    hours = await get_int_setting(session, "session_absolute_timeout_hours")
    response.set_cookie(
        cookie.name,
        session_id,
        max_age=hours * 3600,
        secure=cookie.secure,
        httponly=cookie.httponly,
        samesite=cookie.samesite,
        path=cookie.path,
    )


@router.post("/auth/logout", status_code=204)
async def logout(
    request: Request,
    user: CurrentUser,
    session: DbDep,
    settings: SettingsDep,
    response: Response,
) -> None:
    enforce_csrf(request, settings)
    cookie = session_cookie(settings)
    await service.logout(session, user=user, session_id=request.cookies[cookie.name])
    response.delete_cookie(cookie.name, path=cookie.path)


@router.get("/auth/me", response_model=UserResponse)
async def me(user: CurrentUser) -> User:
    return user


@router.post("/auth/password", status_code=204)
async def change_password(
    request: Request,
    body: PasswordChangeRequest,
    user: CurrentUser,
    session: DbDep,
    settings: SettingsDep,
) -> None:
    enforce_csrf(request, settings)
    await service.change_password(
        session,
        user=user,
        current_password=body.current_password,
        new_password=body.new_password,
        session_id=request.cookies[session_cookie(settings).name],
    )
```

- [ ] **Step 7: Gắn router vào app**

Trong `backend/app/main.py`, thêm `from app.user.router import router as user_router` và `app.include_router(user_router)`.

- [ ] **Step 8: Trả header Retry-After cho lỗi 429**

Trong `backend/app/core/errors.py`, sửa `_problem_response` để `RateLimitedError` kèm header:

```python
def _problem_response(error: AppError) -> JSONResponse:
    headers: dict[str, str] | None = None
    if isinstance(error, RateLimitedError):
        headers = {"Retry-After": str(error.retry_after_seconds)}
    return JSONResponse(
        status_code=error.status,
        content=error.to_problem(),
        media_type=PROBLEM_CONTENT_TYPE,
        headers=headers,
    )
```

Thêm vào `RateLimitedError` thuộc tính `retry_after_seconds: int = 900` đặt được qua `__init__`, và truyền giá trị thật từ `check_login_allowed`.

- [ ] **Step 9: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_auth_endpoints.py -v`
Expected: PASS

- [ ] **Step 10: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/user backend/app/main.py backend/app/core/errors.py backend/tests/test_auth_endpoints.py backend/tests/conftest.py
git commit -m "feat(user): login, logout, current account and password change

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Quản lý tài khoản cho Superadmin

**Files:**
- Modify: `backend/app/user/service.py`, `backend/app/user/router.py`
- Test: `backend/tests/test_user_endpoints.py`

**Interfaces:**
- Consumes: `require_roles`, `Page`, `encode_cursor`, `decode_cursor`.
- Produces: 7 endpoint `/users*`. Trong service: `async create_user`, `async update_user`, `async set_locked`, `async list_users`, `async list_sessions_for_user`.

Quy tắc nghiệp vụ: Superadmin không đổi vai trò của chính mình và không khóa chính mình, trả `403 forbidden`: [authorization.md](../../security/authorization.md).

- [ ] **Step 1: Viết test theo từng vai trò**

Tạo `backend/tests/test_user_endpoints.py`:

```python
import pytest
from httpx import AsyncClient

from app.core.identity import UserRole

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
NEW = {
    "username": "newoperator",
    "display_name": "New Operator",
    "password": "bramble7Quartz!tide",
    "role": "user",
}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 403), (UserRole.USER, 403)],
)
async def test_list_users_by_role(client: AsyncClient, logged_in, role, expected) -> None:
    await logged_in(role=role)
    assert (await client.get("/api/v1/users")).status_code == expected


@pytest.mark.asyncio
async def test_list_users_without_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/users")).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 403), (UserRole.USER, 403)],
)
async def test_create_user_by_role(client: AsyncClient, logged_in, role, expected) -> None:
    await logged_in(role=role)
    response = await client.post("/api/v1/users", json=NEW, headers=HEADERS)
    assert response.status_code == expected


@pytest.mark.asyncio
async def test_created_user_hides_secrets(client: AsyncClient, logged_in) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    body = (await client.post("/api/v1/users", json=NEW, headers=HEADERS)).json()
    assert "password_hash" not in body
    assert body["role"] == "user"


@pytest.mark.asyncio
async def test_duplicate_username_conflicts(client: AsyncClient, logged_in) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    await client.post("/api/v1/users", json=NEW, headers=HEADERS)
    again = await client.post("/api/v1/users", json=NEW, headers=HEADERS)
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_weak_password_is_rejected(client: AsyncClient, logged_in) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    response = await client.post(
        "/api/v1/users", json={**NEW, "password": "password1234"}, headers=HEADERS
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_superadmin_cannot_change_own_role(client: AsyncClient, logged_in) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    response = await client.patch(
        f"/api/v1/users/{me.id}", json={"role": "user"}, headers=HEADERS
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_superadmin_cannot_lock_itself(client: AsyncClient, logged_in) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    response = await client.post(f"/api/v1/users/{me.id}/lock", headers=HEADERS)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_lock_revokes_every_session_of_that_account(
    client: AsyncClient, logged_in, user_factory, db_session
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    assert (await client.post(f"/api/v1/users/{victim.id}/lock", headers=HEADERS)).status_code == 204
    from sqlalchemy import func, select

    from app.core.identity import UserSession

    remaining = await db_session.scalar(
        select(func.count()).select_from(UserSession).where(UserSession.user_id == victim.id)
    )
    assert remaining == 0


@pytest.mark.asyncio
async def test_unknown_user_is_not_found(client: AsyncClient, logged_in) -> None:
    import uuid

    await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get(f"/api/v1/users/{uuid.uuid4()}")).status_code == 404
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_user_endpoints.py -v`
Expected: FAIL, 404 vì chưa có endpoint.

- [ ] **Step 3: Viết service quản lý tài khoản**

Bổ sung vào `backend/app/user/service.py`:

```python
async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(detail="account does not exist")
    return user


async def create_user(
    session: AsyncSession,
    *,
    actor: User,
    username: str,
    display_name: str,
    password: str,
    role: UserRole,
) -> User:
    taken = await session.scalar(select(User.id).where(User.username == username))
    if taken is not None:
        raise ConflictError(detail="username is already taken")
    check_password_policy(password, user_inputs=[username, display_name])
    user = User(
        username=username,
        display_name=display_name,
        password_hash=hash_password(password),
        role=role.value,
    )
    session.add(user)
    await session.flush()
    await audit_service.record(
        session, action="user_created", user_id=actor.id, resource_type="user", resource_id=user.id
    )
    return user


async def update_user(
    session: AsyncSession,
    *,
    actor: User,
    user_id: uuid.UUID,
    display_name: str | None,
    role: UserRole | None,
) -> User:
    user = await get_user(session, user_id)
    if role is not None and user.id == actor.id:
        # Keeping at least one Superadmin: docs/security/authorization.md
        raise ForbiddenError(detail="an account cannot change its own role")
    if display_name is not None:
        user.display_name = display_name
    if role is not None:
        user.role = role.value
        await audit_service.record(
            session,
            action="user_role_changed",
            user_id=actor.id,
            resource_type="user",
            resource_id=user.id,
            detail={"role": role.value},
        )
    await audit_service.record(
        session, action="user_updated", user_id=actor.id, resource_type="user", resource_id=user.id
    )
    return user


async def set_locked(
    session: AsyncSession, *, actor: User, user_id: uuid.UUID, locked: bool
) -> None:
    user = await get_user(session, user_id)
    if locked and user.id == actor.id:
        raise ForbiddenError(detail="an account cannot lock itself")
    user.is_locked = locked
    if locked:
        await session.execute(delete(UserSession).where(UserSession.user_id == user.id))
    await audit_service.record(
        session,
        action="user_locked" if locked else "user_unlocked",
        user_id=actor.id,
        resource_type="user",
        resource_id=user.id,
    )
```

Thêm `ForbiddenError` vào danh sách import từ `app.core.errors`.

- [ ] **Step 4: Viết endpoint quản lý tài khoản**

Bổ sung vào `backend/app/user/router.py`. Mẫu cho một endpoint, lặp lại cho các endpoint còn lại:

```python
from app.core.security import require_roles
from app.core.identity import UserRole

superadmin_only = require_roles(UserRole.SUPERADMIN)


async def superadmin(request: Request, user: CurrentUser) -> User:
    # The guard takes the request so a denial records the method, path and IP.
    return await superadmin_only(user, request)


Superadmin = Annotated[User, Depends(superadmin)]


@router.post("/users", response_model=UserResponse, tags=["user"])
async def create_user(
    request: Request,
    body: UserCreateRequest,
    actor: Superadmin,
    session: DbDep,
    settings: SettingsDep,
) -> User:
    enforce_csrf(request, settings)
    return await service.create_user(
        session,
        actor=actor,
        username=body.username,
        display_name=body.display_name,
        password=body.password,
        role=body.role,
    )
```

Sáu endpoint còn lại:

```python
@router.get("/users", response_model=Page[UserResponse], tags=["user"])
async def list_users(
    actor: Superadmin, session: DbDep, limit: int = DEFAULT_LIMIT, cursor: str | None = None
) -> Page[UserResponse]:
    return await service.list_users(session, limit=limit, cursor=cursor)


@router.get("/users/{user_id}", response_model=UserResponse, tags=["user"])
async def read_user(user_id: uuid.UUID, actor: Superadmin, session: DbDep) -> User:
    return await service.get_user(session, user_id)


@router.patch("/users/{user_id}", response_model=UserResponse, tags=["user"])
async def patch_user(
    request: Request,
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    actor: Superadmin,
    session: DbDep,
    settings: SettingsDep,
) -> User:
    enforce_csrf(request, settings)
    return await service.update_user(
        session, actor=actor, user_id=user_id, display_name=body.display_name, role=body.role
    )


@router.post("/users/{user_id}/lock", status_code=204, tags=["user"])
async def lock_user(
    request: Request, user_id: uuid.UUID, actor: Superadmin, session: DbDep, settings: SettingsDep
) -> None:
    enforce_csrf(request, settings)
    await service.set_locked(session, actor=actor, user_id=user_id, locked=True)


@router.post("/users/{user_id}/unlock", status_code=204, tags=["user"])
async def unlock_user(
    request: Request, user_id: uuid.UUID, actor: Superadmin, session: DbDep, settings: SettingsDep
) -> None:
    enforce_csrf(request, settings)
    await service.set_locked(session, actor=actor, user_id=user_id, locked=False)


@router.get("/users/{user_id}/sessions", response_model=Page[UserSessionResponse], tags=["user"])
async def list_user_sessions(
    user_id: uuid.UUID,
    actor: Superadmin,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> Page[UserSessionResponse]:
    return await service.list_sessions_for_user(
        session, user_id=user_id, limit=limit, cursor=cursor
    )
```

- [ ] **Step 4A: Thêm hàm giải mã cursor thời gian vào `core/pagination.py`**

`decode_cursor` chỉ bảo đảm hình dạng, không bảo đảm kiểu của giá trị sắp xếp. Đưa thẳng giá trị đó vào `datetime.fromisoformat` thì cursor độc hại thành lỗi 500. Cả Task 10 và Task 11 đều phân trang theo cột thời gian nên hàm này đặt ở `core/pagination.py`, không chép hai nơi.

```python
def decode_time_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    """Decode a cursor whose sort value is an ISO 8601 timestamp.

    decode_cursor guarantees the shape only, so a hostile sort value has to
    become a 400 here rather than a database error later.
    """
    sort_value, row_id = decode_cursor(cursor)
    if not isinstance(sort_value, str):
        raise BadRequestError(detail="cursor is not valid")
    try:
        return datetime.fromisoformat(sort_value), row_id
    except ValueError as err:
        raise BadRequestError(detail="cursor is not valid") from err
```

Thêm `from datetime import datetime` vào đầu file. Đồng thời thu hẹp kiểu tham số của `encode_cursor` từ `object` thành `str | int | float`, để truyền nhầm một `datetime` bị mypy bắt ngay ở nơi gọi thay vì sinh lỗi 500 lúc chạy.

Test bổ sung trong `backend/tests/test_pagination.py`:

```python
@pytest.mark.parametrize("sort_value", ["not-a-timestamp", 7, None, {"a": 1}])
def test_time_cursor_rejects_a_sort_value_that_is_not_a_timestamp(sort_value: object) -> None:
    with pytest.raises(BadRequestError):
        decode_time_cursor(encode_cursor_raw(sort_value, uuid.uuid4()))


def test_time_cursor_round_trips() -> None:
    moment = datetime(2026, 11, 3, 8, 0, tzinfo=UTC)
    row_id = uuid.uuid4()
    assert decode_time_cursor(encode_cursor(moment.isoformat(), row_id)) == (moment, row_id)
```

`encode_cursor_raw` là một hàm trợ giúp trong file test dựng cursor từ giá trị tuỳ ý, vì `encode_cursor` đã thu hẹp kiểu.

- [ ] **Step 4B: Viết hai hàm phân trang của module user**

Bổ sung vào `backend/app/user/service.py`:

```python
def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


async def list_users(session: AsyncSession, *, limit: int, cursor: str | None) -> Page[UserResponse]:
    size = _clamp(limit)
    stmt = select(User).order_by(User.created_at.desc(), User.id.desc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(User.created_at, User.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).scalars().all())
    total = await session.scalar(select(func.count()).select_from(User)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[UserResponse](
        items=[UserResponse.model_validate(row, from_attributes=True) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )


async def list_sessions_for_user(
    session: AsyncSession, *, user_id: uuid.UUID, limit: int, cursor: str | None
) -> Page[UserSessionResponse]:
    await get_user(session, user_id)
    size = _clamp(limit)
    stmt = (
        select(UserSession)
        .where(UserSession.user_id == user_id)
        .order_by(UserSession.created_at.desc(), UserSession.id.desc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(UserSession.created_at, UserSession.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).scalars().all())
    total = (
        await session.scalar(
            select(func.count()).select_from(UserSession).where(UserSession.user_id == user_id)
        )
        or 0
    )
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[UserSessionResponse](
        items=[
            UserSessionResponse.model_validate(row, from_attributes=True) for row in page_rows
        ],
        next_cursor=next_cursor,
        total=total,
    )
```

Thêm import `tuple_` từ `sqlalchemy`, `Page`, `DEFAULT_LIMIT`, `MAX_LIMIT`, `decode_time_cursor`, `encode_cursor` từ `app.core.pagination`, và `UserResponse`, `UserSessionResponse` từ `app.user.schemas`.

- [ ] **Step 5: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_user_endpoints.py -v`
Expected: PASS

- [ ] **Step 6: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/user backend/tests/test_user_endpoints.py
git commit -m "feat(user): account management for Superadmin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Thu hồi phiên và đọc nhật ký thao tác

**Files:**
- Modify: `backend/app/user/router.py`, `backend/app/user/service.py`
- Create: `backend/app/audit_log/schemas.py`, `backend/app/audit_log/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_audit_log_endpoints.py`

**Interfaces:**
- Produces: `DELETE /user-sessions/{user_session_id}` cho Superadmin, `GET /audit-logs` cho Superadmin và Admin.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_audit_log_endpoints.py`:

```python
import pytest
from httpx import AsyncClient

from app.core.identity import UserRole

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 200), (UserRole.USER, 403)],
)
async def test_audit_list_by_role(client: AsyncClient, logged_in, role, expected) -> None:
    await logged_in(role=role)
    assert (await client.get("/api/v1/audit-logs")).status_code == expected


@pytest.mark.asyncio
async def test_audit_list_without_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/audit-logs")).status_code == 401


@pytest.mark.asyncio
async def test_audit_list_contains_the_login(client: AsyncClient, logged_in) -> None:
    await logged_in(role=UserRole.ADMIN)
    body = (await client.get("/api/v1/audit-logs")).json()
    assert any(item["action"] == "login_succeeded" for item in body["items"])
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_bad_cursor_is_rejected(client: AsyncClient, logged_in) -> None:
    await logged_in(role=UserRole.ADMIN)
    assert (await client.get("/api/v1/audit-logs?cursor=not-a-cursor")).status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 204), (UserRole.ADMIN, 403), (UserRole.USER, 403)],
)
async def test_revoke_session_by_role(
    client: AsyncClient, logged_in, user_factory, db_session, role, expected
) -> None:
    await logged_in(role=role)
    victim = await user_factory(role=UserRole.USER)
    from datetime import UTC, datetime, timedelta

    from app.core.security import hash_session_id, new_session_id
    from app.core.identity import UserSession

    raw = new_session_id()
    victim_session = UserSession(
        user_id=victim.id,
        session_hash=hash_session_id(raw),
        expires_at=datetime.now(UTC) + timedelta(hours=12),
    )
    db_session.add(victim_session)
    await db_session.flush()
    response = await client.delete(
        f"/api/v1/user-sessions/{victim_session.id}", headers=HEADERS
    )
    assert response.status_code == expected
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_audit_log_endpoints.py -v`
Expected: FAIL, 404 vì chưa có endpoint.

- [ ] **Step 3: Viết schema và service đọc nhật ký**

Tạo `backend/app/audit_log/schemas.py`:

```python
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    resource_type: str | None
    resource_id: uuid.UUID | None
    detail: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime
```

Thêm vào `backend/app/audit_log/service.py`:

```python
async def list_entries(
    session: AsyncSession,
    *,
    limit: int,
    cursor: str | None,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    created_at_from: datetime | None = None,
    created_at_to: datetime | None = None,
) -> Page[AuditLogResponse]:
    size = max(1, min(limit, MAX_LIMIT))
    conditions = []
    if user_id is not None:
        conditions.append(AuditLog.user_id == user_id)
    if action is not None:
        conditions.append(AuditLog.action == action)
    if created_at_from is not None:
        conditions.append(AuditLog.created_at >= created_at_from)
    if created_at_to is not None:
        conditions.append(AuditLog.created_at <= created_at_to)

    stmt = (
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(AuditLog.created_at, AuditLog.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).scalars().all())
    total = (
        await session.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    )
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[AuditLogResponse](
        items=[AuditLogResponse.model_validate(row, from_attributes=True) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )
```

- [ ] **Step 4: Viết router nhật ký và endpoint thu hồi phiên**

Tạo `backend/app/audit_log/router.py`:

```python
"""Read side of the operator action log. Superadmin and Admin only."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.audit_log import service
from app.audit_log.schemas import AuditLogResponse
from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles

router = APIRouter(prefix="/api/v1", tags=["audit_log"])

audit_reader = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def audit_viewer(request: Request, user: CurrentUser) -> User:
    return await audit_reader(user, request)


Reader = Annotated[User, Depends(audit_viewer)]


@router.get("/audit-logs", response_model=Page[AuditLogResponse])
async def list_audit_logs(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    created_at_from: datetime | None = None,
    created_at_to: datetime | None = None,
) -> Page[AuditLogResponse]:
    return await service.list_entries(
        session,
        limit=limit,
        cursor=cursor,
        user_id=user_id,
        action=action,
        created_at_from=created_at_from,
        created_at_to=created_at_to,
    )
```

Gắn router vào `backend/app/main.py`.

Router này lấy `CurrentUser`, `DbDep` từ `app.core.deps` và `require_roles` từ `app.core.security`. Mọi module ở mọi tầng đều lấy dependency từ `core`, không module nào gọi lên module khác.

Thêm vào `backend/app/user/service.py`:

```python
async def revoke_session(
    session: AsyncSession, *, actor: User, user_session_id: uuid.UUID
) -> None:
    found = await session.get(UserSession, user_session_id)
    if found is None:
        raise NotFoundError(detail="session does not exist")
    await session.delete(found)
    await audit_service.record(
        session,
        action="session_revoked",
        user_id=actor.id,
        resource_type="user_session",
        resource_id=user_session_id,
    )
```

Thêm endpoint `DELETE /user-sessions/{user_session_id}` vào `backend/app/user/router.py` theo mẫu của Task 10.

- [ ] **Step 5: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_audit_log_endpoints.py -v`
Expected: PASS

- [ ] **Step 6: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/audit_log backend/app/user backend/app/main.py backend/tests/test_audit_log_endpoints.py
git commit -m "feat(audit_log): list endpoint and session revocation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Lệnh bootstrap tài khoản Superadmin đầu tiên

**Files:**
- Create: `backend/app/bootstrap.py`
- Modify: `Makefile`
- Test: `backend/tests/test_bootstrap.py`

**Interfaces:**
- Consumes: `Settings`, `User`, `check_password_policy`, `hash_password`, `audit_service.record`.
- Produces: `async run_bootstrap(session: AsyncSession, settings: Settings) -> bool` trả `True` khi tạo mới, `False` khi bỏ qua. `main() -> int` dùng cho `python -m app.bootstrap`.

- [ ] **Step 1: Viết test**

Tạo `backend/tests/test_bootstrap.py`:

```python
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import BootstrapConfigError, run_bootstrap
from app.core.identity import User, UserRole

PASSWORD = "troutmoonlit7Ladder!quay"


@pytest.mark.asyncio
async def test_creates_the_first_superadmin(db_session: AsyncSession, settings_factory) -> None:
    settings = settings_factory(
        bootstrap_admin_username="rootadmin", bootstrap_admin_password=PASSWORD
    )
    assert await run_bootstrap(db_session, settings) is True
    created = await db_session.scalar(select(User).where(User.username == "rootadmin"))
    assert created is not None
    assert created.role == UserRole.SUPERADMIN.value


@pytest.mark.asyncio
async def test_second_run_changes_nothing(
    db_session: AsyncSession, settings_factory, user_factory
) -> None:
    existing = await user_factory(role=UserRole.SUPERADMIN)
    settings = settings_factory(
        bootstrap_admin_username="rootadmin", bootstrap_admin_password=PASSWORD
    )
    assert await run_bootstrap(db_session, settings) is False
    total = await db_session.scalar(select(func.count()).select_from(User))
    assert total == 1
    assert (await db_session.get(User, existing.id)).username == existing.username


@pytest.mark.asyncio
async def test_missing_variables_raise(db_session: AsyncSession, settings_factory) -> None:
    with pytest.raises(BootstrapConfigError):
        await run_bootstrap(db_session, settings_factory())


@pytest.mark.asyncio
async def test_weak_password_raises(db_session: AsyncSession, settings_factory) -> None:
    from app.core.errors import ValidationFailedError

    settings = settings_factory(
        bootstrap_admin_username="rootadmin", bootstrap_admin_password="password1234"
    )
    with pytest.raises(ValidationFailedError):
        await run_bootstrap(db_session, settings)
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_bootstrap.py -v`
Expected: FAIL, `ModuleNotFoundError: app.bootstrap`.

- [ ] **Step 3: Viết lệnh bootstrap**

Tạo `backend/app/bootstrap.py`:

```python
"""Create the first Superadmin account.

Runs once, when the user table is still empty. A later run leaves the stored
account untouched, so changing the variables never rewrites a real password:
docs/security/authentication.md.
"""

import asyncio
import sys

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log import service as audit_service
from app.core.config import Settings, get_settings
from app.core.db import build_engine, session_scope
from app.core.security import check_password_policy, hash_password
from app.core.identity import User, UserRole

log = structlog.get_logger()


class BootstrapConfigError(Exception):
    """The user table is empty but the bootstrap variables are missing."""


async def run_bootstrap(session: AsyncSession, settings: Settings) -> bool:
    existing = await session.scalar(select(func.count()).select_from(User))
    if existing:
        log.info("bootstrap_skipped", accounts=existing)
        return False
    username = settings.bootstrap_admin_username
    password = settings.bootstrap_admin_password
    if username is None or password is None:
        raise BootstrapConfigError(
            "RECONOS_BOOTSTRAP_ADMIN_USERNAME and RECONOS_BOOTSTRAP_ADMIN_PASSWORD are required"
        )
    secret = password.get_secret_value()
    check_password_policy(secret, user_inputs=[username])
    user = User(
        username=username,
        display_name=username,
        password_hash=hash_password(secret),
        role=UserRole.SUPERADMIN.value,
    )
    session.add(user)
    await session.flush()
    # A system action: no account performed it.
    await audit_service.record(
        session, action="user_created", resource_type="user", resource_id=user.id
    )
    log.info("bootstrap_created", username=username)
    return True


async def _run() -> int:
    settings = get_settings()
    engine = build_engine(settings)
    try:
        async with session_scope(engine) as session:
            await run_bootstrap(session, settings)
    except BootstrapConfigError:
        log.critical("bootstrap_missing_configuration")
        return 1
    finally:
        await engine.dispose()
    return 0


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Chạy test, xác nhận đạt**

Run: `uv run pytest backend/tests/test_bootstrap.py -v`
Expected: PASS

- [ ] **Step 5: Thêm target vào Makefile**

```makefile
bootstrap:
	uv run --directory backend python -m app.bootstrap
```

Thêm `bootstrap` vào danh sách `.PHONY`.

- [ ] **Step 6: Chạy thử trên CSDL phát triển**

```bash
make dev-up && make migrate
RECONOS_BOOTSTRAP_ADMIN_USERNAME=rootadmin RECONOS_BOOTSTRAP_ADMIN_PASSWORD='troutmoonlit7Ladder!quay' make bootstrap
make bootstrap
```

Expected: lần đầu ghi `bootstrap_created`, lần sau ghi `bootstrap_skipped`, cả hai thoát với mã 0.

- [ ] **Step 7: Lint và commit**

```bash
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
git add backend/app/bootstrap.py backend/tests/test_bootstrap.py Makefile
git commit -m "feat(user): bootstrap the first Superadmin from the environment

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Sinh lại OpenAPI, đồng bộ tài liệu và kiểm tra toàn đợt

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `backend/CLAUDE.md`
- Modify: `docs/architecture/tech-stack.md`
- Modify: `docs/documentation-roadmap.md`

- [ ] **Step 1: Sinh openapi.yaml từ FastAPI và đối chiếu**

```bash
uv run python -c "
import json, yaml
from app.main import app
print(yaml.safe_dump(app.openapi(), allow_unicode=True, sort_keys=False))
" > /tmp/openapi-generated.yaml
```

So 13 endpoint của đợt này với bản viết tay. Đường dẫn, phương thức hoặc vai trò lệch nhau thì sửa mã cho khớp tài liệu, không sửa tài liệu để khớp mã. Bản viết tay còn endpoint của các đợt sau nên chưa thay thế toàn bộ file.

- [ ] **Step 2: Cập nhật danh sách file core trong backend/CLAUDE.md**

Sửa dòng liệt kê mã dùng chung thành: `config.py`, `db.py`, `security.py`, `crypto.py`, `errors.py`, `logging.py`, `storage.py`, `realtime.py`, `pagination.py`, `system_setting.py`.

Thêm dòng lệnh `make bootstrap` nếu chưa có trong bảng Build và test.

- [ ] **Step 3: Ghi zxcvbn vào tech-stack nếu đã thêm khai báo mypy**

Nếu Task 1 bước 10 phải thêm `[[tool.mypy.overrides]]`, bổ sung `zxcvbn` vào dòng cảnh báo thư viện không có `py.typed` trong [tech-stack.md](../../architecture/tech-stack.md).

- [ ] **Step 4: Cập nhật bảng theo dõi tài liệu**

Mọi file tài liệu vừa sửa: tăng phiên bản, chuyển 🔵 Chờ duyệt, cập nhật cột Cập nhật và dòng Tiến độ trong [documentation-roadmap.md](../../documentation-roadmap.md). ❌ Không tự chuyển sang 🟢 Xong.

- [ ] **Step 5: Chạy toàn bộ kiểm tra**

```bash
make lint
make test
make test-coverage
```

Expected: tất cả đạt, độ phủ nhánh của `backend/app/core/security.py` bằng 100%.

- [ ] **Step 6: Đối chiếu tiêu chí hoàn thành của spec**

Mở [spec 2a](../specs/2026-11-03-batch2a-backend-auth-design.md) mục Tiêu chí hoàn thành và xác nhận từng dòng.

- [ ] **Step 7: Commit cuối**

```bash
git add docs backend/CLAUDE.md
git commit -m "docs: sync batch 2a decisions and the generated API surface

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Rà soát kế hoạch

**Phủ spec:** 5 bảng ở Task 4. `core/security.py` ở Task 1, 2, 3, 7. Ghi nhật ký khi request thất bại ở Task 6. 12 endpoint của module `user` ở Task 9, 10, 11. Module `audit_log` ở Task 6 và 11. Phân trang cursor ở Task 8. Ngưỡng vận hành ở Task 5. Lệnh `bootstrap` ở Task 12. Test bắt buộc trải từ Task 1 đến Task 12. Tiêu chí hoàn thành ở Task 13.

**Tên hàm dùng xuyên suốt:** `hash_password`, `verify_password`, `password_needs_rehash`, `burn_password_comparison`, `check_password_policy`, `new_session_id`, `hash_session_id`, `session_id_matches`, `session_cookie`, `enforce_csrf`, `load_current_user`, `require_roles`, `allowed_program_ids`, `get_int_setting`, `clear_setting_cache`, `independent_session`, `record`, `record_detached`, `encode_cursor`, `decode_cursor`, `run_bootstrap`.

**Điểm dễ sai:**
- `user` là từ khóa của PostgreSQL. Giữ tên bảng, để SQLAlchemy tự đặt dấu nháy.
- `record_detached` và `record_failed_login` mở engine riêng. Luôn `dispose` engine để test không rò kết nối.
- Fixture `db_session` chạy trong transaction và rollback khi xong, nên test nào kiểm tra bản ghi ghi qua session độc lập phải tự dọn dòng đó.

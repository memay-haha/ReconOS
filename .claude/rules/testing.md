---
paths:
  - "backend/**"
  - "frontend/**"
  - "workers/**"
  - "contracts/**"
---
# Kiểm thử

> Phiên bản: 1.5 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 21: Kiểm thử

## ✅ Bắt buộc

**Vị trí test:**

- Đặt test Python trong `<package>/tests/`.
- Đặt test frontend cạnh file mã: `*.test.ts`, `*.test.tsx`.
- Đặt test E2E (end-to-end) trong `frontend/e2e/`.
- Test chặn quy ước giao diện, ví dụ chặn chữ tiếng Việt lọt vào giao diện tiếng Anh, phải quét cả `frontend/src/` và `frontend/e2e/`. Chỉ quét `src/` thì bộ E2E hỏng mà không test nào báo.
- Dùng công cụ test và phiên bản theo [tech-stack.md](../../docs/architecture/tech-stack.md).

**Môi trường:**

- Chạy test backend với PostgreSQL, Redis, MinIO trong Docker Compose phát triển.
- Bật Docker Compose phát triển bằng lệnh trong `CLAUDE.md` trước khi chạy test.
- Dùng CSDL `reconos_test`, `reconos_log_test` và bucket MinIO riêng cho test. ❌ Không chạy test trên CSDL phát triển.
- Tạo schema test bằng migration Alembic, giống môi trường thật.
- Chạy mỗi test trong transaction, rollback khi xong.

**Test bắt buộc theo loại mã:**

| Mã | Test bắt buộc |
|---|---|
| Module `scope` | Bảng ca so khớp cho 4 dạng scope rule, In-Scope và Out-of-Scope, trường hợp biên trong [business-flow.md](../../docs/architecture/business-flow.md). Chạy trong CI (G5) |
| Phân quyền | Mỗi endpoint với từng vai trò. Tài khoản vai trò User gọi tài nguyên của program chưa được gán: trả `404` |
| Schema tham số tool module | Tham số hợp lệ được chấp nhận, tham số ngoài allowlist bị từ chối, ví dụ `--os-shell` của sqlmap |
| Parser | Đọc file output thô mẫu, kiểm tra tài sản, finding, `dedup_key`. Parse hai lần không tạo bản trùng |
| Runner | Kiểm tra danh sách đối số dựng ra từ tham số. Mock tiến trình con |
| Contract | Model trong `contracts/` từ chối dữ liệu sai. Backend và workers dùng cùng model |
| Chuyển trạng thái job | Chuyển hợp lệ và không hợp lệ, hai tiến trình cùng chuyển thì chỉ một tiến trình thành công |
| Lỗi | Mỗi lớp `AppError` trả đúng status, `code`, định dạng RFC 9457 |

- Viết test E2E bằng Playwright cho 4 luồng: đăng nhập, tạo job, duyệt job nhóm khai thác bằng tài khoản thứ hai, triage finding.
- Cho bộ E2E chạy được ngay sau `make init`: `frontend/playwright.config.ts` tự nạp biến môi trường của bộ test theo [configuration.md](../../docs/ops/configuration.md). ❌ Không bắt người chạy điền tay thông tin xác thực vào file thứ hai.

**Dữ liệu test:**

- Đặt output thô mẫu trong `backend/tests/fixtures/raw_output/<tool module>/`.
- Lấy output thô mẫu từ lần chạy thật, thay domain, IP bằng giá trị dành cho tài liệu.
- Dùng domain `example.com`, `example.org`, `*.test`.
- Dùng IP trong dải dành cho tài liệu `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`.
- Tạo đối tượng bằng hàm factory trong `tests/factories.py`.

**Độ phủ:**

- Đạt 100% nhánh cho: module `scope`, `backend/app/core/security.py`, schema tham số tool module trong `contracts/`.
- Không đặt ngưỡng cho phần còn lại. Rà soát theo bảng test bắt buộc.

## ❌ Cấm

- Gọi công cụ thật hoặc gửi request tới mục tiêu thật trong test.
- Gọi REST API engine thật trong test. Dùng server mock.
- Dùng SQLite thay PostgreSQL.
- Viết test phụ thuộc thứ tự chạy hoặc dữ liệu test khác để lại.
- Đặt thông tin xác thực thật trong fixture.
- Bỏ qua test scope, phân quyền bằng `skip` mà không có lý do và issue theo dõi.

## 💡 Ví dụ

✅ Đúng: bảng ca so khớp scope.

```python
@pytest.mark.parametrize(("rule", "target", "expected"), [
    ("*.example.com", "a.example.com", True),
    ("*.example.com", "example.com", False),
    ("198.51.100.0/24", "198.51.100.0/25", True),
    ("https://example.com/api/", "https://example.com/admin", False),
])
def test_rule_matches(rule: str, target: str, expected: bool) -> None:
    assert matches(parse_rule(rule), parse_target(target)) is expected
```

❌ Sai: chạy nuclei thật lên domain thật.

```python
def test_nuclei_runner() -> None:
    subprocess.run(["nuclei", "-u", "https://hackerone.com"])
```

## 🔍 Cách kiểm tra

```bash
uv run pytest --cov=app.core.security --cov=app.scope --cov=contracts --cov-branch --cov-fail-under=100 backend/tests contracts/tests
uv run pytest
pnpm --dir frontend test
pnpm --dir frontend exec playwright test
```

- `Makefile` chỉ giữ `make lint` và `make test`: [CLAUDE.md](../../CLAUDE.md). Lệnh độ phủ và Playwright gọi thẳng như trên.

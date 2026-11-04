---
paths:
  - "backend/**"
  - "frontend/**"
  - "workers/**"
  - "contracts/**"
---
# Quy ước viết mã

> Phiên bản: 1.2 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 22: Quy ước viết mã

## ✅ Bắt buộc

**Chung:**

- Đặt tên thực thể nghiệp vụ theo cột Tên trong mã của [glossary](../../docs/appendix/glossary.md).
- Viết comment, docstring, thông báo lỗi, commit message bằng tiếng Anh.
- Viết comment giải thích lý do, không mô tả lại mã.
- Đặt file theo [directory-structure.md](../../docs/architecture/directory-structure.md).
- Tạo đúng một runner và tối đa một parser cho mỗi tool module.
- Đặt tên file runner, parser theo tên tool module.

**Python, gồm `backend/`, `workers/`, `contracts/`:**

- Format và lint bằng ruff.
- Đặt cấu hình ruff trong `pyproject.toml` ở gốc repo.
- Ghi type hint cho mọi tham số và giá trị trả về.
- Chạy mypy chế độ strict, bật plugin Pydantic.
- Khai báo bỏ qua kiểu cho thư viện không có `py.typed` bằng mục `[[tool.mypy.overrides]]` trong `pyproject.toml`, không rải `# type: ignore` trong mã. Danh sách thư viện: [tech-stack.md](../../docs/architecture/tech-stack.md).
- Đặt tên: `snake_case` cho hàm, biến, module. `PascalCase` cho class. `UPPER_SNAKE_CASE` cho hằng số.
- Dùng `async` cho I/O trong backend: CSDL, Redis, MinIO, HTTP.
- Gọi module khác chỉ qua `service.py` của module đó.
- Gọi tiến trình con bằng danh sách đối số.

**TypeScript, gồm `frontend/`:**

- Bật `strict` trong `tsconfig.json`.
- Lint bằng ESLint với cấu hình của Next.js.
- Format bằng Prettier.
- Đặt tên: `camelCase` cho biến, hàm. `PascalCase` cho component, type, interface.
- Gọi Backend API chỉ qua client trong `src/lib/`.

## ❌ Cấm

- Import `backend/` từ `workers/` hoặc `contracts/`.
- Đặt logic hoặc model CSDL trong `contracts/`.
- Parse output thô trong `workers/` (G8).
- Gọi tiến trình con với `shell=True` hoặc ghép chuỗi lệnh.
- Dùng `# type: ignore` không kèm mã lỗi và lý do.
- Dùng kiểu `any` trong TypeScript.
- Dùng `print()` để ghi log. Ghi log bằng logger theo [logging.md](logging.md).
- Ghi thông tin xác thực vào mã: API key, token, mật khẩu (G7).
- Import hoặc sửa mã trong `_reference/`.

## 💡 Ví dụ

✅ Đúng: runner gọi công cụ bằng danh sách đối số, có type hint.

```python
async def run_nuclei(targets_file: Path, severity: Severity) -> RawOutput:
    # Argument list avoids shell injection from target names.
    args = ["nuclei", "-l", str(targets_file), "-severity", severity.value, "-jsonl"]
    return await run_tool(args)
```

❌ Sai: ghép chuỗi lệnh, không type hint, comment tiếng Việt mô tả lại mã.

```python
def run_nuclei(targets, sev):
    # chạy nuclei
    os.system(f"nuclei -l {targets} -severity {sev}")
```

## 🔍 Cách kiểm tra

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy backend workers contracts
pnpm --dir frontend lint
pnpm --dir frontend exec prettier --check .
pnpm --dir frontend exec tsc --noEmit
```

- `make lint` chạy đủ các lệnh trên: [CLAUDE.md](../../CLAUDE.md).

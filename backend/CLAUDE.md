# Backend

Mã chạy thành 4 tiến trình: Backend API, dispatcher, tiến trình nền, Celery Beat. Vai trò: [system.md](../docs/architecture/system.md). Quy tắc chung: [CLAUDE.md](../CLAUDE.md), [.claude/rules/](../.claude/rules/).

## 🚫 Cấm

- Gọi module tầng trên hoặc service của module cùng tầng: [dependency-graph.md](../docs/architecture/dependency-graph.md).
- Tạo tầng repository, truy vấn trong `router.py`, tự commit trong service ở luồng request: [design-patterns.md](../.claude/rules/design-patterns.md).
- Tạo job không qua service của `job`. Mọi job, kể cả job định kỳ, phải qua kiểm tra scope và tham số (G5).
- Sửa hoặc xóa object output thô trong parser (G8).
- Gửi task `parse` trước khi lưu xong output thô vào MinIO (G8).
- Dùng `HTTPException` trong service: [error-handling.md](../.claude/rules/error-handling.md).
- Sửa schema không qua migration Alembic.
- Sửa migration đã chạy.

## 📐 Quy ước

**Module:**

- Tạo đủ file cho mỗi module trong `app/<module>/`: `router.py`, `service.py`, `models.py`, `schemas.py`. Danh sách module: [modules.md](../docs/architecture/modules.md).
- Import model mới vào `app/core/models.py` để Alembic phát hiện.
- Đặt mã dùng chung trong `app/core/`: `config.py`, `db.py`, `security.py`, `crypto.py`, `errors.py`, `logging.py`, `storage.py`, `realtime.py`.

**Tiến trình nền:**

- Đặt Celery app, lịch Beat, task trong `app/background/`.
- Chỉ gọi service của module trong task, không đặt nghiệp vụ trong task.
- Dùng queue `parse`, `schedule`.
- Mở session CSDL riêng trong task, mỗi đơn vị công việc một transaction.

**Parser:**

- Viết một file cho mỗi tool module trong `app/parser/`.
- Cho parser kế thừa lớp cơ sở trong `base.py`, đăng ký trong `registry.py`.
- Đọc output thô dạng stream.
- Upsert theo lô.
- Tính `dedup_key` bắt đầu bằng tên tool module: [database.md](../docs/data/database.md).
- Coi output thô là dữ liệu không tin cậy: [security.md](../.claude/rules/security.md).
- Tạo output thô mẫu cho mỗi parser trong `tests/fixtures/raw_output/<tool module>/`.

**CSDL và API:**

- Đặt bảng, cột, giá trị liệt kê theo [schema.md](../docs/data/schema.md) và [erd.mermaid](../docs/data/erd.mermaid).
- Khi sửa schema: sửa cả hai file trong cùng thay đổi với migration.
- Thiết kế endpoint theo [api/architecture.md](../docs/api/architecture.md).
- Khi thêm endpoint: cập nhật [openapi.yaml](../docs/api/openapi.yaml).
- Thiết kế endpoint contract worker theo [external-services.md](../docs/integrations/external-services.md).

## 🛠️ Build và test

Chạy từ gốc repo sau `make dev-up`:

| Lệnh | Việc |
|---|---|
| `uv run alembic -c backend/alembic.ini upgrade head` | Chạy migration |
| `uv run alembic -c backend/alembic.ini revision --autogenerate -m "<mô tả>"` | Tạo migration, đọc lại trước khi commit |
| `uv run pytest backend/tests` | Test backend |
| `uv run uvicorn app.main:app --reload --app-dir backend` | Chạy Backend API khi phát triển |
| `uv run --directory backend python -m app.dispatcher` | Chạy dispatcher |
| `uv run --directory backend celery -A app.background.celery_app worker -Q parse,schedule` | Chạy tiến trình nền |

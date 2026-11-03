# Cấu trúc thư mục

> Phiên bản: 1.3 · Ngày: 2026-11-03 · Trạng thái: 🟢 Xong
> Mục 3: Cấu trúc thư mục
> Liên quan: [ADR cấu trúc repo](../decisions/adr-repo-structure.md), [tech-stack.md](tech-stack.md), [modules.md](modules.md)

## 📌 Đây là gì

- Vai trò của từng thư mục trong repo ReconOS và quy tắc đặt mã mới.
- Cây thư mục đầy đủ nằm trong [ADR cấu trúc repo](../decisions/adr-repo-structure.md), không chép lại ở đây.

## 🎯 Dùng để làm gì

- Biết đặt mã mới vào đâu mà không phá ranh giới giữa backend, worker, frontend.
- Thêm công cụ mới chỉ cần thêm file, không sửa lõi (G4). Giữ parser ở backend (G8).

## ⏰ Dùng khi nào

- Thêm file, module, công cụ mới. Rà soát mã đặt sai chỗ.
- Không dùng để tra phụ thuộc giữa module backend: xem [dependency-graph.md](dependency-graph.md).

## 📍 Ở đâu

- Gốc repo, một repo chứa toàn bộ hệ thống.
- Python: uv workspace gồm `backend/`, `workers/`, `contracts/`. Node.js: `frontend/` quản lý bằng pnpm.

## ⚙️ Làm như thế nào

### Thư mục cấp 1

| Thư mục | Vai trò | Được phép phụ thuộc |
|---|---|---|
| `backend/` | API, nghiệp vụ, dispatcher, parser, migration CSDL | `contracts/` |
| `workers/` | Celery worker chạy công cụ, gửi output thô về backend | `contracts/` |
| `contracts/` | Schema và hằng số của contract worker ↔ backend | Không phụ thuộc thư mục nào |
| `frontend/` | Giao diện Next.js, gọi API và WebSocket của backend | Không import mã Python |
| `infras/` | Cấu hình hạ tầng và triển khai. Chi tiết: [deployment.md](../ops/deployment.md) | |
| `docs/` | Tài liệu, ADR, thiết kế màn hình | |
| `.claude/` | Rules, skills, settings của Claude Code | |
| `_reference/` | Mã tham khảo | ❌ Chỉ đọc. Không import, không sửa |

- File ở gốc: `pyproject.toml` và `uv.lock` của uv workspace, `Makefile` chứa lệnh build, test, chạy cho toàn repo, `CLAUDE.md`, `README.md`, `.gitignore`.
- Không đưa vào quản lý phiên bản: `_reference/`, `data/`, `.codegraph/`, `.ua/`, `.claude/settings.local.json` và mọi file `.env`. Danh sách đầy đủ nằm trong `.gitignore` ở gốc repo.

### `backend/`

| Đường dẫn | Vai trò |
|---|---|
| `app/main.py` | Khởi tạo FastAPI, gắn router các module |
| `app/core/` | Mã dùng chung: cấu hình, kết nối CSDL, bảo mật, client object storage, realtime |
| `app/<module>/` | Một module nghiệp vụ. Tên thư mục theo tên trong mã của [glossary](../appendix/glossary.md) |
| `app/dispatcher/` | Mã của tiến trình dispatcher, chạy bằng `python -m app.dispatcher` |
| `app/background/` | Celery app của tiến trình nền và Celery Beat: `celery_app.py`, lịch trong `beat.py`, task trong `tasks.py` gọi service của module |
| `app/parser/` | Parser, một file một công cụ, đăng ký trong `registry.py` |
| `migrations/` | Migration Alembic |
| `tests/` | Test của backend |

- Mỗi module tự chứa: `router.py` là endpoint, `service.py` là nghiệp vụ, `models.py` là model SQLAlchemy, `schemas.py` là schema Pydantic.
- Module chỉ gọi module khác qua `service.py`.
- `app/core/models.py` import model của mọi module để Alembic tạo migration.
- Danh sách module và trách nhiệm: [modules.md](modules.md).
- Mã backend chạy thành nhiều tiến trình: Backend API, dispatcher, tiến trình nền, Celery Beat. Vai trò từng tiến trình: [system.md](system.md).

### `workers/`

| Đường dẫn | Vai trò |
|---|---|
| `worker/celery_app.py` | Cấu hình Celery của worker |
| `worker/tasks.py` | Nhận task theo `contracts/` |
| `worker/client.py` | Gọi API backend: báo trạng thái job, gửi output thô |
| `worker/runners/` | Runner, một file một công cụ, gọi công cụ qua tiến trình con |
| `tests/` | Test của worker |

- ❌ Không import `backend/`. Không truy cập CSDL. Không parse output.

### `contracts/`

| Đường dẫn | Vai trò |
|---|---|
| `contracts/tasks.py` | Tên task Celery, schema tham số job |
| `contracts/raw_output.py` | Schema output thô gửi về |
| `contracts/job_status.py` | Schema báo trạng thái job |
| `tests/` | Test của contract |

- Chỉ chứa schema Pydantic và hằng số. ❌ Không chứa logic, không chứa model CSDL.
- Nội dung contract: [external-services.md](../integrations/external-services.md).

### `frontend/`

| Đường dẫn | Vai trò |
|---|---|
| `src/app/` | Route theo màn hình trong `docs/design/screens/` |
| `src/components/` | Component dùng lại |
| `src/lib/` | Client gọi API backend, hàm tiện ích |
| `src/styles/` | CSS toàn cục |
| `src/types/` | Kiểu TypeScript |
| `public/` | Icon, ảnh, font |
| `e2e/` | Test E2E (end-to-end) bằng Playwright |

- Đặt test unit cạnh file mã: `JobTable.test.tsx`, `useJobs.test.ts`. Quy tắc: [testing.md](../../.claude/rules/testing.md).
- ❌ Không có `src/app/api/`. Không kết nối CSDL.

### Đặt mã mới

| Việc cần làm | Đặt ở |
|---|---|
| Thêm công cụ | `backend/app/parser/<công cụ>.py`, `workers/worker/runners/<công cụ>.py`, khai báo tool module |
| Thêm endpoint cho nghiệp vụ có sẵn | `router.py` và `service.py` của module đó |
| Đổi tham số task hoặc định dạng output thô | `contracts/`, sửa backend và workers trong cùng một commit |
| Thêm bảng CSDL | `models.py` của module, tạo migration trong `backend/migrations/` |
| Thêm màn hình | `frontend/src/app/<route>/` |

- Thêm file trong module có sẵn: không cần ADR.
- ⚠️ Thêm, bỏ, đổi tên thư mục cấp 1 hoặc module backend: viết ADR mới thay thế [ADR cấu trúc repo](../decisions/adr-repo-structure.md).

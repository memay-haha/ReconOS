# Tech stack

> Phiên bản: 1.7 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 2: Tech stack
> Liên quan: [ADR chọn tech stack](../decisions/adr-tech-stack.md), [directory-structure.md](directory-structure.md), [system.md](system.md)

## 📌 Đây là gì

- Danh sách công nghệ, phiên bản và vai trò của từng công nghệ trong ReconOS.
- Lý do chọn và phương án đã loại nằm ở [ADR chọn tech stack](../decisions/adr-tech-stack.md), không nhắc lại ở đây.

## 🎯 Dùng để làm gì

- Một nơi tra cứu phiên bản khi khởi tạo dự án, viết Dockerfile, cài môi trường dev.
- Giữ backend, worker, frontend dùng cùng phiên bản, tránh lệch giữa các máy chạy worker phân tán (G4).

## ⏰ Dùng khi nào

- Khởi tạo hoặc nâng cấp thư viện phụ thuộc, viết cấu hình triển khai.
- Không dùng để tra công cụ bảo mật như Osmedeus, nuclei: xem [external-services.md](../integrations/external-services.md).

## 📍 Ở đâu

- `backend/`, `workers/`: Python, khai báo trong `pyproject.toml`, khóa phiên bản bằng `uv.lock`.
- `frontend/`: Node.js, khai báo trong `package.json`, khóa phiên bản bằng `pnpm-lock.yaml`.
- Vai trò từng thư mục: [directory-structure.md](directory-structure.md).

## ⚙️ Làm như thế nào

### Quy tắc phiên bản

- Tài liệu ghi phiên bản chính. Phiên bản chính xác nằm trong lock file.
- Chọn phiên bản chính mới nhất đã phát hành chính thức và còn được hỗ trợ.
- ⚠️ Kiểm tra lại toàn bộ phiên bản khi khởi tạo mã. Số phiên bản trên mockup S15 chỉ là dữ liệu minh họa.
- Nâng phiên bản chính: cập nhật các bảng bên dưới cùng lúc với lock file.

### Nền tảng và hạ tầng

| Công nghệ | Phiên bản | Vai trò | Dùng ở |
|---|---|---|---|
| Python | 3.15 | Ngôn ngữ backend, dispatcher, worker, parser | backend, workers |
| PostgreSQL | 18 | CSDL chính: program, scope, tài sản, job, finding, metadata output thô | backend |
| Redis | 8 | Broker của Celery, pub/sub cho sự kiện realtime | backend, workers |
| MinIO | Bản community mới nhất | Object storage tương thích S3 (Amazon Simple Storage Service), lưu output thô (G8) | backend |
| Node.js | 26 LTS (Long-Term Support) | Runtime build và chạy server Next.js | frontend |

- Celery, SQLAlchemy, Pydantic, FastAPI, Alembic, asyncpg, aioboto3, argon2-cffi, cryptography chạy đạt trên Python 3.15.2, kiểm chứng ngày 03/11/2026.
- ⚠️ Celery và aioboto3 không có `py.typed`. Khai báo bỏ qua riêng cho hai module này khi chạy mypy strict: [coding-convention.md](../../.claude/rules/coding-convention.md).
- ⚠️ zxcvbn không có `py.typed`. Gói `types-zxcvbn` trong nhóm công cụ phát triển cung cấp stub cho mypy, không dùng khai báo bỏ qua.
- ⚠️ PostgreSQL 19 dự kiến phát hành ngày 19/11/2026. Chọn 18 cho đến khi 19 ra bản chính thức.
- ⚠️ MinIO dừng phát triển bản mã nguồn mở: không còn image công khai trên registry nào, repo archived từ 24/04/2026. Hệ thống dùng bản `RELEASE.2025-09-07T16-13-09Z` ghim theo digest, nạp từ file tar. Rủi ro và hướng thay thế: nợ 19 trong [tech-debt.md](../tech-debt.md).

### Backend và worker

| Thư viện | Phiên bản | Vai trò |
|---|---|---|
| FastAPI | Bản mới nhất | API REST và WebSocket |
| Pydantic | 2 | Kiểm tra dữ liệu vào ra của API, schema của contract |
| SQLAlchemy | 2, chế độ async | ORM (Object-Relational Mapping), ánh xạ kiểu `inet`, `cidr`, `JSONB` |
| Alembic | 1 | Migration schema CSDL |
| aioboto3 | Bản mới nhất | S3 client async: Backend API, tiến trình nền đọc ghi MinIO, multipart upload dạng stream |
| pydantic-settings | 2 | Nạp cấu hình từ biến môi trường, hỗ trợ hậu tố `_FILE` |
| structlog | Bản mới nhất | Log JSON có ngữ cảnh: [logging.md](../../.claude/rules/logging.md) |
| cryptography | Bản mới nhất | AES-256-GCM cho cột thông tin xác thực |
| Celery | 5 | Thực thi task trên worker: thử lại, timeout. Celery Beat tạo job quét định kỳ |
| asyncpg | Bản mới nhất | Driver PostgreSQL của SQLAlchemy chế độ async và của migration Alembic |
| argon2-cffi | Bản mới nhất | Băm mật khẩu Argon2id: [authentication.md](../security/authentication.md) |
| zxcvbn | Bản mới nhất | Chấm điểm độ mạnh mật khẩu, chặn mật khẩu phổ biến: [authentication.md](../security/authentication.md) |
| httpx | Bản mới nhất | Client HTTP của worker gọi Backend API và REST API của engine, đặt timeout cho mọi lời gọi |
| uvicorn | Bản mới nhất | ASGI (Asynchronous Server Gateway Interface) server chạy Backend API |

- Dispatcher là tiến trình riêng của ReconOS, gửi task qua Celery. Cơ chế: [system.md](system.md).
- Worker là Celery worker, gọi công cụ qua tiến trình con.
- Không dùng Celery result backend. Trạng thái job chỉ lưu ở PostgreSQL. Worker báo kết quả qua contract: [external-services.md](../integrations/external-services.md).

### Frontend

| Thư viện | Phiên bản | Vai trò |
|---|---|---|
| TypeScript | Bản mới nhất | Ngôn ngữ frontend |
| Next.js | 16 | Routing, layout cho các màn hình |
| React | Theo Next.js | Thư viện giao diện |
| Tailwind CSS | 4 | Định kiểu giao diện, dùng design token từ mockup trong `docs/design/screens/` |
| TanStack Query | 5 | Gọi API, cache, cập nhật dữ liệu khi nhận sự kiện WebSocket |
| TanStack Table | 8 | Bảng dữ liệu lớn: sắp xếp, lọc, phân trang. Headless, tự vẽ theo mockup |

- Frontend chỉ gọi API và WebSocket của backend. Không đặt nghiệp vụ trong Next.js.

### Công cụ phát triển

| Công cụ | Vai trò | Dùng ở |
|---|---|---|
| uv | Quản lý phiên bản Python, thư viện phụ thuộc, lock file | backend, workers |
| ruff | Lint và định dạng mã Python | backend, workers |
| mypy | Kiểm tra kiểu chế độ strict | backend, workers, contracts |
| pnpm | Quản lý thư viện phụ thuộc, lock file | frontend |
| pytest, pytest-asyncio, pytest-cov | Test Python, đo độ phủ | backend, workers, contracts |
| types-zxcvbn | Stub kiểu để mypy kiểm tra `zxcvbn` | backend |
| Vitest, Testing Library | Test hook, component | frontend |
| Playwright | Test E2E (end-to-end) | frontend |

- Quy tắc lint, định dạng mã, đặt tên: [coding-convention.md](../../.claude/rules/coding-convention.md).

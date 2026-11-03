# Tech stack

> Phiên bản: 1.3 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
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
| Python | 3.14 | Ngôn ngữ backend, dispatcher, worker, parser | backend, workers |
| PostgreSQL | 18 | CSDL chính: program, scope, tài sản, job, finding, metadata output thô | backend |
| Redis | 8 | Broker của Celery, pub/sub cho sự kiện realtime | backend, workers |
| MinIO | Bản community mới nhất | Object storage tương thích S3 (Amazon Simple Storage Service), lưu output thô (G8) | backend |
| Node.js | 26 LTS (Long-Term Support) | Runtime build và chạy server Next.js | frontend |

- ⚠️ Python 3.15 phát hành ngày 09/10/2026. Chưa xác minh Celery, SQLAlchemy, Pydantic có hỗ trợ 3.15 hay không. Kiểm tra lại khi khởi tạo mã.
- ⚠️ PostgreSQL 19 dự kiến phát hành ngày 19/11/2026. Chọn 18 cho đến khi 19 ra bản chính thức.
- ⚠️ Từ năm 2025, MinIO bản community bỏ phần quản trị trên web console, ngừng phát hành binary và Docker image dựng sẵn. Cách cài đặt và giấy phép: xem mục Hệ quả trong [ADR chọn tech stack](../decisions/adr-tech-stack.md).

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
| pnpm | Quản lý thư viện phụ thuộc, lock file | frontend |
| pytest, pytest-asyncio, pytest-cov | Test Python, đo độ phủ | backend, workers, contracts |
| Vitest, Testing Library | Test hook, component | frontend |
| Playwright | Test E2E (end-to-end) | frontend |

- Quy tắc lint, định dạng mã, đặt tên: [coding-convention.md](../../.claude/rules/coding-convention.md).

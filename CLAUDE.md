# ReconOS (Recon BB Dashboard)

Nền tảng điều phối công cụ bảo mật và lưu trữ output tập trung cho bug bounty: scope → tài sản → job quét → job khai thác → lưu output thô → triage finding → báo cáo. Chi tiết mục tiêu G1 đến G8: [docs/architecture/overview.md](docs/architecture/overview.md).

## 🚫 Cấm

- Dùng BBRF: cài đặt, đồng bộ, gọi API (G1).
- Tạo job cho mục tiêu không khớp In-Scope hoặc khớp Out-of-Scope (G5).
- Cho người tạo job nhóm khai thác tự duyệt job đó, kể cả Superadmin (G5).
- Parse trước khi lưu output thô (G8).
- Đặt parser trong worker (G8).
- Ghi thông tin xác thực vào mã, log, giao diện: API key, token, mật khẩu (G7).
- Import hoặc sửa mã trong `_reference/`. Thư mục này chỉ để đọc tham khảo.

## 📐 Quy ước

- Coi tài liệu trong `docs/` là đặc tả. Khi mã cần quyết định chưa có trong tài liệu, hoặc tài liệu mâu thuẫn nhau: dừng, hỏi người dùng, rồi đồng bộ theo doc-sync.md. Không tự chọn.
- Dùng đúng thuật ngữ trong [docs/appendix/glossary.md](docs/appendix/glossary.md) khi đặt tên bảng, biến, endpoint và viết tài liệu.
- Khi có quyết định mới hoặc quyết định thay đổi, kể cả thuật ngữ: sửa tài liệu theo [.claude/rules/doc-sync.md](.claude/rules/doc-sync.md) trong cùng lượt.
- Quy tắc viết mã, viết tài liệu và quy trình nằm ở [.claude/rules/](.claude/rules/). Quy ước riêng từng phần: `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `workers/CLAUDE.md`.
- Viết và cập nhật tài liệu, ADR: theo [.claude/rules/documentation.md](.claude/rules/documentation.md).

## 📚 Chỉ mục tài liệu

| Chủ đề | File |
|---|---|
| Tổng quan, mục tiêu, phạm vi | [overview.md](docs/architecture/overview.md) |
| Tech stack, cấu trúc thư mục | [tech-stack.md](docs/architecture/tech-stack.md), [directory-structure.md](docs/architecture/directory-structure.md) |
| Kiến trúc hệ thống, module, đồ thị phụ thuộc | [system.md](docs/architecture/system.md), [modules.md](docs/architecture/modules.md), [dependency-graph.md](docs/architecture/dependency-graph.md) |
| Luồng nghiệp vụ, luồng request | [business-flow.md](docs/architecture/business-flow.md), [request-flow.md](docs/architecture/request-flow.md) |
| CSDL, schema | [database.md](docs/data/database.md), [schema.md](docs/data/schema.md), [erd.mermaid](docs/data/erd.mermaid) |
| API | [api/architecture.md](docs/api/architecture.md), [openapi.yaml](docs/api/openapi.yaml) |
| Công cụ bên ngoài, contract worker ↔ backend | [external-services.md](docs/integrations/external-services.md) |
| Xác thực, phân quyền, threat model | [authentication.md](docs/security/authentication.md), [authorization.md](docs/security/authorization.md), [threat-model.md](docs/security/threat-model.md) |
| Cấu hình, triển khai, hiệu năng, mở rộng | [configuration.md](docs/ops/configuration.md), [deployment.md](docs/ops/deployment.md), [performance.md](docs/ops/performance.md), [scalability.md](docs/ops/scalability.md) |
| Quyết định kiến trúc | [docs/decisions/](docs/decisions/) |
| Thiết kế màn hình | [docs/design/screens/](docs/design/screens/) |
| Glossary, nguồn tham khảo | [glossary.md](docs/appendix/glossary.md), [references.md](docs/appendix/references.md) |
| Nợ kỹ thuật, lộ trình sản phẩm | [tech-debt.md](docs/tech-debt.md), [roadmap.md](docs/roadmap.md) |
| Tiến độ tài liệu | [documentation-roadmap.md](docs/documentation-roadmap.md) |

Chỉ đọc file liên quan tới tác vụ đang làm, không đọc toàn bộ `docs/`.

## 🛠️ Build và test

Chạy từ gốc repo. Khi viết `Makefile` lúc bắt đầu viết mã, giữ đúng tên lệnh trong bảng dưới.

| Lệnh | Việc |
|---|---|
| `make dev-up`, `make dev-down` | Bật, tắt các container vùng lõi cho phát triển: `infras/compose/compose.dev.yaml` |
| `make migrate` | `alembic upgrade head` cho CSDL phát triển |
| `make lint` | ruff format, ruff check, mypy, ESLint, Prettier, `tsc`: [coding-convention.md](.claude/rules/coding-convention.md) |
| `make test` | pytest cho `backend/`, `workers/`, `contracts/` và Vitest cho `frontend/`. Cần `make dev-up` trước |
| `make test-coverage` | Độ phủ 100% nhánh cho scope, phân quyền, schema tham số: [testing.md](.claude/rules/testing.md) |
| `make e2e` | Playwright |
| `make build` | Build image `reconos-backend`, `reconos-frontend`, `reconos-worker` |
| `make engine-check` | Gọi thử Osmedeus, Vigolium qua HTTP. Địa chỉ trong biến `OSMEDEUS_URL`, `VIGOLIUM_URL` của `Makefile`, ghi đè được bằng `.env` |

- Chạy `make lint` và `make test` trước khi báo xong một thay đổi mã.
- Lệnh chưa có trong `Makefile`: báo rõ chưa chạy được, không báo đã qua.
- Triển khai, rollback: [deployment.md](docs/ops/deployment.md).

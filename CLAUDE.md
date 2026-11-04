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

- Coi tài liệu trong `docs/` là đặc tả. Khi mã cần quyết định chưa có trong tài liệu, hoặc tài liệu mâu thuẫn nhau: dừng, hỏi người dùng, rồi đồng bộ theo doc-sync.md. Không tự chọn. Riêng mockup lệch tài liệu: áp quy tắc mặc định trong mục Mockup lệch tài liệu của `frontend/CLAUDE.md`, không dừng hỏi.
- Dùng đúng thuật ngữ trong [docs/appendix/glossary.md](docs/appendix/glossary.md) khi đặt tên bảng, biến, endpoint và viết tài liệu.
- Khi có quyết định mới hoặc quyết định thay đổi, kể cả thuật ngữ: sửa tài liệu theo [.claude/rules/doc-sync.md](.claude/rules/doc-sync.md) trong cùng lượt.
- Quy tắc viết mã, viết tài liệu và quy trình nằm ở [.claude/rules/](.claude/rules/). Quy ước riêng từng phần: `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `workers/CLAUDE.md`.
- Viết và cập nhật tài liệu, ADR: theo [.claude/rules/documentation.md](.claude/rules/documentation.md).
- Mỗi đợt trong [roadmap.md](docs/roadmap.md) làm trên một nhánh riêng, tách từ `dev`.
- Đặt tên nhánh bằng tiếng Anh, chữ thường, kebab-case, theo mẫu `<loại>/<phần>-<chủ đề>`. Ví dụ: `feat/be-job-queue`, `fix/fe-login-redirect`, `chore/infra-compose-update`.
  - `<loại>`: `feat` tính năng mới, `fix` sửa lỗi, `hotfix` sửa gấp trên bản đang chạy, `refactor` đổi cấu trúc không đổi hành vi, `perf` hiệu năng, `test` thêm hoặc sửa test, `docs` tài liệu, `chore` việc phụ trợ như cấu hình, thư viện, skill, `ci` pipeline, `build` đóng gói, `release` chuẩn bị phát hành.
  - `<phần>`: `be`, `fe`, `workers`, `contracts`, `docs`, `infra`.
  - Chỉ dùng `a-z`, `0-9`, `-`, một dấu `/` sau loại. ❌ Không dấu tiếng Việt, khoảng trắng, chữ hoa, `_`.
- Tạo nhánh trước khi bắt đầu bất cứ việc gì của một đợt, kể cả thảo luận, viết spec, sửa tài liệu. ❌ Không sửa file khi đang đứng ở `dev`.
- Commit mọi thay đổi của đợt trên nhánh của đợt đó.
- Xong một đợt: merge nhánh đó vào `dev`, push `dev`, rồi lưu memory theo [agentmemory.md](.claude/rules/agentmemory.md).
- ❌ Không merge vào `main`. Chỉ người dùng merge `dev` vào `main`.
- Thiết kế kiến trúc và mã thành cơ chế chung áp dụng cho mọi trường hợp. ❌ Không tạo ngoại lệ, nhánh đặc biệt cho một trường hợp riêng.
- Trả lời ngắn gọn, chỉ nêu ý chính và việc cần người dùng quyết.

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

Chạy từ gốc repo. Giữ đúng tên lệnh trong bảng dưới. `Makefile` chỉ có 4 lệnh này, không thêm lệnh mới mà không hỏi.

| Lệnh | Việc |
|---|---|
| `make init` | Cài phụ thuộc bằng uv và pnpm, bật container vùng lõi (`infras/compose/compose.dev.yaml`), chạy migration cho CSDL `reconos` và CSDL log `reconos_log`, tạo tài khoản Superadmin đầu tiên từ `RECONOS_BOOTSTRAP_ADMIN_*`. Chạy lại được, không ghi đè tài khoản đã có |
| `make backend` | Chạy Backend API và frontend cùng lúc. Ctrl-C dừng cả hai. Cần `make init` trước |
| `make lint` | ruff format, ruff check, mypy, ESLint, Prettier, `tsc`: [coding-convention.md](.claude/rules/coding-convention.md) |
| `make test` | pytest cho `backend/`, `workers/`, `contracts/`, Vitest cho `frontend/`, rồi build frontend và quét bản build xem dữ liệu mẫu MSW có lọt vào không. Cần `make init` trước |

- Chạy `make lint` và `make test` trước khi báo xong một thay đổi mã.
- Lệnh chưa có trong `Makefile`: báo rõ chưa chạy được, không báo đã qua.
- Lệnh ngoài bảng gọi thẳng, không thêm vào `Makefile`: Playwright, độ phủ, build image, kiểm tra engine. Xem [testing.md](.claude/rules/testing.md) và [deployment.md](docs/ops/deployment.md).
- Triển khai, rollback: [deployment.md](docs/ops/deployment.md).

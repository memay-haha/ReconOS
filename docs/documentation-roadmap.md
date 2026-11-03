# 🗺️ ReconOS: Bảng theo dõi tài liệu

> Cập nhật: 2026-11-03
> Quy tắc viết và quy trình: [.claude/rules/documentation.md](../.claude/rules/documentation.md)

**Trạng thái:** 🔴 Chưa làm · 🟠 Có khung · 🟡 Đang làm · 🔵 Chờ duyệt · 🟢 Xong

**Tiến độ:** 🟢 38/40 · 🔵 2 · 🟡 0 · 🟠 0 · 🔴 0

| #  | Tài liệu                                   | Mục    | Phụ thuộc          | Trạng thái  | Cập nhật | Ghi chú                                                                   |
| -- | -------------------------------------------- | ------- | -------------------- | ------------- | ---------- | -------------------------------------------------------------------------- |
| 1  | `docs/architecture/overview.md`            | 1       | -                    | 🟢 Xong       | 2026-10-30 | v1.10: bỏ ý đang dùng BBRF |
| 2  | `docs/appendix/glossary.md`                | 27      | 1                    | 🟢 Xong        | 2026-11-02 | v1.10: thêm Tiền đề, Kế thừa, Phạm vi ảnh hưởng, Nguồn ảnh hưởng |
| 3  | `docs/decisions/adr-own-database.md`       | 24      | 1                    | 🟢 Xong       | 2026-11-01 | 2026-11-01: sửa từ ngữ theo vietnamese-writing |
| 4  | `docs/decisions/adr-tech-stack.md`         | 24      | 1                    | 🟢 Xong       | 2026-11-01 | 2026-11-01: sửa từ ngữ, lý do loại Vue và Svelte, JSONB không còn dùng cho trường tùy biến |
| 5  | `docs/decisions/adr-repo-structure.md`     | 24      | 4                    | 🟢 Xong       | 2026-11-01 | 2026-11-01: Monorepo, cây thư mục đầy đủ nằm trong ADR |
| 6  | `docs/architecture/tech-stack.md`          | 2       | 4                    | 🟢 Xong       | 2026-11-01 | v1.3: thêm pydantic-settings, structlog, cryptography, công cụ test |
| 7  | `docs/architecture/directory-structure.md` | 3       | 5, 6                 | 🔵 Chờ duyệt  | 2026-11-03 | v1.2: thêm `.gitignore` và danh sách thư mục không quản lý phiên bản |
| 8  | `docs/architecture/system.md`              | 4       | 1, 6                 | 🟢 Xong       | 2026-11-01 | v1.2: số lần thử lại của task `parse` chuyển từ error-handling |
| 9  | `docs/architecture/modules.md`             | 5       | 7, 8                 | 🟢 Xong        | 2026-11-01 | v1.2: thêm module `alert`, bổ sung trách nhiệm theo schema |
| 10 | `docs/architecture/dependency-graph.md`    | 12      | 9                    | 🟢 Xong        | 2026-11-01 | v1.1: `alert` ở tầng 1, worker gọi REST API của engine server |
| 11 | `docs/architecture/business-flow.md`       | 11      | 9                    | 🟢 Xong        | 2026-11-01 | v1.1: lưu trữ program |
| 12 | `docs/data/database.md`                    | 9       | 11                   | 🟢 Xong        | 2026-11-01 | v1.1: nơi ghi log chuyển từ logging.md |
| 13 | `docs/integrations/external-services.md`   | 13      | 9, 12                | 🟢 Xong       | 2026-11-01 | v1.2: bảng thử lại của worker, runner chuyển từ error-handling |
| 14 | `docs/security/authentication.md`          | 7       | 8                    | 🟢 Xong       | 2026-11-01 | v1.0: Mật khẩu Argon2id, phiên phía server, token worker |
| 15 | `docs/security/authorization.md`           | 8       | 9, 14                | 🟢 Xong        | 2026-11-01 | v1.1: lưu trữ, xóa cứng program, proxy, lịch quét định kỳ |
| 16 | `docs/security/threat-model.md`            | 17      | 8, 12, 15            | 🟢 Xong      | 2026-11-01 | v1.0: STRIDE, kiểm soát công cụ khai thác, rủi ro tồn dư |
| 17 | `docs/api/architecture.md`                 | 10      | 12, 15               | 🟢 Xong       | 2026-11-01 | v1.2: thêm `GET /health`. `openapi.yaml` có 109 thao tác |
| 18 | `docs/architecture/request-flow.md`        | 6       | 14, 17               | 🟢 Xong       | 2026-11-01 | v1.0: HTTP, tạo job, WebSocket, request của worker |
| 19 | `.claude/rules/coding-convention.md`       | 22      | 6, 7                 | 🟢 Xong       | 2026-11-01 | v1.0: ruff, mypy strict, ESLint, Prettier, comment tiếng Anh |
| 20 | `.claude/rules/design-patterns.md`         | 23      | 9                    | 🟢 Xong       | 2026-11-01 | v1.0: Router, service, plugin parser và runner, chống xử lý trùng |
| 21 | `.claude/rules/error-handling.md`          | 16      | 17                   | 🟢 Xong       | 2026-11-01 | v1.1: bảng thử lại chuyển sang system.md, external-services.md |
| 22 | `.claude/rules/logging.md`                 | 15      | 16                   | 🟢 Xong       | 2026-11-01 | v1.1: nơi ghi log chuyển sang database.md |
| 23 | `.claude/rules/testing.md`                 | 21      | 16                   | 🟢 Xong       | 2026-11-01 | v1.1: bỏ bảng công cụ trùng tech-stack |
| 24 | `.claude/rules/security.md`                | 17      | 16                   | 🟢 Xong       | 2026-11-01 | v1.0: Trích từ threat-model. AES-256-GCM, rule `S` của ruff |
| 25 | `docs/ops/configuration.md`                | 14      | 13                   | 🟢 Xong       | 2026-11-01 | v1.0: Biến môi trường `RECONOS_*`, hậu tố `_FILE`, `system_setting`, khóa mã hóa |
| 26 | `docs/ops/deployment.md`                   | 20      | 8, 25                | 🟢 Xong       | 2026-11-01 | v1.0: Docker Compose, Nginx, Uvicorn, chạy migration riêng, pg_dump và mc mirror |
| 27 | `docs/ops/performance.md`                  | 18      | 12                   | 🟢 Xong      | 2026-11-01 | v1.0: Keyset, upsert theo lô, stream output thô, cache Redis 30 giây |
| 28 | `docs/ops/scalability.md`                  | 19      | 13, 27               | 🟢 Xong       | 2026-11-01 | v1.0: Số bản chạy của từng tiến trình, thứ tự mở rộng CSDL, phân vùng |
| 29 | `CLAUDE.md`                                | 1, 2, 3 | 1, 6, 7, 19 đến 24 | 🔵 Chờ duyệt | 2026-11-02 | Thêm lệnh `make engine-check` |
| 30 | `docs/tech-debt.md`                        | 25      | -                    | 🔵 Chờ duyệt | 2026-11-02 | v1.3: nợ 12 xác nhận params và flow Osmedeus, phát hiện lệch workspace; nợ 14 Makefile; nợ 16 khôi phục chặn `.env` |
| 31 | `docs/roadmap.md`                          | 26      | 1                    | 🟢 Xong       | 2026-11-03 | v2.0 duyệt 2026-11-03: 13 đợt viết mã của phiên bản đầu. Bước chi tiết ở `docs/superpowers/specs/2026-11-02-implementation-roadmap-design.md` |
| 32 | `docs/appendix/references.md`              | 27      | -                    | 🟢 Xong       | 2026-11-01 | v1.3: thêm tên đầy đủ cho viết tắt, nhóm Viết tài liệu |
| 33 | `backend/CLAUDE.md`                        | -       | 12, 17, 19 đến 24  | 🟢 Xong       | 2026-11-01 | Module, tiến trình nền, parser, lệnh |
| 34 | `frontend/CLAUDE.md`                       | -       | 17, 19 đến 24      | 🟢 Xong       | 2026-11-01 | Màn hình, dữ liệu, mockup cần bỏ, lệnh |
| 35 | `workers/CLAUDE.md`                        | -       | 13, 19 đến 24      | 🟢 Xong       | 2026-11-01 | Contract, runner, lệnh |
| 36 | `docs/data/schema.md`                      | 9       | 11                   | 🟢 Xong        | 2026-11-01 | v1.0: Mô tả bảng, giá trị liệt kê, ràng buộc duy nhất. ERD đầy đủ ở `docs/data/erd.mermaid`. Thêm cột cho contract worker ↔ backend |
| 37 | `.claude/rules/vietnamese-writing.md`     | -       | -                    | 🟢 Xong       | 2026-11-01 | Do người dùng viết. Luôn nạp. Xung đột với documentation.md: mục 8 của documentation.md |
| 38 | `.claude/rules/doc-sync.md`                | -       | 2, 29                | 🟢 Xong        | 2026-11-02 | v1.2: thêm dòng đồng bộ bản đồ tài liệu và sơ đồ luồng |
| 39 | `docs/documentation-map.html`              | -       | 29, 38               | 🟢 Xong        | 2026-11-02 | Sơ đồ nhóm, đồ thị 40 file, mục đích từng file. Quy ước vẽ: mục 9 của documentation.md |
| 40 | `docs/system-flows.html`                   | -       | 8, 11, 13, 14, 18    | 🟢 Xong        | 2026-11-02 | Kiến trúc, 3 luồng request, 13 luồng tính năng. Quy ước vẽ: mục 10 của documentation.md |

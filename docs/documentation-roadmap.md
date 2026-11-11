# 🗺️ ReconOS: Bảng theo dõi tài liệu

> Cập nhật: 2026-11-12
> Quy tắc viết và quy trình: [.claude/rules/documentation.md](../.claude/rules/documentation.md)

**Trạng thái:** 🔴 Chưa làm · 🟠 Có khung · 🟡 Đang làm · 🔵 Chờ duyệt · 🟢 Xong

**Tiến độ:** 🟢 18/43 · 🔵 25 · 🟡 0 · 🟠 0 · 🔴 0

| #  | Tài liệu                                   | Mục    | Phụ thuộc          | Trạng thái  | Cập nhật | Ghi chú                                                                   |
| -- | -------------------------------------------- | ------- | -------------------- | ------------- | ---------- | -------------------------------------------------------------------------- |
| 1  | `docs/architecture/overview.md`            | 1       | -                    | 🟢 Xong       | 2026-10-30 | v1.10: bỏ ý đang dùng BBRF |
| 2 | `docs/appendix/glossary.md` | 27 | 1 | 🔵 Chờ duyệt | 2026-11-12 | v1.13: xóa mềm, bộ lọc đã lưu, lần chẩn đoán, độ ưu tiên job, phiên bản công cụ, cảnh báo chứng chỉ TLS |
| 3  | `docs/decisions/adr-own-database.md`       | 24      | 1                    | 🟢 Xong       | 2026-11-01 | 2026-11-01: sửa từ ngữ theo vietnamese-writing |
| 4  | `docs/decisions/adr-tech-stack.md`         | 24      | 1                    | 🟢 Xong       | 2026-11-01 | 2026-11-01: sửa từ ngữ, lý do loại Vue và Svelte, JSONB không còn dùng cho trường tùy biến |
| 5  | `docs/decisions/adr-repo-structure.md`     | 24      | 4                    | 🟢 Xong       | 2026-11-01 | 2026-11-01: Monorepo, cây thư mục đầy đủ nằm trong ADR |
| 6  | `docs/architecture/tech-stack.md`          | 2       | 4                    | 🟢 Xong       | 2026-11-04 | v1.8: thêm PyYAML, types-PyYAML vào công cụ phát triển |
| 7  | `docs/architecture/directory-structure.md` | 3       | 5, 6                 | 🔵 Chờ duyệt | 2026-11-04 | v1.7: `registry.ts` khai báo endpoint đã có backend, ghi chú `src/mocks/` |
| 8 | `docs/architecture/system.md` | 4 | 1, 6 | 🔵 Chờ duyệt | 2026-11-12 | v1.3: dispatcher chọn theo `priority`, NOTIFY khi Dispatch Now, Dispatch All |
| 9 | `docs/architecture/modules.md` | 5 | 7, 8 | 🔵 Chờ duyệt | 2026-11-12 | v1.6: bảng `saved_filter`, `diagnostic_run`, trách nhiệm mới của `job`, `engine`, `dashboard` |
| 10 | `docs/architecture/dependency-graph.md`    | 12      | 9                    | 🟢 Xong       | 2026-11-04 | v1.4: phần ghi nhật ký xuống `core`, sửa dòng join `user` cho khớp schema.md |
| 11 | `docs/architecture/business-flow.md` | 11 | 9 | 🔵 Chờ duyệt | 2026-11-12 | v1.3: độ ưu tiên, Dispatch Now, Dispatch All, Cleanup, xóa mềm domain, `service.closed_at` |
| 12 | `docs/data/database.md` | 9 | 11 | 🔵 Chờ duyệt | 2026-11-12 | v1.4: xóa mềm tài khoản, domain, screenshot |
| 13 | `docs/integrations/external-services.md` | 13 | 9, 12 | 🔵 Chờ duyệt | 2026-11-12 | v1.4: heartbeat báo công cụ và CPU, finish báo `tool_version`, dữ liệu gowitness mở rộng, đọc REST engine |
| 14 | `docs/security/authentication.md`          | 7       | 8                    | 🟢 Xong       | 2026-11-03 | v1.2: zxcvbn, cookie theo môi trường, bootstrap Superadmin, bảng danh tính ở `core` |
| 15 | `docs/security/authorization.md` | 8 | 9, 14 | 🔵 Chờ duyệt | 2026-11-12 | v1.9: xóa mềm, điều khiển hàng đợi, chẩn đoán, bộ lọc đã lưu, đọc ngưỡng công khai |
| 16 | `docs/security/threat-model.md` | 17 | 8, 12, 15 | 🔵 Chờ duyệt | 2026-11-12 | v1.7: không lưu giá trị cookie, `/health` chỉ 204, API key LLM, HTML trang dạng văn bản |
| 17 | `docs/api/architecture.md` | 10 | 12, 15 | 🔵 Chờ duyệt | 2026-11-12 | v1.17: giá trị `sort` của `/user-sessions`, sửa câu trường tính. v1.16: dạng response của search, job, screenshot, tool module, engine, chẩn đoán, lọc `alert_type`, `ready_count`. v1.15: endpoint, tham số `q`, trường tính theo sổ quyết định 2026-11-11 |
| 18 | `docs/architecture/request-flow.md`        | 6       | 14, 17               | 🔵 Chờ duyệt | 2026-11-04 | v1.2: request ID từ `X-Request-ID`. v1.1: WebSocket áp dụng ngay khi đổi vai trò |
| 19 | `.claude/rules/coding-convention.md`       | 22      | 6, 7                 | 🔵 Chờ duyệt | 2026-11-04 | v1.2: make lint chạy đủ các lệnh kiểm tra |
| 20 | `.claude/rules/design-patterns.md`         | 23      | 9                    | 🟢 Xong       | 2026-11-01 | v1.0: Router, service, plugin parser và runner, chống xử lý trùng |
| 21 | `.claude/rules/error-handling.md`          | 16      | 17                   | 🟢 Xong       | 2026-11-01 | v1.1: bảng thử lại chuyển sang system.md, external-services.md |
| 22 | `.claude/rules/logging.md` | 15 | 16 | 🔵 Chờ duyệt | 2026-11-12 | v1.3: trường ngữ cảnh `engine` |
| 23 | `.claude/rules/testing.md`                 | 21      | 16                   | 🔵 Chờ duyệt | 2026-11-04 | v1.5: bộ E2E chạy được ngay sau `make init`, không điền tay thông tin xác thực |
| 24 | `.claude/rules/security.md`                | 17      | 16                   | 🟢 Xong       | 2026-11-04 | v1.3: method post, ô mật khẩu không kiểm soát, gcTime 0 |
| 25 | `docs/ops/configuration.md` | 14 | 13 | 🔵 Chờ duyệt | 2026-11-12 | v1.8: `RECONOS_NODE_NAME`, 4 ngưỡng mới, cột Đọc công khai |
| 26 | `docs/ops/deployment.md` | 20 | 8, 25 | 🔵 Chờ duyệt | 2026-11-12 | v1.4: build frontend với `RECONOS_NODE_NAME`, phiên bản công cụ qua heartbeat |
| 27 | `docs/ops/performance.md`                  | 18      | 12                   | 🟢 Xong      | 2026-11-01 | v1.0: Keyset, upsert theo lô, stream output thô, cache Redis 30 giây |
| 28 | `docs/ops/scalability.md`                  | 19      | 13, 27               | 🟢 Xong       | 2026-11-01 | v1.0: Số bản chạy của từng tiến trình, thứ tự mở rộng CSDL, phân vùng |
| 29 | `CLAUDE.md`                                | 1, 2, 3 | 1, 6, 7, 19 đến 24 | 🔵 Chờ duyệt | 2026-11-05 | Mockup lệch tài liệu áp quy tắc mặc định của frontend/CLAUDE.md, không dừng hỏi |
| 30 | `docs/tech-debt.md` | 25 | - | 🔵 Chờ duyệt | 2026-11-12 | v3.7: nợ 43 xong. v3.6: thêm nợ 43 trường tính S12 chưa có ở backend. v3.5: cập nhật nợ 5, 7, 8, 9, 10, 32, 39, 40 theo sổ 2026-11-11, thêm nợ 42 cờ gowitness |
| 31 | `docs/roadmap.md` | 26 | 1 | 🔵 Chờ duyệt | 2026-11-12 | v2.11: khớp mockup Stitch, backend endpoint mới theo đợt sở hữu màn hình |
| 32 | `docs/appendix/references.md`              | 27      | -                    | 🟢 Xong       | 2026-11-01 | v1.3: thêm tên đầy đủ cho viết tắt, nhóm Viết tài liệu |
| 33 | `backend/CLAUDE.md` | - | 12, 17, 19 đến 24 | 🔵 Chờ duyệt | 2026-11-12 | Lọc `deleted_at` khi đọc `user`, `domain`, `screenshot` |
| 34 | `frontend/CLAUDE.md` | - | 17, 19 đến 24 | 🔵 Chờ duyệt | 2026-11-12 | Danh sách không làm theo sổ 2026-11-11, chip phiên bản và node gắn lúc build |
| 35 | `workers/CLAUDE.md` | - | 13, 19 đến 24 | 🔵 Chờ duyệt | 2026-11-12 | Heartbeat báo `tools`, `cpu_percent`, finish báo `tool_version` |
| 36 | `docs/data/schema.md` | 9 | 11 | 🔵 Chờ duyệt | 2026-11-12 | v1.7: 36 bảng, xóa mềm, cột gowitness, `finding.detail`, `engine.settings`, `priority` |
| 37 | `.claude/rules/vietnamese-writing.md`     | -       | -                    | 🟢 Xong       | 2026-11-01 | Do người dùng viết. Luôn nạp. Xung đột với documentation.md: mục 8 của documentation.md |
| 38 | `.claude/rules/doc-sync.md`                | -       | 2, 29                | 🟢 Xong         | 2026-11-04 | v1.3: thêm dòng kích hoạt cho bảng token của design system |
| 39 | `docs/documentation-map.html`              | -       | 29, 38               | 🔵 Chờ duyệt | 2026-11-04 | Đổi mô tả logging.md. Quy ước vẽ: mục 9 của documentation.md |
| 40 | `docs/system-flows.html`                   | -       | 8, 11, 13, 14, 18    | 🟢 Xong        | 2026-11-02 | Kiến trúc, 3 luồng request, 13 luồng tính năng. Quy ước vẽ: mục 10 của documentation.md |
| 41 | `.claude/rules/codegraph.md`                | -       | 7                    | 🟢 Xong       | 2026-11-04 | v1.0: Luôn nạp. sync trước khi tra, impact trước khi sửa symbol, affected chọn test |
| 42 | `.claude/rules/understand-anything.md`      | -       | 1                    | 🟢 Xong       | 2026-11-04 | v1.0: Luôn nạp. Chỉ chạy khi người dùng gọi, không bật `autoUpdate`, `docs/` thắng đồ thị |
| 43 | `docs/decisions/adr-soft-delete.md` | 24 | 12 | 🔵 Chờ duyệt | 2026-11-12 | v1.0: xóa mềm tài khoản, domain, screenshot bằng `deleted_at`, giữ output thô |

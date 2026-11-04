# Đồng bộ tài liệu khi quyết định thay đổi

> Phiên bản: 1.3 · Ngày: 2026-11-04 · Trạng thái: 🟢 Xong

Áp dụng khi có quyết định mới hoặc quyết định thay đổi: người dùng chốt trong hội thoại, ADR mới, thay đổi mã làm đổi hành vi hệ thống.

## ✅ Bắt buộc

**Quy trình:**

1. Tra bảng Kích hoạt, liệt kê file nguồn và phạm vi ảnh hưởng trước khi sửa.
2. Sửa file nguồn trước, file trong phạm vi ảnh hưởng sau.
3. Sửa hết các file trong cùng lượt.
4. Với mỗi file đã sửa: tăng phiên bản, chuyển 🔵 Chờ duyệt, cập nhật roadmap theo mục 2 của [documentation.md](documentation.md).
5. Kết thúc lượt bằng dòng `Đồng bộ tài liệu: <file>, <file>`. File trong bảng mà không sửa: ghi lý do ngay sau tên file.

**Mức thay đổi của file:**

| Mức | File |
|---|---|
| Cao, đổi theo phần lớn quyết định | `docs/documentation-roadmap.md`, `docs/appendix/glossary.md`, `docs/data/schema.md`, `docs/data/erd.mermaid`, `docs/api/openapi.yaml`, `docs/api/architecture.md`, `docs/tech-debt.md`, `docs/ops/configuration.md` |
| Trung bình, đổi khi thêm module, tool module, luồng | `docs/architecture/modules.md`, `docs/integrations/external-services.md`, `docs/architecture/business-flow.md`, `docs/security/authorization.md`, `docs/architecture/system.md`, `docs/architecture/request-flow.md`, `docs/architecture/tech-stack.md`, `docs/architecture/directory-structure.md`, `docs/architecture/dependency-graph.md`, `docs/security/threat-model.md`, `docs/ops/deployment.md`, `docs/roadmap.md`, `docs/appendix/references.md`, `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `workers/CLAUDE.md` |
| Trung bình, đổi khi thêm hoặc bỏ tài liệu, luồng | `docs/documentation-map.html`, `docs/system-flows.html` |
| Thấp, chỉ đổi khi đổi hướng | `docs/architecture/overview.md`, `docs/decisions/adr-*.md`, `docs/data/database.md`, `docs/security/authentication.md`, `docs/ops/performance.md`, `docs/ops/scalability.md`, `.claude/rules/*.md` |

**Bảng Kích hoạt:** mọi dòng đều kèm cập nhật `docs/documentation-roadmap.md`.

| Thay đổi | File nguồn | Phạm vi ảnh hưởng |
|---|---|---|
| Thuật ngữ, từ thay thế | `glossary.md`: thêm dòng vào bảng Từ không dùng | Mọi file có từ cũ: grep từ cũ trên `docs/`, `.claude/rules/`, các `CLAUDE.md`. Kết thúc lượt thêm dòng `Thuật ngữ mới: <cũ> → <mới>, đã cập nhật glossary` |
| Bảng, cột, giá trị liệt kê, ràng buộc | `schema.md` | `erd.mermaid`, schema trong `openapi.yaml`. Bảng mới: `modules.md` |
| Trạng thái, chuyển trạng thái của job, program, finding | `business-flow.md` | `schema.md`, `erd.mermaid`, `request-flow.md`, `authorization.md`, `threat-model.md` |
| Endpoint | `api/architecture.md` | `openapi.yaml`, quyền trong `authorization.md`. Endpoint của worker: `external-services.md` |
| Contract worker ↔ backend, queue, task | `external-services.md` | `openapi.yaml`, `system.md`, `scalability.md`, `backend/CLAUDE.md`, `workers/CLAUDE.md` |
| Thêm, bỏ tool module | `external-services.md` | Bảng tool module trong `modules.md`, image worker trong `deployment.md`, lệnh grep trong mục Cách kiểm tra của `design-patterns.md`. Công cụ mới: định nghĩa Công cụ trong `glossary.md` |
| Thêm, bỏ module backend | `modules.md` | `dependency-graph.md`, `directory-structure.md`, `backend/CLAUDE.md` |
| Vai trò, quyền | `authorization.md` | `openapi.yaml`, `threat-model.md` |
| Xác thực, mã hóa | `authentication.md` | `security.md`, `threat-model.md`, `schema.md`, `configuration.md` |
| Biến môi trường, `system_setting` | `configuration.md` | `system_setting` trong `schema.md`, `deployment.md`. Worker dùng: `workers/CLAUDE.md` |
| Thư viện, phiên bản, công cụ phát triển | `tech-stack.md`. Đổi lựa chọn: ADR mới | `coding-convention.md`, `testing.md`, lệnh trong các `CLAUDE.md` |
| Thư mục, file mã | `directory-structure.md` | `CLAUDE.md` của phần tương ứng |
| Token màu, bán kính, khoảng cách, chữ của giao diện | `docs/design/design-system.md`: bảng Token Table | Chạy `pnpm --dir frontend tokens` sinh lại `frontend/src/styles/globals.css`. ❌ Không sửa tay khối `@theme`. File này không nằm trong `documentation-roadmap.md` |
| Tiến trình, thành phần hạ tầng | `system.md` | `deployment.md`, `scalability.md`, `configuration.md` |
| Số lần thử lại, timeout | `system.md` cho task `parse`, `external-services.md` cho worker và runner | `error-handling.md` chỉ liên kết, không chép số |
| Ghi log, nơi lưu log | `logging.md`, `database.md` | `configuration.md` khi có biến mới |
| Việc để sau, nợ kỹ thuật | `tech-debt.md` | Tính năng sau phiên bản đầu: `roadmap.md`. Memory nhãn `pending` |
| Tính năng ngoài phiên bản đầu | `roadmap.md` | Mục Ngoài phạm vi trong `overview.md`, danh sách mockup cần bỏ trong `frontend/CLAUDE.md` |
| Mục tiêu G#, phạm vi | `overview.md` | Mọi file có tham chiếu `(G#)` đó |
| Nguồn tham khảo bên ngoài | `references.md` | |
| Thành phần, kênh giao tiếp, bước xử lý của một luồng | `system.md`, `request-flow.md`, `business-flow.md`, `external-services.md`, `authentication.md` | Mảng `COMPONENTS`, `LINKS`, `FLOWS` trong `system-flows.html` theo mục 10 của `documentation.md` |
| Quy tắc viết tài liệu | `documentation.md` | Skill `writing-document`, `review-document` |
| Thêm, bỏ tài liệu. Đổi cột Phụ thuộc, bảng Kích hoạt, bảng Mức thay đổi, mục 📌 | `documentation-roadmap.md`, `doc-sync.md` | Mảng `DOCS` trong `documentation-map.html` theo mục 9 của `documentation.md` |
| Lệnh build, test | `CLAUDE.md` | `Makefile`, `CLAUDE.md` của phần tương ứng |

## ❌ Cấm

- Sửa file trong phạm vi ảnh hưởng mà không sửa file nguồn.
- Chép nội dung của file nguồn sang file khác. Liên kết tới file nguồn.
- Kết thúc lượt khi còn file trong bảng Kích hoạt chưa sửa và chưa ghi lý do.
- Sửa ADR 🟢 Accepted. Viết ADR mới, chuyển ADR cũ sang ⚪ Superseded.
- Tự chuyển tài liệu sang 🟢 Xong.

## 💡 Ví dụ

✅ Đúng: người dùng chốt thêm trạng thái job `paused`.

```text
1. business-flow.md: thêm trạng thái, chuyển trạng thái
2. schema.md, erd.mermaid: thêm giá trị liệt kê
3. openapi.yaml, request-flow.md, authorization.md, threat-model.md
4. documentation-roadmap.md
Đồng bộ tài liệu: business-flow.md, schema.md, erd.mermaid, openapi.yaml,
request-flow.md, authorization.md, threat-model.md (không đổi: paused không thêm rủi ro)
```

❌ Sai: chỉ thêm `paused` vào `schema.md`, `business-flow.md` vẫn thiếu trạng thái.

## 🔍 Cách kiểm tra

```bash
grep -rn "<từ cũ>" docs .claude/rules CLAUDE.md */CLAUDE.md
grep -rn "<giá trị mới>" docs .claude/rules CLAUDE.md */CLAUDE.md
```

- Mọi file ở cột Phạm vi ảnh hưởng của dòng tương ứng có giá trị mới, hoặc có lý do trong dòng `Đồng bộ tài liệu`.
- File đã sửa có ngày Cập nhật hôm nay trong roadmap.

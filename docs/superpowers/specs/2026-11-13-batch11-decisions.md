# Sổ quyết định đợt 11, báo cáo

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi dựng module `report` và màn hình báo cáo ở đợt 11. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu hoặc mâu thuẫn | Chọn | Tài liệu |
|---|---|---|---|
| R1 | business-flow.md cho chuyển `reported` bằng tay "khi chưa có module `report`" | Chặn. Triage bằng tay sang `reported`, kể cả hàng loạt, trả `409` mã `reported_by_report`. Bảng chuyển trạng thái giữ nguyên dòng `confirmed` sang `reported`. Lý do: mỗi finding `reported` truy được về báo cáo đã nộp (G6). Phương án loại: giữ chuyển bằng tay, vì finding `reported` không có báo cáo làm bằng chứng | `business-flow.md`, `api/architecture.md`, `openapi.yaml`, `threat-model.md` |
| R2 | Finding đã trong báo cáo nháp rồi rời `confirmed` | Vẫn nằm trong báo cáo. Nộp báo cáo khi còn finding không `confirmed`: `409` mã `not_confirmed`, tất cả hoặc không. Phương án loại: tự bỏ finding khỏi báo cáo, vì người dùng không thấy báo cáo đổi | `business-flow.md`, `api/architecture.md` |
| R3 | Một finding nằm trong mấy báo cáo | Nhiều báo cáo nháp. Chỉ báo cáo nộp trước chuyển được finding, báo cáo sau gặp `409` vì finding đã `reported` | `schema.md`, `business-flow.md` |
| R4 | Báo cáo đã nộp sửa được gì | Chỉ `platform_report_ref`, vì mã trên nền tảng thường có sau khi nộp. Trường khác `409` mã `report_submitted`. Không xóa được | `business-flow.md`, `api/architecture.md` |
| R5 | `openapi.yaml` chưa có xóa báo cáo, body, response | Thêm `DELETE /reports/{report_id}` cho báo cáo nháp. `POST /reports` trả `201`. `submit` trả `200` kèm chi tiết thay cho `204`, để màn hình cập nhật không cần gọi lại. Thêm schema `Report`, `ReportDetail`, `ReportCreate`, `ReportUpdate`, `ReportSubmit` | `openapi.yaml`, `api/architecture.md` |
| R6 | "Đính kèm bằng chứng từ output thô" chưa rõ cách | Không lưu file mới. Mỗi finding trả `raw_output`: metadata của output thô tạo finding lần đầu, tải qua `GET /raw-outputs/{raw_output_id}/content`. Export ghi tên file, SHA-256. Không đọc hay sao chép object (G8) | `business-flow.md`, `api/architecture.md` |
| R7 | Định dạng export báo cáo | `md` mặc định, thêm `csv`, `jsonl` dùng chung bộ dựng file của tài sản nên có quy tắc chống công thức CSV. Chữ từ output thô trong `md` được escape hoặc đặt trong code span, `evidence` trong khối code có hàng rào dài hơn chuỗi backtick bên trong | `api/architecture.md`, `threat-model.md` |
| R8 | `GET /findings/export` đã chống CSV injection chưa | Đã có từ đợt 6 qua `backend/app/asset/export.py`: thêm `'` trước `=`, `+`, `-`, `@`, tab, CR. Không sửa mã, thêm câu áp cho mọi export CSV | `api/architecture.md` |
| R9 | Không có mockup màn hình báo cáo trong `index.json` | Thêm S21 Reports (chưa có mockup) vào `index.json`. Danh sách `/reports` theo bố cục S14, chi tiết `/reports/{report_id}` dùng thành phần S20. Mục Reports trên sidebar nằm sau Findings trong nhóm Recon. Nút Create Report trên thanh chọn của S20 | `index.json`, `tech-debt.md` nợ 85 |
| R10 | Hiển thị Markdown an toàn trên frontend | Bộ đọc Markdown tự viết `src/lib/markdown.ts` sinh node văn bản React, không có HTML. Link chỉ `http`, `https`, `mailto`. Phương án loại: thêm `react-markdown`, vì cần đổi tech stack và cấu hình chống HTML | `threat-model.md`, `tech-debt.md` nợ 86 |
| R11 | Màn hình S20 vẫn có `Reported` trong menu trạng thái của dòng | Bỏ `Reported` khỏi menu dòng. Hộp chi tiết làm mờ theo `allowed_triage_statuses`, giờ không chứa `reported`. Bộ lọc trạng thái giữ đủ 6 giá trị. S20 đọc `triage_status` trên URL để S21 mở danh sách finding `confirmed` | Sổ này |

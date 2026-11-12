# Sổ quyết định đợt 6, phần frontend

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi dựng S20 và luồng triage finding ở đợt 6. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu hoặc mâu thuẫn | Chọn | Tài liệu |
|---|---|---|---|
| F1 | `PUT /findings/{finding_id}/tags` có trong `openapi.yaml` nhưng chưa khai báo body, chi tiết finding chưa trả tag | Body `tag_ids`, tối đa 100 theo `FindingTagsRequest` của backend, thay toàn bộ tag của finding, mảng rỗng gỡ hết. Danh sách và chi tiết finding trả `tags`: `tag_id`, `key`, `value`. Lý do: một lời gọi idempotent, không cần ID dòng `finding_tag` như `asset_tag` | `api/architecture.md`, `openapi.yaml` |
| F2 | Quyền gắn tag finding chưa có dòng riêng | Theo quyền triage: mọi vai trò, User chỉ trên program được gán. Ghi nhật ký thao tác như gắn tag tài sản | `authorization.md` |
| F3 | Mockup S20 không có chỗ hiện tag của finding | Quy tắc M6: thêm khối Tags trong hộp chi tiết, sau khối thông tin, dùng cách gắn tag của S05 | Sổ này |
| F4 | Đổi trạng thái triage làm đổi số finding mở trên S08, S03, S04, badge sidebar | Sau triage đơn lẻ và hàng loạt, làm mới query `findings`, `nav-count`, `programs`, `domains`, `dashboard` | Sổ này |
| F5 | Bảng S20 không dùng virtual scroll | Bảng tối đa 100 dòng mỗi trang theo cursor, không phải bảng dài. Giữ bảng thường như các màn hình danh sách khác | Sổ này |
| F6 | Nợ 7 phần S20 | 6 trạng thái triage, bỏ Push to Jira, Sync Nuclei thành Re-scan theo P2. `findings-shape.test.tsx` chặn chữ `Push to Jira`, `Sync Nuclei`, `Triaged` | `tech-debt.md` |
| F7 | E2E triage cần finding thật mà không chạy công cụ, không chạm mục tiêu | Spec đóng vai worker qua API worker: tạo job nuclei, chờ dispatcher, claim, upload `nuclei.jsonl` trên domain `example.com`, finish, chờ task `parse` | `frontend/e2e/finding-triage.spec.ts` |
| F8 | Backend giới hạn chuyển trạng thái triage, trả `allowed_triage_statuses` ở chi tiết, `409` mã `invalid_transition` khi chuyển sai | Hộp chi tiết làm mờ nút trạng thái ngoài `allowed_triage_statuses`. Menu dòng và thanh hàng loạt không tự tính trạng thái hợp lệ, hiện câu của mã `invalid_transition` khi backend từ chối | `api/architecture.md`, `field-error-text.ts` |

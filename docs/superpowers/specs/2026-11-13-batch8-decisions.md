# Sổ quyết định đợt 8: nhóm khai thác và duyệt job

> Phiên bản: 1.0 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định tự chọn khi dựng đợt 8 vì tài liệu chưa nói, chờ người dùng duyệt. Đặc tả đợt: [thiết kế thứ tự viết mã](2026-11-02-implementation-roadmap-design.md).

| # | Vấn đề | Chọn | Lý do | Tài liệu đã sửa |
|---|---|---|---|---|
| B8-1 | `openapi.yaml` không có body cho `reject`, `status_reason` cần lý do | `status_reason` cố định `Rejected by approver.`, người từ chối ghi trong nhật ký `job_rejected` | `status_reason` chỉ chứa câu cố định, không lấy dữ liệu từ request. Nợ 72 | business-flow.md, api/architecture.md, openapi.yaml, tech-debt.md |
| B8-2 | Từ chối có ghi `approved_by` không | Không. `approved_by`, `approved_at` chỉ ghi khi duyệt | `avg_wait_seconds` tính từ `approved_at`. Người từ chối nằm trong `audit_log` | business-flow.md |
| B8-3 | Job do lịch sinh (`created_by` `NULL`) | Superadmin, Admin nào cũng duyệt được | Bảng `schedule` thuộc đợt 12. Nợ 70 ghi cách so với người tạo lịch | authorization.md, business-flow.md, tech-debt.md |
| B8-4 | Kiểm tra người tạo chỉ trước hay cả trong câu `UPDATE` | Cả hai: kiểm trước để trả `403` và ghi `permission_denied`, thêm `created_by IS DISTINCT FROM` vào `UPDATE` | Không đường nào đổi được trạng thái job cho chính người tạo, kể cả khi gọi thẳng service | business-flow.md |
| B8-5 | Parser cho sqlmap, dalfox | Có parser, sinh finding | `external-services.md` ghi cột Parser tạo là Finding và chuỗi khử trùng lặp của hai công cụ | external-services.md |
| B8-6 | Output thô của sqlmap | Gói `sqlmap.zip`: `results.csv` ở gốc, thư mục `--output-dir` trong `output/`. Parser chỉ đọc `results.csv` | CSV của sqlmap có đủ URL, vị trí, tham số, kỹ thuật cho `dedup_key`. Log của sqlmap là văn bản tự do | external-services.md |
| B8-7 | Định dạng output của dalfox | `--format jsonl`, file `dalfox.jsonl` thay cho "File JSON kết quả" | Mỗi dòng một finding, đọc theo dòng như nuclei, không phải nạp cả file JSON vào bộ nhớ | external-services.md |
| B8-8 | Phiên bản dalfox | 3.2.4 bản musl tĩnh, phát hành 2026-10-07 | dalfox v3 viết lại bằng Rust, cờ khác v2. 3.3.0 mới phát hành 2026-11-08, chưa đủ hai tuần | external-services.md, tech-debt.md (nợ 71) |
| B8-9 | Proxy cho dalfox | File cấu hình JSON `0600` qua `--config` | dalfox v3 chỉ nhận proxy qua `--proxy` hoặc file cấu hình, bỏ qua biến môi trường. `--proxy` để lộ tài khoản proxy trong danh sách tiến trình (G7). `--config` còn chặn dalfox đọc cấu hình trong thư mục home | external-services.md |
| B8-10 | dalfox thoát mã `1` khi có finding | Thêm `success_exit_codes` vào lớp `Runner`, dalfox khai báo `{0, 1}` | Cơ chế chung cho mọi runner, không rẽ nhánh theo tên công cụ trong `base.py` | external-services.md |
| B8-11 | Severity của finding sqlmap | `high`, `low` khi sqlmap ghi `false positive or unexploitable` | sqlmap không báo severity. SQL injection xác nhận được là mức cao, kết quả không khai thác được vẫn giữ để triage | external-services.md |
| B8-12 | Nút duyệt trên S10 cho job do chính mình tạo | Ẩn nút **Approve**, **Reject** | Chỉ để tiện dùng, backend vẫn trả `403 self_approval_forbidden` | Không đổi tài liệu |
| B8-13 | Thời hạn, số job đồng thời mặc định | `sqlmap` 240 phút, `dalfox` 120 phút, cả hai 1 job đồng thời, ghi bằng migration `0009` | Mỗi job gửi payload tấn công tới mục tiêu, giữ tải thấp. Superadmin đổi trên S18 | Không đổi tài liệu |

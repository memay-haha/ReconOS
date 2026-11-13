# Sổ quyết định cảnh báo lịch chạy hỏng

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi xử lý nợ 61: lịch quét định kỳ đến hạn mà không tạo được job sinh cảnh báo loại `schedule_run_failed`. Người dùng đã duyệt loại cảnh báo mới. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu | Chọn | Tài liệu |
|---|---|---|---|
| S1 | `schedule` gọi `alert` có đúng tầng không | Đúng: `schedule` ở tầng 6, `alert` ở tầng 2. `run_due_schedules` gọi thẳng `alert_service.raise_alert` trong transaction của lượt chạy, không cần cơ chế trung gian | `dependency-graph.md`, `modules.md` |
| S2 | Chống spam: lịch hỏng chạy lại mỗi chu kỳ, tối thiểu 15 phút | Một cảnh báo cho mỗi chuỗi hỏng của lịch, không phải mỗi lần chạy hỏng. Cột mới `schedule.failing_since` ghi lần hỏng đầu của chuỗi. Chỉ lần hỏng có `failing_since` đang `NULL` mới sinh cảnh báo. Mọi lần hỏng vẫn ghi `audit_log`. Phương án loại: một cảnh báo mỗi lần chạy (96 cảnh báo mỗi ngày với lịch 15 phút); gộp theo trạng thái đã đọc (đã đọc là theo từng tài khoản, không dùng làm điều kiện sinh được) | `schema.md`, `business-flow.md` |
| S3 | Khi nào chuỗi hỏng kết thúc | Lượt chạy thành công, kể cả `POST /schedules/{schedule_id}/run`, và mọi lần sửa lịch qua `PATCH` đặt `failing_since` về `NULL`. Sửa lịch kết thúc chuỗi để người vận hành biết ngay nếu bản sửa vẫn hỏng. Chạy ngay bị từ chối không sinh cảnh báo vì người bấm đã nhận lỗi `422` | `business-flow.md` |
| S4 | Cảnh báo trỏ tới lịch nào, chuông liên kết đi đâu | Cột mới `alert.schedule_id`, khóa ngoại tới `schedule` khai báo bằng tên bảng, xóa lịch thì xóa cảnh báo. `GET /alerts` trả thêm `schedule_id`. Chuông dẫn tới `/programs/{program_id}?tab=scope`, tab có danh sách lịch. Rẽ nhánh theo khóa ngoại có giá trị như `job_id`, `finding_id`, không theo loại cảnh báo | `schema.md`, `erd.mermaid`, `api/architecture.md`, `openapi.yaml` |
| S5 | Nội dung `message` | `Scheduled <tool module> on <mục tiêu đầu> [and N more] did not run: <mã lỗi>`, mã lỗi giống `audit_log.detail.codes` | `schema.md` |
| S6 | `failing_since` có trả qua API lịch không | Không. Cột chỉ phục vụ chống spam, chưa có màn hình dùng | |
| S7 | Nhãn, icon trên chuông | `Scheduled scan failed`, icon `event_busy`, màu `text-crit` như `job_failed` | |
| S8 | Migration | `0013`, `down_revision` `0011`: thêm hai cột, đổi CHECK `ck_alert_alert_type_allowed`. Downgrade xóa cảnh báo `schedule_run_failed` trước khi khôi phục CHECK cũ | `schema.md` |

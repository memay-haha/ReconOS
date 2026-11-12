# Sổ quyết định đợt 12, lịch quét định kỳ

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi dựng bảng `schedule`, Celery Beat, phần lịch trên S09 và tab Schedules trên S16. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu hoặc mâu thuẫn | Chọn | Tài liệu |
|---|---|---|---|
| L1 | `modules.md`, `schema.md` xếp `schedule` vào module `job`, lời giao việc đặt module riêng `app/schedule/` | Module `schedule` ở tầng 6, gọi `create_scheduled_job` của `job` ở tầng 5. `job.schedule_id` khai báo khóa ngoại bằng tên bảng như các khóa ngoại tới tầng trên khác. Lý do: `job` đã lớn, lịch chỉ cần một hàm công khai của `job` | `modules.md`, `dependency-graph.md`, `directory-structure.md`, `schema.md` |
| L2 | Ràng buộc `interval_minutes` chưa có | 15 đến 525.600 phút, CHECK trong CSDL và kiểm tra Pydantic. Beat quét mỗi 60 giây nên chu kỳ dưới 15 phút chỉ sinh job dồn | `schema.md`, `api/architecture.md` |
| L3 | Lịch dùng tool module nhóm `exploit` | Từ chối `422` mã `tool_module_not_schedulable`. Job do Beat sinh có `created_by` `NULL` nên không chặn được người tạo tự duyệt (G5) | `business-flow.md`, nợ 60 |
| L4 | Chống chạy trùng khi nhiều Beat hoặc nhiều tiến trình nền | `SELECT ... FOR UPDATE SKIP LOCKED` trên lịch đến hạn, dời `next_run_at` cùng transaction với job. Không dùng khóa Redis | `system.md` |
| L5 | Mốc bị lỡ khi tiến trình nền dừng hoặc program `paused` | Không chạy bù từng mốc. Lượt đầu tạo một job rồi dời tới mốc kế tiếp sau hiện tại, giữ nhịp chu kỳ | `business-flow.md`, `system.md` |
| L6 | Lịch chạy bị từ chối: mục tiêu ra khỏi scope, tool module tắt, tham số sai | Không tạo job, ghi `audit_log` `schedule_run_failed` kèm mã lỗi, vẫn dời `next_run_at`. Mỗi lịch một savepoint | `business-flow.md`, nợ 61 |
| L7 | `created_by` của job do `POST /schedules/{id}/run` tạo | Người bấm, vì có người thật thao tác. Chỉ job do Beat sinh để `NULL` | `api/architecture.md`, `business-flow.md` |
| L8 | `params` của lịch lưu gì | Lưu tham số người dùng chọn đã qua kiểm tra. `default_params` điền lúc chạy, nên đổi mặc định của tool module có tác dụng cho lần chạy sau | `schema.md` |
| L9 | `next_run_at` khi tạo, sửa | Tạo: một chu kỳ sau lúc tạo. Đổi chu kỳ hoặc bật lại: tính lại từ lúc sửa. Cột luôn có giá trị | `business-flow.md`, `schema.md` |
| L10 | Lịch của program `archived` | Chỉ đọc như proxy: sửa, xóa `409`. Chạy ngay trên program không `active`: `409` từ service `job` | `api/architecture.md` |
| L11 | Thứ tự danh sách lịch | Một thứ tự `-created_at` như proxy, cả hai endpoint danh sách | `api/architecture.md`, `openapi.yaml` |
| L12 | Response danh sách theo program có `program_name`, `tool_module_name` không | Cả hai endpoint danh sách và response tạo, sửa đều có, S09 không phải ghép tên từ `GET /tool-modules` | `api/architecture.md`, `openapi.yaml` |
| L13 | S09 và S16 hiện `next_run_at` của lịch đã tắt | Hiện `-` khi lịch tắt, vì mốc cũ không còn chạy | Sổ này |
| L14 | Form tạo lịch chưa có ô `params` | Giữ form đợt trước, dùng `default_params`. Thêm sau | nợ 62 |

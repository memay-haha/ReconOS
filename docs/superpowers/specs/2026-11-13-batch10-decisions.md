# Sổ quyết định đợt 10: cảnh báo và dashboard

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi dựng module `alert`, `dashboard`, màn hình sửa ngưỡng vận hành và S15 đầy đủ. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu hoặc mâu thuẫn | Chọn | Tài liệu |
|---|---|---|---|
| A1 | Nơi sinh `job_failed`, `job_pending_approval` | Hàm `_raise_status_alert` trong `app/job/service.py`, gọi từ `_insert`, `_transition`, `_transition_many`. Mọi đường đổi trạng thái đều sinh cảnh báo: worker báo `failed`, dispatcher chuyển job mất heartbeat, luồng duyệt của đợt 8. Lý do: một cơ chế chung, không thêm lời gọi ở từng nơi | `dependency-graph.md` |
| A2 | Một job đổi trạng thái lặp hoặc có nhiều output thô thì sinh mấy cảnh báo | Mỗi job tối đa một cảnh báo cho mỗi loại `job_pending_approval`, `job_failed`, `asset_new`: index duy nhất từng phần trên `alert_type`, `job_id`, ghi bằng `ON CONFLICT DO NOTHING` | `schema.md` |
| A3 | `finding_new` một cảnh báo mỗi finding hay gom | Một cảnh báo mỗi output thô có finding mới severity `critical`, `high`. Đúng một finding: `finding_id` trỏ finding đó, câu `New critical finding from nuclei: <tên>`. Nhiều finding: `finding_id` là `NULL`, câu ghi số theo severity. Lý do: một lần quét nuclei có thể sinh hàng chục finding `high`, chuông chỉ hiện 10 dòng mới nhất | `schema.md` |
| A4 | Nội dung `asset_new` | Số tài sản mới theo loại của output thô đầu tiên có tài sản mới trong job. Output thô sau của cùng job không sinh thêm theo A2 | `schema.md`, nợ 80 |
| A5 | Độ dài `message` | Tối đa 500 ký tự, cắt bằng dấu `…`. Câu chứa tên công cụ, mục tiêu, tên finding là dữ liệu không tin cậy, giao diện hiển thị dạng văn bản | `schema.md` |
| A6 | `alert.program_id` có được `NULL` | Được. Cảnh báo không thuộc program chỉ Superadmin, Admin thấy, như sự kiện WebSocket. Bản đầu chưa sinh loại này | `schema.md` |
| A7 | Đánh dấu đã đọc có ghi nhật ký thao tác | Không: trạng thái riêng của tài khoản, không có trong danh sách ghi nhật ký của `authorization.md`. Cảnh báo của program chưa gán: `404` | `api/architecture.md` |
| A8 | `sort` của `GET /alerts` | `-created_at` mặc định, `created_at`, cursor theo `created_at`, `id` | `api/architecture.md`, `openapi.yaml` |
| A9 | Nợ 61 của đợt 12: lịch chạy không tạo được job chưa sinh cảnh báo | Giữ nợ 61. Cảnh báo này cần loại mới `schedule_run_failed` trong `alert.alert_type`: đổi ràng buộc CHECK, glossary, `openapi.yaml`, chuông trên frontend, ngoài phạm vi 4 loại của đợt 10. `raise_alert` đã sẵn để nối khi chốt loại mới | `tech-debt.md` |
| B1 | Miền giá trị khi sửa ngưỡng vận hành | Thêm cột Tối thiểu, Tối đa vào bảng ngưỡng. Giá trị phải là số nguyên, `"30"`, `true`, `3.5` trả `422` mã `int_type`. Ngoài miền: mã `out_of_range` | `configuration.md` |
| B2 | Ngưỡng phụ thuộc nhau | `job_heartbeat_timeout_minutes` × 60 ≥ 2 × `job_heartbeat_seconds`. `session_idle_timeout_minutes` ≤ `session_absolute_timeout_hours` × 60. Vi phạm: `422` mã `setting_conflict` | `configuration.md` |
| B3 | `GET /system-settings` chỉ trả dòng đã lưu thì Superadmin không sửa được key đang dùng mặc định | Trả mọi key trong `configuration.md`, thêm `default`, `minimum`, `maximum`, `is_public`. Key chưa sửa: `updated_by`, `updated_at` là `NULL`, S15 ghi Default | `api/architecture.md`, `openapi.yaml` |
| B4 | Admin, User đọc key không công khai | `403 forbidden`: tên key có trong tài liệu nên không cần giấu như tài nguyên program. Key không tồn tại: `404` | `api/architecture.md` |
| B5 | Router của `system_setting` thuộc module nào | `app/core/system_setting_router.py`, cạnh bảng trong `core`, như `realtime_router.py`. `dashboard` chỉ đọc nên không ghi ngưỡng | `directory-structure.md`, `backend/CLAUDE.md` |
| C1 | Khóa cache Redis 30 giây của `GET /dashboard/summary` | `reconos:dashboard:summary:<đối tượng>:<window>`. Superadmin, Admin dùng chung `all`, User mỗi tài khoản một khóa vì số liệu theo program được gán. Redis lỗi: tính trực tiếp, ghi log `warning` | `api/architecture.md` |
| C2 | Ngày của `new_assets_daily` | Ngày UTC theo `first_seen_at`. Domain đã xóa mềm không tính | `api/architecture.md` |
| C3 | Tuổi finding trong `findings_near_sla`, mốc của `confirmed_cve_findings_24h` | Tuổi tính từ `first_seen_at`. `confirmed_cve_findings_24h`: finding `confirmed` có `cve` không rỗng, `triaged_at` trong 24 giờ | `api/architecture.md` |
| C4 | Nợ 35: badge sidebar gọi ba request | Thêm `findings_triage_new` vào summary. Ba badge cùng đọc `GET /dashboard/summary?window=24h`: `assets_new.domain`, `findings_triage_new`, `jobs_by_status.queued` | `api/architecture.md`, `tech-debt.md` |
| C5 | `top_ports` gom theo gì | Theo `port`, `transport`. `name` là tên dịch vụ gặp nhiều nhất trên cổng đó | `api/architecture.md` |
| C6 | `/search` trộn các loại thế nào | Hỏi lần lượt program, domain, URL, finding, tool module, mỗi loại tối đa phần còn lại của `limit`, giữ thứ tự đó | `api/architecture.md` |
| D1 | Cách tính `status` từng thành phần của `GET /system/health` | Trả lời quá 1.000 ms: `degraded`. Lỗi hoặc quá 3 giây: `down`. `api` luôn `ok` kèm phiên bản backend. `postgres`: `detail` số kết nối đang dùng trên tối đa. `redis`: bộ nhớ dùng trên `maxmemory` | `api/architecture.md` |
| D2 | Tiến trình nền, Celery Beat không có heartbeat | Tiến trình nền: hỏi broker bằng Celery inspect `active_queues`, `down` khi không tiến trình nào nhận queue `parse`. Beat: Beat gửi task `reconos.beat_heartbeat` vào queue `schedule` mỗi 30 giây, mục `beat-heartbeat` nằm cạnh `run-due-schedules` của đợt 12 trong `BEAT_SCHEDULE` của `app/background/beat.py`, tiến trình nền ghi key `reconos:beat:heartbeat`. Tuổi key quá 60 giây: `degraded`, quá 150 giây hoặc thiếu: `down` | `system.md` |
| D3 | Engine trong `GET /system/health` | `health_check` của `engine` gọi REST kiểm tra như nút Test, không ghi nhật ký thao tác, giữ `ok_since` theo `schema.md`. Engine tắt hoặc thiếu kết nối: `down`, không gọi ra ngoài | `api/architecture.md` |
| D4 | Lần chẩn đoán chạy trên queue nào, khi nào `failed` | Task `reconos.run_diagnostics` trên queue `parse`. Kiểm tra mọi thành phần trừ `api`, số worker online, từng tool module bật có trên worker online. `exit_code` 1 khi có thành phần `down`. Không có worker hoặc tool module thiếu chỉ là `[WARN]` | `system.md` |
| D5 | Mã trả của `POST /system/diagnostics` | `200` theo `openapi.yaml`, body `id`, `status` | `openapi.yaml` |
| E1 | `GET /logs` với User | Chỉ log có `job_id` và `program_id` thuộc program được gán. `program_id` chưa gán: `404`. Mốc thời gian thiếu múi giờ: `422` | `api/architecture.md` |
| E2 | `DELETE /logs` xóa phân vùng | Chưa có phân vùng theo ngày, mọi dòng nằm ở phân vùng mặc định. Xóa dòng có `logged_at` trước 00:00 UTC của ngày chọn, ghi nhật ký `app_log_deleted` kèm số dòng | `api/architecture.md`, nợ 81 |

# Kiến trúc API

> Phiên bản: 1.20 · Ngày: 2026-11-12 · Trạng thái: 🔵 Chờ duyệt
> Mục 10: Kiến trúc API
> Liên quan: [openapi.yaml](openapi.yaml), [schema.md](../data/schema.md), [authorization.md](../security/authorization.md), [authentication.md](../security/authentication.md), [external-services.md](../integrations/external-services.md), [business-flow.md](../architecture/business-flow.md), [ADR xóa mềm](../decisions/adr-soft-delete.md)

## 📌 Đây là gì

- Quy ước chung của REST API và WebSocket do Backend API cung cấp: URL, phân trang, lọc, lỗi, phiên bản, sự kiện realtime.
- Danh sách endpoint: [openapi.yaml](openapi.yaml).

## 🎯 Dùng để làm gì

- Mọi endpoint cùng một quy ước, frontend dùng chung một client trong `src/lib/`.
- Mọi request đi qua xác thực, phân quyền theo program, chống CSRF (Cross-Site Request Forgery). Không lộ dữ liệu của program không được gán (G7).

## ⏰ Dùng khi nào

- Thêm hoặc sửa endpoint, sự kiện WebSocket. Viết client API ở frontend.
- Không dùng để tra contract worker: xem [external-services.md](../integrations/external-services.md).

## 📍 Ở đâu

- Router: `backend/app/<module>/router.py`. Schema request, response: `backend/app/<module>/schemas.py`.
- Client frontend: `frontend/src/lib/`. Danh sách endpoint: [openapi.yaml](openapi.yaml).

## ⚙️ Làm như thế nào

### Quy ước chung

| Mục | Quy ước |
|---|---|
| Tiền tố | `/api/v1`. Contract worker: `/api/v1/worker` |
| Đường dẫn | Danh từ số nhiều, kebab-case: `/scope-rules`, `/raw-outputs` |
| Tài nguyên con | Lồng dưới cha khi luôn thuộc cha: `/programs/{program_id}/scope-rules`. Thao tác trên một bản ghi dùng đường dẫn phẳng: `/scope-rules/{scope_rule_id}` |
| Thao tác đổi trạng thái | `POST` tới động từ: `/jobs/{job_id}/approve`, `/programs/{program_id}/archive` |
| Tên trường | snake_case theo cột Tên trong mã của [glossary](../appendix/glossary.md) |
| ID | UUID dạng chuỗi |
| Thời gian | ISO 8601, UTC |
| Định dạng | JSON. Lỗi: `application/problem+json` |
| Sửa một phần | `PATCH`, chỉ gửi trường cần đổi |
| Request ID | Header `X-Request-ID` dạng UUID. Client gửi kèm thì backend dùng lại, thiếu hoặc sai dạng thì sinh mới. Mọi response trả header này: [logging.md](../../.claude/rules/logging.md) |

- `GET` không đổi dữ liệu.
- Trường tính từ bảng khác (số đếm, tổng hợp) chỉ có ở endpoint đọc nó, không thêm vào response ghi. Ví dụ: `active_user_session_count` có ở `GET /users` và `GET /users/{user_id}`, không có ở `POST /users`, `PATCH /users/{user_id}`, `GET /auth/me`. Định nghĩa: [glossary.md](../appendix/glossary.md).
- Response không bao giờ chứa cột thông tin xác thực, giá trị băm mật khẩu, giá trị băm token.
- Chỉ `POST /auth/login` và `GET /health` không cần xác thực. `GET /health` chỉ trả `204`, không trả trạng thái, phiên bản, tên node.
- Dòng đã xóa mềm không có trong danh sách, tìm kiếm, số liệu tổng hợp. Đọc chi tiết trả `404`.

### Xác thực và phân quyền

| Bên gọi | Cách xác thực |
|---|---|
| Trình duyệt | Cookie phiên `__Host-`: [authentication.md](../security/authentication.md) |
| Worker | Token worker, chỉ gọi được `/api/v1/worker/` |

- Mỗi endpoint khai báo quyền qua dependency, mặc định từ chối: [authorization.md](../security/authorization.md).
- Trường `x-roles` trong [openapi.yaml](openapi.yaml) ghi vai trò được gọi endpoint.

### Chống CSRF

- Request `POST`, `PUT`, `PATCH`, `DELETE` từ trình duyệt bị từ chối khi:
  - Header `Origin` khác origin của ReconOS.
  - Header `Sec-Fetch-Site` là `cross-site`.
- Thiếu cả hai header: từ chối với request dùng cookie phiên.
- Cookie phiên `SameSite=Lax` là lớp bảo vệ thứ hai.
- Kiểm tra khai báo một lần ở tầng ứng dụng nên endpoint thêm sau tự có, không phải tự gọi.
- Endpoint của worker không dùng cookie phiên nên luôn qua được kiểm tra này.

### Phân trang

Danh sách dùng phân trang cursor theo keyset.

| Tham số | Ý nghĩa |
|---|---|
| `limit` | Số dòng mỗi trang. Mặc định 50, tối đa 200 |
| `cursor` | Lấy từ `next_cursor` của trang trước. Bỏ trống: trang đầu |
| `sort` | Trường sắp xếp, chọn trong các trường endpoint cho phép. Tiền tố `-`: giảm dần |

```json
{
  "items": [],
  "next_cursor": "eyJsYXN0X3NlZW5fYXQiOi...",
  "total": 14892,
  "total_is_estimate": false
}
```

- `next_cursor` là `null`: hết dữ liệu. Cursor chứa giá trị sắp xếp và `id` của dòng cuối, frontend không đọc nội dung cursor.
- `total` đếm chính xác khi nhỏ, ước lượng khi lớn. Ngưỡng và cách ước lượng: [performance.md](../ops/performance.md).
- UI dùng nút Trước, Sau. ❌ Không nhảy tới trang số N.

### Lọc

- Tham số lọc trùng tên cột: `program_id`, `severity`, `triage_status`, `in_scope`, `status`. `GET /jobs` lọc theo `status`, `GET /findings` lọc theo `triage_status`. Giá trị hợp lệ: [schema.md](../data/schema.md).
- Nhiều giá trị: lặp tham số, `severity=critical&severity=high`. Áp dụng cho `status`, `severity`, `triage_status`, `dns_status`, `technology_id`, `status_code`, `tool_module_id`.
- Khoảng thời gian: hậu tố `_from`, `_to`, ví dụ `last_seen_at_from`.
- Tìm theo chuỗi: `q`, chuỗi con không phân biệt hoa thường. `*` là wildcard, chỉ trên tên domain và địa chỉ IP. ❌ Không nhận regex. Endpoint export và summary cùng tài nguyên nhận `q` như danh sách.

| Endpoint | Cột `q` tìm |
|---|---|
| `/programs` | `name`, `platform`, `platform_handle`, `description` |
| `/domains` | `name` |
| `/ips` | `address`, `asn_org` |
| `/urls` | `url`, `title` |
| `/services` | `name`, `product` |
| `/screenshots` | `title`, `final_url` |
| `/jobs` | `target`, tên tool module |
| `/users` | `username`, `display_name` |
| `/tool-modules` | `name`, `title`, `description` |
| `/findings` | `name`, `template_id`, `cve`, `matched_at` |
| `/search` | Tên program, tên domain, `url`, tên finding, tên tool module. Lọc theo program được gán. Trả tối đa `limit` dòng, mặc định 10, tối đa 50, mỗi dòng `type` (`program`, `domain`, `url`, `finding`, `tool_module`), `id`, `label`, `program_id`, `NULL` với tool module |
- Tham số lọc của từng endpoint: [openapi.yaml](openapi.yaml). Mọi danh sách thuộc program nhận `program_id`. Danh sách liên quan tới một domain nhận `domain_id`: `/urls`, `/services`, `/asset-events`, `/screenshots`, `/findings`. Với `/services`: service trên IP mà domain phân giải ra, qua `domain_ip`. `/screenshots` nhận thêm `is_failed`, `job_id`, `technology_id`, `status_code` theo lớp `2xx`, `3xx`, `4xx`, `5xx`.
- User chỉ nhận dữ liệu của program được gán, kể cả khi không truyền `program_id`.

### Trường tính và số liệu tổng hợp

Trường tính không phải cột, API tính mỗi lần đọc và chỉ có ở endpoint đọc dưới đây.

| Endpoint | Trường |
|---|---|
| `GET /programs`, `GET /programs/{program_id}` | `in_scope_rule_count`, `out_of_scope_rule_count`, `domain_count`, `ip_count`, `url_count`, `service_count`, `finding_counts`, `last_job_finished_at`, `scope_coverage`, `assets_new_today`: `domain`, `url`, `ip_resolved_count`, `service_port_count`, `screenshot_count`, `created_by_username` |
| `GET /programs/{program_id}/scope-rules` | `matched_domain_count`: số domain của program khớp rule. Chưa trả cho tới khi có bảng `domain`: [tech-debt.md](../tech-debt.md) |
| `GET /domains`, `GET /domains/{domain_id}` | `ips`: danh sách địa chỉ IP, `url_count`, `service_count`, `finding_counts`, `has_findings`, `asn`, `asn_org` của IP đầu tiên trong `ips`. Riêng `GET /domains/{domain_id}` có thêm `tags`: danh sách `id` của `asset_tag`, `tag_id`, `key`, `value`. `ip_records`: danh sách `address`, `record_type`. `service_ports`: các cổng của service trên IP của domain, tăng dần |
| `GET /asset-events` | `asset_type`, `asset_name`, `program_name`, `tool_module_name`. Sự kiện của IP thêm `asn`, `asn_org` |
| `GET /domains/{domain_id}/activity` | Gộp sự kiện tài sản, finding, screenshot của domain, mới trước. Mỗi dòng `kind` (`asset_event`, `finding`, `screenshot`), `id`, `at`, `title`, `tool_module_name`, `job_id` |
| `GET /urls/{url_id}` | `technologies`: danh sách `technology_id`, `name`, `category`, `version` lấy từ `url_technology` và `technology` |
| `GET /users` gọi bởi Admin | Chỉ `id`, `username`, `role` |
| `GET /users`, `GET /users/{user_id}` gọi bởi Superadmin | `last_session_ip`, `last_seen_at` của phiên đang hoạt động gần nhất |
| `GET /user-sessions` | `username`, `display_name` |
| `GET /jobs`, `GET /jobs/{job_id}` | `created_by_username`, `worker_name`, `tool_module_name`, `status_changed_at`: giá trị mới nhất trong `created_at`, `approved_at`, `dispatched_at`, `started_at`, `finished_at`. Cột `priority` trả dạng `low`, `normal`, `high`, cột `tool_version` trả nguyên. `sort` nhận `created_at`, `-created_at`, `-status_changed_at`, `-priority` |
| `GET /workers` | `is_online`, `running_job_count`, `running_tool_module_ids`. Cột `cpu_percent`, `tool_versions` trả nguyên như worker báo |
| `GET /findings`, `GET /findings/{finding_id}` | `tool_module_name`, `asset`: `type`, `name`, `ip`, `port`, `service_name`. `matcher`. Riêng chi tiết thêm `description`, `remediation`, `request`, `response`, `in_scope`, `scope_rule`: giá trị In-Scope đầu tiên khớp tài sản, `NULL` khi không khớp |
| `GET /screenshots` | `technologies`: `name`, `category`. `similar_group`, `similar_count`. `retry_job_status` |
| `GET /screenshots/{screenshot_id}` | Như danh sách, thêm `worker_name`, `html_size`, `html_sha256`, `security_headers`: object 5 header, giá trị `true` khi có mặt, `security_headers_passed`, `security_headers_total` |
| `GET /tool-modules` | `title`, `description`, `group`, `runs_on`, `tools`, `output_types`, `param_schema` lấy từ mã. `last_job_at`, `jobs_24h`, `finding_count`, `engine_status`, `disabled_reason`, `estimated_seconds` |
| `GET /engines` | `version`, `last_tested_at`, `last_test_ok`, `api_key_updated_at`, `has_llm_api_key`, `uptime_seconds`, `slots_used`, `slots_total` |
| `GET /alerts` | Lọc `is_read`, `alert_type` lặp lại. `is_read` của tài khoản gọi. Mỗi dòng `id`, `alert_type`, `message`, `program_id`, `finding_id`, `job_id`, `created_at`, `is_read` |

- `finding_counts` là object theo 5 mức severity, đếm finding có `triage_status` khác `false_positive`, `duplicate`, `resolved`. Gọi là finding mở.
- Khung "today", "this week", "this month" trên UI là 24 giờ, 7 ngày, 30 ngày gần nhất, theo `window`.
- `last_job_finished_at`, `last_job_at`: `finished_at` lớn nhất của job `completed`.
- `scope_coverage`: tỉ lệ domain `in_scope` trên tổng domain, `NULL` khi chưa có domain. `assets_new_today`: tài sản có `first_seen_at` trong 24 giờ.
- `ip_resolved_count`: số IP có ít nhất một service. `service_port_count`: số cổng khác nhau. `has_findings`: domain có ít nhất một finding mở.
- `similar_group`: số thứ tự nhóm cùng `perception_hash` trong bộ lọc hiện tại, xếp theo `captured_at` sớm nhất của nhóm. `similar_count`: số screenshot trong nhóm, `1` là duy nhất.
- `retry_job_status`: trạng thái job gowitness mới nhất có mục tiêu là `final_url`, tạo sau `captured_at`. `NULL` khi chưa có.
- `security_headers` có khóa là tên header viết thường: `strict-transport-security`, `content-security-policy`, `x-frame-options`, `x-content-type-options`, `permissions-policy` trong `http_headers`.
- `is_online`: heartbeat trong ngưỡng như `workers_online`.
- `engine_status`: `status` của thành phần engine trong `GET /system/health`, `NULL` khi tool module không chạy trên engine. `disabled_reason`: `off` khi tắt, `engine_disabled`, `engine_down`, `not_installed` khi không worker online nào cài, `NULL` khi sẵn sàng.
- `estimated_seconds`: trung vị `finished_at` trừ `started_at` của 20 job `completed` gần nhất, `NULL` khi chưa có job.
- `param_schema`: JSON Schema dạng object, mỗi tham số một khóa trong `properties` với `type`, `title`, `description`, `default`, `minimum`, `maximum`, `enum`. Tham số số luồng và tốc độ dùng tên khóa `threads`, `rate`. `runs_on`: tên engine, `NULL` khi tool module chạy công cụ trực tiếp. `output_types`: tập con của `domain`, `ip`, `url`, `service`, `screenshot`, `finding`.
- `finding_count`: số finding có `job_id` thuộc job của tool module. `jobs_24h`: số job tạo trong 24 giờ.
- `uptime_seconds`: thời gian từ `engine.ok_since`, `NULL` khi engine không `ok`. `slots_used`, `slots_total`: job `running` và tổng `max_concurrency` của tool module bật chạy trên engine.

Danh sách trả thêm khóa tổng hợp ngoài `items`, tính trên mọi dòng tài khoản xem được, bỏ qua bộ lọc và phân trang:

| Endpoint | Khóa |
|---|---|
| `GET /users` gọi bởi Superadmin | `role_counts`: số tài khoản theo vai trò. `locked_count` |
| `GET /user-sessions` | `account_count`: số tài khoản có ít nhất một phiên đang hoạt động. `sort`: `created_at`, `-created_at` mặc định, `last_seen_at`, `-last_seen_at`. `last_session_ip` của `GET /users` lấy từ phiên có `last_seen_at` mới nhất. `total` theo bộ lọc, `role_counts`, `locked_count` bỏ qua bộ lọc |
| `GET /tool-modules` | `enabled_count`, `disabled_count`, `disabled_names`, `group_counts`, `engines_bound`: số engine bật, `installed_count`: số tool module bật có trên ít nhất một worker online, `ready_count`: số tool module có `disabled_reason` là `NULL` |

Response tổng hợp:

| Endpoint | Trường |
|---|---|
| `GET /dashboard/summary` | Tham số `window`: `24h` mặc định, `7d`, `30d`. `programs`: số program xem được. `programs_active`: số program `active`. `active_sync_ratio`: số program `active` có job chuyển sang `completed` trong 24 giờ qua chia `programs_active`, `NULL` khi chưa có program `active`. `programs_new`: số program tạo trong `window`. `assets`: số `domain`, `ip`, `url`, `service`. `assets_new`: cùng 4 khóa, đếm tài sản có `first_seen_at` trong `window`. `new_assets_daily`: 14 phần tử `date`, `domain`, `url`, `ip`, cũ trước, phần tử cuối là hôm nay. `top_programs`: tối đa 5 phần tử `id`, `name`, `domain_count`, giảm dần. `scope_coverage`: tỉ lệ domain `in_scope` trên tổng domain, `NULL` khi chưa có domain. `top_ports`: tối đa 5 phần tử `port`, `transport`, `name`, `count`, giảm dần theo số service. `top_service_name`: `name`, `ratio` của tên dịch vụ nhiều nhất, `NULL` khi chưa có service. `findings_by_severity`: như `finding_counts`. `confirmed_cve_findings_24h`. `jobs_by_status`: đủ 7 trạng thái job. `jobs_per_minute`. `workers_online` |
| `GET /dashboard/summary`, thêm | `assets_closed`: `service`, số service có `closed_at` trong `window`. `findings_near_sla`: số finding `confirmed` hoặc `reported` có tuổi quá `finding_sla_days` trừ 2 ngày |
| `GET /dispatcher/status` | `last_heartbeat_at` của dispatcher, `queued_by_tool_module`, `queued_by_program`: object có khóa là ID tool module hoặc ID program, giá trị là số job `queued`. `status`: `ok`, `degraded`, `down` theo heartbeat. `queued_total`, `queue_capacity`, `workers_online`, `running_total`, `slot_capacity`, `jobs_per_minute`, `avg_wait_seconds`, `redis_used_bytes`, `last_dispatched_at`, `last_dispatched_tool_module` |
| `GET /domains/summary` | Cùng bộ lọc như `GET /domains`. `total`, `in_scope`, `resolved`, `resolved_new_24h`, `unresolved`, `with_findings`, `with_critical`, `new_24h`, `new_daily_avg_7d` |
| `GET /findings/summary` | Cùng bộ lọc như `GET /findings`, mặc định mọi trạng thái triage. `total`, `by_severity`, `by_triage_status`, `by_program`: `program_id`, `name`, `count`. `new_24h_by_severity` |
| `GET /screenshots/summary` | Cùng bộ lọc như `GET /screenshots`, trừ `status_code`. `by_status_code`: số screenshot theo lớp `2xx`, `3xx`, `4xx`, `5xx` |
| `GET /tool-modules/stats` | Tham số `window` như dashboard. `jobs`: job tạo trong `window`. `jobs_prev`: job tạo trong khung liền trước. `stalled`: job `running` quá `job_heartbeat_timeout_minutes` không có heartbeat |
| `POST /engines/{engine_id}/test` | `version`: phiên bản engine trả về, `NULL` khi engine không báo. Engine không trả lời thì trả lỗi |
| `GET /system/health` | `components[]`: `name`, `status` (`ok`, `degraded`, `down`), `latency_ms`, `checked_at`, `version`, `detail`, `message`: lý do khi không `ok`. Thêm `queue_length`, `workers_online`, `tools_installed`: `installed`, `total`, `fleet_load`. Tham số `component` chỉ kiểm lại một thành phần |

- `components[].name` theo thành phần trong [system.md](../architecture/system.md): `api`, `dispatcher`, `background`, `beat`, `postgres`, `reconos_log`, `redis`, `minio`, `osmedeus`, `vigolium`.
- Backend tính `status` và `workers_online`. Frontend chỉ hiển thị. ❌ Không trả PID, đường dẫn, địa chỉ IP nội bộ.
- Số liệu chỉ tính trên program tài khoản xem được.
- `new_assets_daily` chia ngày theo múi giờ `Asia/Ho_Chi_Minh`, không phụ thuộc `window`.
- `top_ports[].name`: tên dịch vụ gặp nhiều nhất trên cổng đó, `NULL` khi chưa nhận diện được.
- `confirmed_cve_findings_24h`: số finding có `cve` không rỗng, `triage_status` là `confirmed`, `triaged_at` trong 24 giờ qua.
- `jobs_per_minute`: số job chuyển sang `completed` trong 60 phút qua chia 60.
- `workers_online`: tính như trong `GET /system/health`.
- `queue_capacity`: `system_setting` cùng tên. `slot_capacity`: tổng `max_concurrency` của tool module bật. `fleet_load`: job `running` chia `slot_capacity`.
- `avg_wait_seconds`: trung bình `started_at` trừ `approved_at`, thiếu thì `created_at`, của job bắt đầu trong 60 phút qua. `redis_used_bytes`: `used_memory` của Redis.
- `components[].detail`: `postgres` là kết nối đang dùng trên tối đa, `redis` là `used_memory` trên `maxmemory`, thành phần khác `NULL`.
- `resolved_new_24h`: domain `resolved` có `first_seen_at` trong 24 giờ. `unresolved`: `dns_status` là `nxdomain` hoặc `timeout`. `in_scope`: số domain `in_scope`. `with_critical`: số domain có finding critical mở. `new_daily_avg_7d`: số domain mới trung bình mỗi ngày của 7 ngày trước 24 giờ gần nhất.
- `new_24h_by_severity`: finding có `first_seen_at` trong 24 giờ, theo severity.
- `tools_installed`: tool module bật có trên ít nhất một worker online, trên tổng tool module.

### Lỗi

Định dạng RFC 9457 Problem Details, thêm trường `code`.

```json
{
  "type": "https://reconos/errors/target-out-of-scope",
  "title": "Target out of scope",
  "status": 422,
  "code": "target_out_of_scope",
  "detail": "a.other.com does not match any in-scope rule",
  "errors": [{"field": "target[0]", "code": "target_out_of_scope"}]
}
```

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `bad_request` | Request sai cú pháp, cursor không hợp lệ |
| 401 | `unauthenticated` | Không có phiên, phiên hết hạn, token worker sai |
| 403 | `forbidden` | Vai trò không có quyền thao tác trên tài nguyên xem được. Request bị chặn do kiểm tra CSRF |
| 403 | `self_approval_forbidden` | Duyệt job do chính mình tạo |
| 404 | `not_found` | Không tồn tại, hoặc thuộc program User không được gán |
| 409 | `conflict` | Vi phạm ràng buộc duy nhất, kèm `errors` với `code` là `already_exists` cho trường bị trùng. Chuyển trạng thái không hợp lệ |
| 413 | `payload_too_large` | File upload vượt giới hạn dung lượng |
| 422 | `validation_error` | Dữ liệu sai schema, kèm `errors` từng trường |
| 422 | `target_out_of_scope` | Mục tiêu không khớp scope khi tạo job (G5). `errors` từng mục tiêu: `code` là `target_out_of_scope`, hoặc `invalid_target` khi mục tiêu không phải domain, IP, CIDR, URL đọc được |
| 422 | `current_password_incorrect` | Đổi mật khẩu nhập sai mật khẩu hiện tại. Phiên vẫn hợp lệ nên không dùng 401. Kèm `errors` với `field` là `current_password` |
| 429 | `rate_limited` | Vượt giới hạn tần suất, kèm header `Retry-After` |
| 500 | `internal_error` | Lỗi không lường trước. `detail` không chứa stack trace |

- `detail` viết tiếng Anh, không chứa thông tin xác thực, đường dẫn hệ thống, câu lệnh SQL.
- Cách backend phát sinh lỗi và chuyển lỗi thành response: [error-handling.md](../../.claude/rules/error-handling.md).

### Thao tác hàng loạt, xuất dữ liệu, tải file

| Loại | Quy ước |
|---|---|
| Hàng loạt | `POST /<tài nguyên>/bulk-<thao tác>`, tối đa 500 ID. Tất cả thành công, hoặc không dòng nào thay đổi. Body gồm `ids` và trường của thao tác, ví dụ `POST /findings/bulk-triage` nhận `ids`, `triage_status`. `duplicate` không nhận trong thao tác hàng loạt vì cần `duplicate_of_id` riêng từng finding |
| Xuất dữ liệu | `GET /<tài nguyên>/export?format=csv\|jsonl\|md`, cùng tham số lọc như danh sách, trả dạng stream. `ids` lặp lại, tối đa 500, chỉ xuất các dòng đó. Có cho `domains`, `ips`, `urls`, `services`, `findings`, `users` |
| Tải output thô | `GET /raw-outputs/{raw_output_id}/content`, luôn `Content-Disposition: attachment` |
| Ảnh screenshot | `GET /screenshots/{screenshot_id}/image`, kèm header `X-Content-Type-Options: nosniff` |
| Dữ liệu trang của screenshot | `/html` trả `text/plain`, kèm `nosniff`, UI chỉ hiện dạng văn bản. `/network` trả object có khóa `network_log`. `/har` dựng file HAR 1.2 từ `network_log`, `Content-Disposition: attachment` |

- Backend API đọc file từ MinIO rồi stream cho trình duyệt. ❌ Không trả URL trực tiếp tới MinIO.
- Xuất CSV: thêm dấu `'` trước ô bắt đầu bằng `=`, `+`, `-`, `@`.

### Thao tác riêng

| Endpoint | Quy ước |
|---|---|
| `POST /jobs`, `POST /jobs/bulk-create` | Body `program_id`, `target`, `priority` (`low`, `normal`, `high`, mặc định `normal`), `proxy_id`. `POST /jobs` thêm `tool_module_id`, `params`. `bulk-create` thêm `items`: mỗi phần tử `tool_module_id`, `params`. Kiểm scope, tham số từng job. `bulk-create` trả `items`: các job vừa tạo theo thứ tự của body |
| `POST /jobs/{job_id}/prioritize`, `POST /dispatcher/wake`, `POST /jobs/cleanup`, `POST /jobs/bulk-retry` | Dispatch Now, Dispatch All, Cleanup, Retry Failed: [business-flow.md](../architecture/business-flow.md). `cleanup` trả số job đã hủy |
| `GET /programs/{program_id}/scope-rules` | `sort`: `created_at` mặc định, `-created_at` |
| `POST /programs/{program_id}/scope-rules`, `POST …/scope-rules/bulk-create`, `PATCH /scope-rules/{scope_rule_id}` | Body `scope_type`, `rule_type`, `value`, `reason`. `value` lưu dạng chuẩn hóa: [business-flow.md](../architecture/business-flow.md). Giá trị không đọc được: `422 validation_error`, `errors` với `field` là `value` hoặc `items.<i>.value`, `code` là một trong `invalid_length`, `not_ascii`, `control_character`, `invalid_domain`, `invalid_ip`, `invalid_url`, `invalid_path`, `encoded_slash`, `unsupported_scheme`, `credentials_in_url`, `invalid_port`, `wildcard_target`, `wrong_rule_form`, `query_in_rule`. Out-of-Scope thiếu `reason`: `code` là `missing`. Trùng scope rule sau chuẩn hóa: `409 conflict`, `code` là `already_exists`. Program `archived`: `409 conflict`. `bulk-create` tối đa 200 phần tử, tất cả hoặc không |
| `POST /programs/{program_id}/scope-check` | Body `targets`, tối đa 200. Trả `items` theo thứ tự body: `target`, `normalized_target`, `in_scope`, `verdict`, `rule_value`. `verdict` nhận `in_scope`, `invalid_target`, `no_in_scope_match`, `out_of_scope_match`. `rule_value`: In-Scope đầu tiên khớp, hoặc Out-of-Scope đã loại mục tiêu. Không ghi dữ liệu |
| `POST /schedules/{schedule_id}/run` | Tạo ngay một job từ lịch, kiểm scope, không đổi `next_run_at` |
| `GET /schedules` | Lịch của mọi program tài khoản xem được. Lọc `engine_id`: lịch có tool module chạy trên engine đó. Mỗi dòng thêm `program_name`, `tool_module_name`. Dùng cho tab Schedules của S16 |
| `DELETE /domains/{domain_id}`, `POST /domains/bulk-delete`, `DELETE /screenshots/{screenshot_id}`, `DELETE /users/{user_id}` | Xóa mềm. Superadmin không xóa chính mình |
| `POST /programs/bulk-pause`, `bulk-resume`, `bulk-archive`, `bulk-delete` | Như thao tác trên từng program. `bulk-delete` là xóa cứng như `DELETE /programs/{program_id}`. Một ID không tồn tại hoặc không xem được: `404`, không program nào đổi |
| `POST /programs/{program_id}/pause`, `resume`, `archive` | Chuyển trạng thái theo [business-flow.md](../architecture/business-flow.md). Trạng thái hiện tại không cho phép: `409 conflict` |
| `POST`, `PATCH /programs/{program_id}` | Body `name`, `platform`, `platform_url`, `platform_handle`, `bounty_type` (mặc định `bounty`), `description`. Trường lạ, kể cả `status`: `422`. `platform_url` chỉ nhận `http`, `https`, sai thì mã `url_invalid`. `PATCH` gửi `null` cho `name`, `bounty_type`: mã `null_not_allowed`. Program `archived`: `409 conflict` |
| `GET /programs` | `sort` mặc định `name`. Trường tính lấy từ bảng của đợt sau trả `0` hoặc `null` cho tới khi bảng đó có: [tech-debt.md](../tech-debt.md) |
| `POST /programs/{program_id}/users` | Body `user_id`. Chỉ gán tài khoản vai trò `user`. Tài khoản không tồn tại: `422`, `errors` có `user_id` mã `not_found`. Vai trò khác: mã `role_not_assignable`. Đã gán: `409 conflict`. Gán, bỏ gán vẫn làm được khi program `archived` |
| `GET /programs/{program_id}/users`, `GET /programs/{program_id}/proxies` | Một thứ tự duy nhất: `sort` chỉ nhận `-assigned_at`, `-created_at` |
| `POST /programs/{program_id}/proxies`, `PATCH /proxies/{proxy_id}` | Body `name`, `url`, `is_enabled` (mặc định `true`). `url` chỉ ghi: response không có URL, kể cả dạng che. Scheme `http`, `https`, `socks4`, `socks4a`, `socks5`, `socks5h`, có host, không path, query, fragment. Sai: `422` mã `proxy_url_invalid`, `detail` không lặp lại giá trị. Program `archived`: `409 conflict`, cả khi xóa proxy |
| `POST /users/{user_id}/revoke-sessions`, `POST /users/bulk-revoke-sessions` | Thu hồi mọi phiên của tài khoản. Với chính mình: giữ phiên đang gọi |
| `POST /asset-tags/bulk-create` | Body `tag_id`, `asset_type`, `ids` |
| `GET`, `POST /saved-filters`, `DELETE /saved-filters/{saved_filter_id}` | Chỉ bộ lọc của tài khoản gọi. `GET` nhận `screen`. Body `screen`, `name`, `params`. Trùng `name` trong cùng `screen`: `409 conflict` |
| `GET /system-settings/{key}` | Superadmin đọc mọi key. Admin, User chỉ đọc key có cột Đọc công khai trong [configuration.md](../ops/configuration.md) |
| `GET /roles/permissions` | Ma trận quyền sinh từ khai báo quyền của backend, trả `items`, mỗi dòng `action`, `superadmin`, `admin`, `user` với giá trị `allow`, `deny`, `limited` và `note` |
| `POST /system/diagnostics`, `GET /system/diagnostics/{diagnostic_run_id}`, `GET /system/diagnostics/latest` | Tạo lần chẩn đoán chạy ở tiến trình nền, trả `id`, `status`. Đọc `id`, `status`, `exit_code`, `output`, `created_at`, `finished_at`. Mỗi dòng của `output` bắt đầu bằng một tiền tố: `[OK]` đạt, `[WARN]` chưa đạt nhưng hệ thống vẫn chạy, `[FAIL]` không đạt, `[*]` thông tin |
| `GET /tools` | Mỗi công cụ của tool module: `name`, `tool_modules`, `status` (`installed`, `missing`), `installed`: `worker_name`, `version` theo heartbeat |
| `GET /engines/{engine_id}/workflows`, `GET /engines/{engine_id}/workflows/{name}`, `GET`, `PATCH /engines/{engine_id}/modules`, `POST /engines/{engine_id}/validate`, `POST /engines/{engine_id}/verify-model` | Backend gọi REST của engine rồi trả lại: [external-services.md](../integrations/external-services.md). `PATCH /engines/{engine_id}` nhận `settings` và `llm_api_key`, chỉ ghi. Dạng response: schema `EngineWorkflow`, `EngineModule`, `EngineCheckResult` trong [openapi.yaml](openapi.yaml) |
| `GET /logs` | User chỉ nhận log của job thuộc program được gán. Lọc thêm `program_id`, `event`, `engine` |

### WebSocket

- Một endpoint `/api/v1/ws`. Xác thực bằng cookie phiên, kiểm tra `Origin` khi bắt tay.
- Server chỉ đẩy sự kiện. Thao tác của người dùng đi qua REST.
- Mỗi sự kiện chỉ gửi cho tài khoản xem được program của sự kiện.

```json
{"type": "job.status_changed", "program_id": "0190...", "data": {"job_id": "0190...", "status": "running"}, "at": "2026-11-01T08:00:00Z"}
```

| `type` | Khi nào |
|---|---|
| `job.status_changed` | Job đổi trạng thái |
| `finding.created` | Parser tạo finding mới |
| `asset.discovered` | Parser tạo tài sản mới, gom theo job |
| `alert.created` | Có cảnh báo mới |
| `worker.status_changed` | Worker bắt đầu gửi heartbeat hoặc mất heartbeat |

- Frontend nhận sự kiện thì làm mới query TanStack Query tương ứng. Mất kết nối thì kết nối lại và làm mới toàn bộ query đang mở.

### Phiên bản

- Thêm endpoint, thêm trường tùy chọn trong response: giữ `v1`.
- Đổi tên, xóa trường, đổi ý nghĩa: tạo `/api/v2` cho endpoint đó.

### OpenAPI

- Hiện tại: [openapi.yaml](openapi.yaml) viết tay, ghi đường dẫn, phương thức, vai trò và schema chính.
- Khi có mã: sinh `openapi.yaml` từ FastAPI. CI so file đã commit với file sinh ra, khác nhau thì báo lỗi.

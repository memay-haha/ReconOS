# Schema CSDL

> Phiên bản: 1.7 · Ngày: 2026-11-12 · Trạng thái: 🔵 Chờ duyệt
> Mục 9: Cơ sở dữ liệu
> Liên quan: [erd.mermaid](erd.mermaid), [database.md](database.md), [modules.md](../architecture/modules.md), [business-flow.md](../architecture/business-flow.md), [ADR xóa mềm](../decisions/adr-soft-delete.md), [external-services.md](../integrations/external-services.md)

## 📌 Đây là gì

- Mô tả 36 bảng của CSDL PostgreSQL: bảng lưu gì, module nào sở hữu, cột cần giải thích.
- Liệt kê giá trị liệt kê và ràng buộc duy nhất. Cột và quan hệ đầy đủ: ERD (Entity Relationship Diagram) trong [erd.mermaid](erd.mermaid).

## 🎯 Dùng để làm gì

- Tra ý nghĩa bảng và cột khi viết model SQLAlchemy, migration, API và màn hình (G1, G3).
- Đối chiếu dữ liệu màn hình S02 đến S20 với bảng lưu dữ liệu đó.

## ⏰ Dùng khi nào

- Viết hoặc rà soát model, migration. Thiết kế endpoint, bộ lọc trên màn hình.
- Không dùng để tra quy ước, cách lưu output thô, xóa dữ liệu: xem [database.md](database.md).

## 📍 Ở đâu

- ERD: [erd.mermaid](erd.mermaid). Model: `backend/app/<module>/models.py`. Migration: `backend/migrations/`.

## ⚙️ Làm như thế nào

### ERD

- Một sơ đồ `erDiagram` duy nhất trong [erd.mermaid](erd.mermaid): đủ bảng, cột, khóa chính, khóa ngoại, quan hệ.
- Không vẽ quan hệ từ cột người thực hiện tới `user`: `created_by`, `updated_by`, `approved_by`, `triaged_by`, `assigned_by`, `audit_log.user_id`.
- Đổi schema: sửa [erd.mermaid](erd.mermaid) và file này cùng migration.

### Bảng theo khu vực

| Khu vực | Module: bảng |
|---|---|
| Tài khoản và vận hành | `core`: `user`, `user_session`, `system_setting`, `audit_log`. `user`: `login_attempt`, `worker`, `worker_token`, `saved_filter`. `dashboard`: `diagnostic_run` |
| Program và scope | `program`: `program`, `program_user`, `proxy`. `scope`: `scope_rule`. `job`: `schedule` |
| Tool module và job | `tool_module`: `tool_module`. `engine`: `engine`, `engine_variable`. `job`: `job`. `raw_output`: `raw_output` |
| Tài sản | `asset`: `domain`, `ip`, `domain_ip`, `service`, `url`, `technology`, `url_technology`, `asset_event`. `screenshot`: `screenshot` |
| Finding và báo cáo | `finding`: `finding`. `tag`: `tag`, `asset_tag`, `finding_tag`. `report`: `report`, `report_finding`. `alert`: `alert`, `alert_read` |

### Tài khoản và vận hành

| Bảng | Lưu gì | Cột cần chú ý |
|---|---|---|
| `user` | Tài khoản, vai trò, trạng thái khóa | `password_hash`: Argon2id. `deleted_at`: xóa mềm, tài khoản không đăng nhập được, `username` không dùng lại được. Số phiên đang hoạt động (`active_user_session_count`) không phải cột: API tính từ `user_session` mỗi lần đọc |
| `user_session` | Phiên đăng nhập phía server | `session_hash`: giá trị băm session ID, cookie giữ bản gốc. Không có cột thu hồi: thu hồi xóa dòng. Phiên đang hoạt động khi `expires_at` còn sau hiện tại và `last_seen_at` nằm trong `session_idle_timeout_minutes` |
| `login_attempt` | Lần đăng nhập sai, dùng để chặn dò mật khẩu | Ghi cả khi tên đăng nhập không tồn tại nên `username` là chuỗi tự do, không có khóa ngoại. Đăng nhập đúng thì xóa dòng của tài khoản đó |
| `worker` | Máy worker đã đăng ký | `last_heartbeat_at`: lần cuối worker báo còn hoạt động. `tool_modules`: tool module đã cài. `tool_versions`: mảng `name`, `version` của công cụ đã cài. `cpu_percent`: tải CPU của máy, 0 đến 100. Ba cột cuối do worker báo qua heartbeat |
| `worker_token` | Token của worker, nhiều token để xoay vòng | `token_hash`: giá trị băm. `revoked_at` có giá trị: đã thu hồi |
| `audit_log` | Nhật ký thao tác (G7) | Tối đa một trong `user_id`, `worker_id` có giá trị. Cả hai là `NULL`: thao tác của hệ thống. Cột `user_id` không có khóa ngoại: nhật ký chỉ thêm dòng, phải ghi được cả từ transaction khác |
| `system_setting` | Ngưỡng vận hành Superadmin sửa trên UI | `key`: tên thiết lập. Danh sách tên thiết lập và giá trị mặc định: [configuration.md](../ops/configuration.md) |
| `saved_filter` | Bộ lọc đã lưu của một tài khoản | `screen`: màn hình danh sách, ví dụ `domains`. `params`: object tham số lọc theo tên tham số của endpoint danh sách. Chỉ chủ sở hữu đọc, xóa |
| `diagnostic_run` | Lần chẩn đoán trên S15 | `output`: kết quả từng dòng dạng văn bản, không chứa thông tin xác thực, đường dẫn, PID. `exit_code`: `0` khi mọi kiểm tra đạt, `1` khi có kiểm tra không đạt |

- `core` giữ `user`, `user_session` vì mọi module ở mọi tầng đều cần biết ai đang đăng nhập: [dependency-graph.md](../architecture/dependency-graph.md). Nghiệp vụ tài khoản vẫn thuộc module `user`.
- `core` giữ `audit_log` và hai hàm ghi vì phần kiểm tra vai trò trong `core` ghi lại yêu cầu bị từ chối. Phần đọc nhật ký vẫn thuộc module `audit_log`.

### Program và scope

| Bảng | Lưu gì | Cột cần chú ý |
|---|---|---|
| `program` | Program bug bounty hoặc VDP (Vulnerability Disclosure Program) | `platform`: HackerOne, Bugcrowd, Intigriti hoặc program tự vận hành. `archived_at`: thời điểm lưu trữ. `platform_handle`: mã program trên nền tảng, ví dụ `uber`, nhập tay. Số scope rule, số tài sản, số finding không phải cột: [api/architecture.md](../api/architecture.md) |
| `program_user` | Gán User vào program | Admin, Superadmin không cần dòng gán |
| `scope_rule` | Scope rule In-Scope, Out-of-Scope | `reason`: bắt buộc khi `scope_type` là `out_of_scope` |
| `proxy` | Proxy của program | `url_encrypted`: URL proxy, có thể chứa tên đăng nhập và mật khẩu |
| `schedule` | Lịch quét định kỳ | `target`, `params`: mục tiêu và tham số của job do lịch sinh ra. `next_run_at`: lần chạy kế tiếp |

### Tool module và job

| Bảng | Lưu gì | Cột cần chú ý |
|---|---|---|
| `tool_module` | Cấu hình tool module, mỗi tool module đăng ký trong mã có một dòng | `name`: khớp tên đăng ký trong mã. `timeout_minutes`: thời hạn chạy một job. Nhóm công cụ và schema tham số nằm trong mã |
| `engine` | Kết nối tới Osmedeus, Vigolium | `settings`: cấu hình trên S16, S17, trừ thông tin xác thực, khóa theo bảng dưới. `llm_api_key_encrypted`: API key LLM của Vigolium, chỉ ghi. `version`, `last_tested_at`, `last_test_ok`: kết quả lần kiểm tra kết nối gần nhất. `api_key_updated_at`: lần đổi API key gần nhất. `ok_since`: lần healthcheck `ok` đầu tiên của chuỗi `ok` hiện tại, `NULL` khi lần gần nhất không `ok` |
| `engine_variable` | Biến engine trên S16 | `value_encrypted`: giá trị đã mã hóa |
| `job` | Job và trạng thái job | `target`: mục tiêu đã kiểm tra scope. `created_by` là `NULL`: job do `schedule` sinh. `worker_id`: ghi khi worker báo nhận. `last_heartbeat_at`: heartbeat gần nhất của job. `retry_of_job_id`: job cũ khi thử lại. `status_reason`: lý do hủy, từ chối, lỗi. `priority`: `0`, `1`, `2` ứng với `low`, `normal`, `high` của API. `tool_version`: phiên bản công cụ worker báo khi kết thúc job |
| `raw_output` | Metadata output thô, nội dung trong MinIO | `object_key`: khóa object trong MinIO. `sha256`: kiểm tra nguyên vẹn |

### Tài sản

| Bảng | Lưu gì | Cột cần chú ý |
|---|---|---|
| `domain` | Domain, subdomain | `apex`: domain gốc. `is_wildcard`: domain trả lời DNS cho mọi subdomain. `deleted_at`: xóa mềm. Số URL, số service, số finding không phải cột: [api/architecture.md](../api/architecture.md) |
| `ip` | Địa chỉ IPv4, IPv6 | `cdn_name` là `NULL`: không thuộc CDN. `asn_org`: tổ chức sở hữu ASN (Autonomous System Number) |
| `domain_ip` | Domain phân giải ra IP | Khóa chính gồm `record_type`: bản ghi A và AAAA tách riêng |
| `service` | Cổng mở trên IP | `name`: tên dịch vụ như `https`. `product`, `version`: phần mềm nhận diện được. `closed_at`: lần quét cổng sau trên IP không thấy cổng, `NULL` khi còn mở |
| `url` | URL đã phát hiện kèm metadata HTTP | `domain_id` có giá trị khi host là domain, `ip_id` khi host là IP. `url_hash`: SHA-256 của `url` đã chuẩn hóa. `tls_not_after`: ngày hết hạn chứng chỉ TLS do httpx báo |
| `technology` | Danh mục công nghệ dùng chung | `category`: framework, web server, CDN, thư viện |
| `url_technology` | Công nghệ phát hiện trên URL | `version`: `NULL` khi không nhận diện được |
| `screenshot` | Metadata screenshot của gowitness | `raw_output_id`: file ảnh trong output thô. `html_raw_output_id`: HTML của trang trong output thô. `perception_hash`: gom ảnh giống nhau trên S06. `is_failed`: chụp lỗi. `width`, `height`, `device_scale`: độ phân giải chụp. `remote_ip`: IP máy chủ trả lời. `duration_ms`: thời gian chụp. `tls`, `network_log`, `console_log`, `cookies`: dữ liệu gowitness theo bảng dưới. `deleted_at`: xóa mềm |
| `asset_event` | Sự kiện tài sản: phát hiện, thay đổi | Liên kết một tài sản. `diff`: cột đã đổi, giá trị cũ và mới |

### Finding và báo cáo

| Bảng | Lưu gì | Cột cần chú ý |
|---|---|---|
| `finding` | Finding và trạng thái triage | Liên kết một tài sản. `raw_output_id`: output thô tạo finding lần đầu. `duplicate_of_id`: có giá trị khi `triage_status` là `duplicate`. `detail`: trường riêng của công cụ, khóa theo bảng dưới |
| `tag` | Danh mục tag key-value dùng chung | Một cặp `key`, `value` là một tag |
| `asset_tag` | Tag gắn vào tài sản | Liên kết một tài sản |
| `finding_tag` | Tag gắn vào finding | |
| `report` | Báo cáo của program | `body`: Markdown. `platform_report_ref`: mã báo cáo trên nền tảng bug bounty, nhập tay |
| `report_finding` | Finding trong báo cáo | |
| `alert` | Cảnh báo theo program | `asset_new` gom tài sản mới theo job, liên kết `job_id` |
| `alert_read` | Tài khoản đã đọc cảnh báo | Không có dòng: chưa đọc |

- Liên kết một tài sản: 4 cột `domain_id`, `ip_id`, `url_id`, `service_id`, đúng một cột có giá trị. Chi tiết: [database.md](database.md).

### Cột jsonb có cấu trúc

| Cột | Khóa |
|---|---|
| `finding.detail` | Mọi parser ghi đủ 5 khóa, giá trị `NULL` khi output thô không có: `matcher`, `description`, `remediation`, `request`, `response`. Khóa riêng của công cụ ghi thêm bên cạnh |
| `screenshot.tls` | `protocol`, `cipher`, `issuer`, `subject`, `san`: mảng tên, `not_before`, `not_after` |
| `screenshot.network_log` | Mảng `method`, `url`, `status_code`, `content_type`, `size_bytes`, `duration_ms`, `remote_ip` |
| `screenshot.console_log` | Mảng `level`, `message`, `at` |
| `screenshot.cookies` | Mảng `name`, `domain`, `path`, `expires`, `secure`, `http_only`, `same_site`. ❌ Không lưu giá trị cookie (G7) |
| `engine.settings` của Osmedeus | `scan_preset`: `quick`, `balanced`, `deep`, mặc định `balanced` |
| `engine.settings` của Vigolium | `llm_provider`, `llm_model`, `llm_base_url` |

- Parser `nuclei` ghi `matcher` từ `matcher-name`, `description`, `remediation` từ `info`, `request`, `response` từ trường cùng tên của nuclei.
- Cách gowitness xuất các trường này: [external-services.md](../integrations/external-services.md).

### CSDL log

CSDL `reconos_log` riêng, không nằm trong [erd.mermaid](erd.mermaid). Một bảng `app_log`, phân vùng theo ngày.

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `uuid` | `uuidv7()` |
| `logged_at` | `timestamptz` | Thời điểm ghi log, khóa phân vùng |
| `level` | `text` | `info`, `warning`, `error`, `critical` |
| `service` | `text` | Tiến trình ghi: `api`, `dispatcher`, `background`, `beat`, `worker` |
| `event` | `text` | Tên sự kiện |
| `request_id` | `uuid` | Có giá trị khi log thuộc một request |
| `job_id` | `uuid` | Có giá trị khi log thuộc một job |
| `program_id` | `uuid` | Có giá trị khi log thuộc một program |
| `worker_id` | `uuid` | Có giá trị khi log từ worker |
| `context` | `jsonb` | Trường còn lại của bản ghi log |

- Không có khóa ngoại sang CSDL chính. Quy tắc ghi log: [logging.md](../../.claude/rules/logging.md).

### Giá trị liệt kê

| Cột | Giá trị |
|---|---|
| `user.role` | `superadmin`, `admin`, `user` |
| `program.status` | `active`, `paused`, `archived` |
| `program.bounty_type` | `bounty`, `vdp` |
| `scope_rule.scope_type` | `in_scope`, `out_of_scope` |
| `scope_rule.rule_type` | `domain`, `wildcard`, `cidr`, `url` |
| `job.priority` | `low`, `normal`, `high` |
| `job.status` | `pending_approval`, `queued`, `dispatched`, `running`, `completed`, `failed`, `cancelled` |
| `raw_output.parse_status` | `pending`, `parsed`, `failed`, `no_parser` |
| `domain.dns_status` | `unknown`, `resolved`, `nxdomain`, `timeout` |
| `domain_ip.record_type` | `a`, `aaaa` |
| `service.transport` | `tcp`, `udp` |
| `asset_event.event_type` | `discovered`, `changed` |
| `finding.severity` | `critical`, `high`, `medium`, `low`, `info` |
| `finding.triage_status` | `new`, `confirmed`, `false_positive`, `duplicate`, `reported`, `resolved` |
| `report.status` | `draft`, `submitted` |
| `alert.alert_type` | `finding_new`, `job_pending_approval`, `job_failed`, `asset_new`, `cert_expiring` |
| `diagnostic_run.status` | `running`, `passed`, `failed` |

- Ý nghĩa trạng thái job, trạng thái triage: [business-flow.md](../architecture/business-flow.md).
- `alert` loại `finding_new` chỉ sinh với severity `critical`, `high`.
- `alert` loại `cert_expiring` sinh khi parser ghi `url.tls_not_after` còn dưới `cert_expiring_days` ngày, mỗi URL một lần cho mỗi giá trị `tls_not_after`.

### Ràng buộc duy nhất

| Bảng | Cột duy nhất | Dùng cho |
|---|---|---|
| `scope_rule` | `program_id`, `scope_type`, `rule_type`, `value` | Không khai báo trùng scope rule |
| `proxy` | `program_id`, `name` | Phân biệt proxy trong program |
| `engine_variable` | `engine_id`, `key` | Một biến một giá trị |
| `raw_output` | `job_id`, `filename` | Upload lại không tạo bản trùng |
| `domain` | `program_id`, `name` | Khóa tự nhiên khi parser upsert. Gồm cả dòng đã xóa mềm |
| `ip` | `program_id`, `address` | Khóa tự nhiên |
| `service` | `ip_id`, `port`, `transport` | Khóa tự nhiên |
| `url` | `program_id`, `url_hash` | Khóa tự nhiên |
| `screenshot` | `raw_output_id` | Parse lại không tạo bản trùng |
| `finding` | `program_id`, `dedup_key` | Chuỗi khử trùng lặp |
| `tag` | `key`, `value` | Danh mục tag dùng chung |
| `saved_filter` | `user_id`, `screen`, `name` | Tên bộ lọc không trùng trong một màn hình |
| `asset_tag` | `tag_id` và cột tài sản có giá trị | Index duy nhất từng phần cho mỗi loại tài sản |

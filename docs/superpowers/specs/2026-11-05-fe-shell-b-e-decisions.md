# Sổ quyết định: lớp vỏ frontend phần B đến E

> Ngày: 2026-11-05 · Trạng thái: 🔵 Chờ duyệt
> Liên quan: [frontend/CLAUDE.md](../../../frontend/CLAUDE.md), [spec phần A](2026-11-04-fe-shell-a-design.md)

Mỗi dòng ghi một chỗ mockup lệch tài liệu và quy tắc M1 đến M7 đã áp. Người dùng duyệt sổ sau khi xong đợt.

## Câu hỏi đã chốt ngày 2026-11-05

| # | Quyết định | Tài liệu đã sửa |
|---|---|---|
| Q1 | Thêm tham số lọc: `program_id` cho mọi danh sách thuộc program, `status` cho `/programs`, `severity` cho `/findings`, `dns_status`, `in_scope` cho `/domains`, `domain_id` cho `/asset-events`, `/screenshots`, `/findings`, `target` cho `/jobs`, `level`, `service`, `logged_at_from`, `logged_at_to` cho `/logs`. Không thêm `q`: nợ 39 | openapi.yaml, api/architecture.md, tech-debt.md |
| Q2 | Định nghĩa trường tính của `/programs`, `/domains`, `/asset-events` và response của `/dashboard/summary`, `/dispatcher/status`, `/system/health` | api/architecture.md, schema.md, openapi.yaml |
| Q3 | Tạo job trên S03, S04, S05. Nhiều tài sản chỉ khi cùng một program | business-flow.md |
| Q4 | Admin gọi `GET /users`, chỉ nhận `id`, `username`, `role`. Backend chưa sửa: nợ 36 | authorization.md, openapi.yaml, tech-debt.md |
| Q5 | Runner ghi cả URL chụp lỗi vào JSONL, parser tạo screenshot có `is_failed` | external-services.md |
| Q6 | `GET /screenshots` nhận `sort=perception_hash`. Bỏ badge đếm số ảnh trong nhóm | openapi.yaml |
| Q7 | S17 chỉ có phần kết nối, không có biến engine | tech-debt.md, nợ 8 |

## Áp chung cho mọi màn hình

| Phần tử | Quy tắc | Cách làm |
|---|---|---|
| Phân trang số trang, First, Last | M1 | Nút **Previous**, **Next** theo `next_cursor`. "Showing N of `total`", thêm `~` khi `total_is_estimate` |
| Chữ BBRF, sync BBRF, CouchDB | M1 | Bỏ. "synced Xm ago" thay bằng `updated_at` |
| Ô tìm theo chuỗi | M3 | Bỏ: nợ 39 |
| Số phụ không có nguồn: `+N today`, `%`, SLA, coverage, throughput, latency | M3 | Bỏ |
| Nhãn "capture", "telemetry", "artifact", "staging", "processing", "Informational" | M2 | "screenshot", "asset event", "raw output", "queue", `running`, "Info" |
| Ngày giờ | M2 | `dd/mm/yyyy` 24 giờ, `Asia/Ho_Chi_Minh` |
| Trạng thái rỗng, lỗi, đang tải, `403`, `404` | M6 | Thêm. `404` dùng chung câu với "không tồn tại" |
| Nút thao tác ghi | M6 | Ẩn theo vai trò trong authorization.md, chỉ để tiện dùng |
| Dữ liệu từ mục tiêu: title, header, URL, evidence | M6 | Hiện dạng chữ. `href` chỉ nhận http, https |
| Làm mới realtime | M7 | Làm mới query theo sự kiện WebSocket, gom sự kiện liên tiếp |
| Nút tạo job (Run Scan) | M2, M6 | Một tool module mỗi job, lấy từ `GET /tool-modules`. Nhóm `exploit` ghi "Requires approval". Lỗi `target_out_of_scope` hiện theo trường. ❌ Frontend không kiểm tra scope |

## Phần B: S08, S09, S10, S11

| Màn hình | Phần tử | Quy tắc | Cách làm |
|---|---|---|---|
| S08 | **New Program** | M6 | Ẩn với User. Form `name`, `platform`, `platform_url`, `bounty_type`, `description` |
| S08 | KPI Programs, Domains, Findings | M7 | `total` của `GET /programs`, `/domains`, `/findings` |
| S08 | Pill All, Active, Inactive | M2 | Active, Paused, lọc bằng `status` |
| S08 | Checkbox Show empty scope, sort theo số tính, Recently synced | M3, M1 | Bỏ. Sort `name`, `-created_at` |
| S08 | "18 Wildcards · 4 Out-of-scope", DOM, URL, IPS, SRV, FINDINGS | M2 | "In-Scope", "Out-of-Scope", số từ trường tính của program |
| S08 | "Last scanned", "hackerone/uber" | M3, M2 | Bỏ. Hiện `platform`, link `platform_url` |
| S09 | HackerOne ID, Maintained by, Scope coverage | M3 | Bỏ |
| S09 | Ô scope rule | M2, M6 | Select `rule_type` 4 dạng. Ô Reason bắt buộc với Out-of-Scope |
| S09 | Badge VERIFIED, MANUAL, source | M3 | Bỏ |
| S09 | Chú thích tự đưa vào hàng đợi, runner chặn scope | M1 nợ 6 | "New assets do not create jobs. Jobs are created manually or by schedule." và "Jobs on out-of-scope targets are rejected at creation. The dispatcher re-checks scope and cancels jobs that no longer match." |
| S09 | Tab "Scopes & Targets" | M2 | "Scope" |
| S09 | Khối Seed Targets, subfinder, amass, gowitness daemon | M2 | "Schedules" từ `GET /programs/{id}/schedules`. Sửa chỉ Superadmin, Admin |
| S09 | **Trigger** | M3 | Bỏ |
| S09 | Lịch sử job: Target Scope, Scan Type, Triggered By | M2, M3 | Target, Tool module, Status 7 giá trị. `created_by` `NULL` hiện "Schedule", trùng tài khoản hiện "You", còn lại uuid rút gọn |
| S09 | Thiếu sửa, tạm dừng, tiếp tục, lưu trữ, xóa cứng program | M6 | Thêm theo vai trò, lưu trữ có hộp xác nhận |
| S09 | Thiếu gán User, proxy | M6 | Thêm tab Users dùng `GET /users` rút gọn, tab Proxies. Proxy luôn che |
| S10 | Generate Jobs, Dispatch All, Dispatch Now, Cleanup, CPU LOAD, Retry Failed hàng loạt | M1 nợ 10, M3 | Bỏ |
| S10 | Pipeline 5 trạng thái | M2 | 7 thẻ trạng thái, số từ `GET /jobs?status=X` |
| S10 | Panel Dispatcher Engine | M2, M3 | Theo `GET /dispatcher/status`. Bỏ Redis, cap, throughput |
| S10 | Active Runner Nodes | M2 | "Workers": name, tool module, heartbeat gần nhất. Ẩn với User |
| S10 | Queue Distribution | M2 | Theo `queued_by_tool_module`, `queued_by_program` |
| S10 | Select Status, Scan type | M2, M3 | Status 7 giá trị, thêm select program. Bỏ Scan type |
| S10 | Cột Target domain, Queued at, Worker | M2 | Target, Tool module, Created, Duration từ `started_at` và `finished_at` |
| S10 | Stop, Cancel | M2 | Một nút **Cancel** |
| S10 | Retry chỉ ở `failed` | M6 | Thêm cho `cancelled` |
| S10 | View Artifact, View Error, Logs | M2 | **Raw outputs**, `status_reason`, **Logs** |
| S10 | Thiếu Approve, Reject | M6 | Thêm cho Superadmin, Admin. `403 self_approval_forbidden` hiện câu riêng |
| S11 | Sync BBRF, Last Sync | M1 | Bỏ, dùng `updated_at` |
| S11 | Nút active/inactive | M2 | Pause, Resume |
| S11 | Mapped Targets | M2 | "Domains" |
| S11 | Thao tác hàng loạt, checkbox, PROD, **+ Target**, Latency | M3 | Bỏ |
| S11 | Nút delete | M6 | Chỉ Superadmin. Thêm **Archive** cho Superadmin, Admin |
| S11 | Chú thích feed Osmedeus, Vigolium | M1 nợ 6 | Bỏ |

## Phần C: S03, S04, S05

| Màn hình | Phần tử | Quy tắc | Cách làm |
|---|---|---|---|
| S03 | Badge "Active Scope" | M2 | Bỏ |
| S03, S04 | Segmented All, Resolved, Unresolved | M2 | 4 giá trị `dns_status` |
| S03, S04, S05 | Last scan, Discovered | M2 | "Last seen" `last_seen_at`, "First seen" `first_seen_at` |
| S04 | Cột FINDINGS C, H, M, L, I | M2 | Từ `finding_counts`, có `aria-label` |
| S04, S05 | Delete, Tag Program, Filter Presets, Export Selected | M3 | Bỏ. Giữ **Export CSV** ở tab Domains |
| S04 | Tile phụ "+342 today", "With findings" | M3 | Bỏ |
| S04 | **Add Scope** | M2 | Link tới S11, ẩn với User |
| S03 | Panel Filters | M2 | Chỉ select program, `dns_status`, `in_scope` |
| S03 | Tab IPs, URLs, Services | M7 | Giữ tab, cột theo bảng `ip`, `url`, `service` |
| S05 | Vulnerabilities | M2 | "Findings" |
| S05 | ID `#DOM-8842` | M2 | uuid kèm nút copy |
| S05 | Discovery Source subfinder | M2 | Tool module của job trong `asset_event` loại `discovered` |
| S05 | Recent Telemetry, Finding Reported, Capture Rendered | M2 | "Asset events": chỉ `discovered`, `changed`, kèm `diff` |
| S05 | Độ phân giải ảnh, Previous 3 / 64 Next | M3 | Bỏ |
| S05 | Modal chọn nhiều công cụ, Priority, Estimated | M2, M3 | Chọn một tool module. Bỏ Priority, Estimated |
| S05 | "Execute Autonomous Scan", "Dispatch Job" | M5 | "Run Scan", "Create job" |
| S03 | Nút **Filters** | M7 | Giữ, bật tắt hàng lọc |
| S03 | Số đếm trên cả 4 tab | M7 | Chỉ tab đang mở hiện `total`. Tab khác không gửi request |
| S03 | Sync Realtime | M3 | Bỏ. Làm mới theo WebSocket khi có |
| S03 | Tab dạng link | M6 | `tablist` và `tab`, phím mũi tên chuyển tab |
| S03 | `dns_status`, `in_scope` trên tab IPs, URLs, Services | M3 | Chỉ hiện ở tab Domains. `/ips`, `/urls`, `/services` chỉ nhận `program_id` |
| S03 | Cột ASN / ORG ở tab Domains | M3 | Bỏ: hàng domain không có ASN. ASN hiện ở tab IPs |
| S03 | Ô chọn ở tab Services | M3 | Bỏ: service không có chuỗi mục tiêu riêng để tạo job |
| S03 | Copy Names | M7 | Giữ, chép vào clipboard |
| S03, S04 | Customize columns, Column Display, Density Settings | M3 | Bỏ |
| S03, S04 | Select Density "25 / page" | M7 | "Rows per page" theo tham số `limit` |
| S04 | Nút dropdown Program | M7 | Select program có nhãn |
| S04 | Checkbox Findings only | M3 | Bỏ: không có tham số lọc. Thay bằng select `in_scope` theo Q1 |
| S04 | Tile "New in 24h", số `%` | M3 | Bỏ. Unresolved là tổng `total` của `nxdomain` và `timeout` |
| S04 | Refresh Telemetry | M2 | "Refresh", gọi lại `GET /domains` |
| S04 | **Add Scope** trỏ tới S11 | M7 | Tạm dùng route `/manage`. Phần B chốt route S11 thì sửa |
| S05 | Tab URLs, Services | M3 | Bỏ: `/urls`, `/services` không lọc theo domain |
| S05 | Dạng `tags` của `GET /domains/{domain_id}` | M4 | openapi chưa định nghĩa. Frontend dùng `id` của `asset_tag`, `tag_id`, `key`, `value`. Backend cần chốt |
| S05 | Thêm tag | M6 | Chỉ chọn tag có sẵn từ `GET /tags`. Chưa dựng tạo tag mới bằng `POST /tags` |
| S05 | Chip "bbrf: synced" | M1 | Bỏ |
| S05 | Delete, Auto-reconciled, Confidence | M3 | Bỏ |
| S05 | Ô "Low / Info" | M2 | 5 mức severity riêng |
| S05 | Discovery Source | M2 | `asset_event` cũ nhất của domain (`sort=created_at&limit=1`), rồi `GET /jobs/{job_id}` lấy tool module |
| S05 | Link Program, Inspect, View in Findings | M7 | Tạm dùng `/programs/{id}`, `/screenshots/{id}`, `/findings?domain_id=`. Phần B, D, E chốt route thì sửa |
| S05 | Asset events không phân trang | M6 | 10 dòng mỗi trang, nút **Previous**, **Next** |

## Phần D: S02, S06, S07

| Màn hình | Phần tử | Quy tắc | Cách làm |
|---|---|---|---|
| S02 | "Auto-refreshes every 30s", SYNCED, 24h/7d/30d | M5, M3 | Bỏ. Làm mới theo WebSocket |
| S02 | Biểu đồ 14 ngày, Top Programs, Top Open Ports, Worker instances | M3 | Bỏ |
| S02 | Staging Snapshot | M2 | "Jobs" 7 trạng thái từ `jobs_by_status` |
| S02 | Findings by Severity | M2 | 5 mức từ `findings_by_severity` |
| S02 | Feed Recent Activity | M2 | Chỉ sự kiện tài sản từ `GET /asset-events` |
| S02 | `stream::recon.events` | M5 | Bỏ |
| S06 | Breadcrumb gowitness_daemon.sock, Load Scan, Force Dispatch, thẻ QUEUED | M5, M3 | Bỏ |
| S06 | Lớp phủ nội dung, chip công nghệ trên thẻ | M3 | Bỏ. Công nghệ hiện ở S07 |
| S06 | Bộ lọc Technologies, chip mã HTTP | M3 | Bỏ. Giữ select program |
| S06 | Group by Similar | M2 | `sort=perception_hash`, không đếm số ảnh trong nhóm |
| S06 | Thẻ FAILED | M6 | Hiện `error_message` khi `is_failed` |
| S07 | Capture Detail, Delete Capture, `#CAP-98421` | M2, M3 | "Screenshot Detail", bỏ Delete, hiện uuid |
| S07 | Prev, Next | M7 | Đi theo danh sách S06 trong cache. Mở thẳng thì ẩn |
| S07 | Khung HTML giả lập, viewport, Requests, Logs, Cookies, PID, TLS, HTML source, HAR | M3 | Bỏ. Ảnh là `<img>` từ `/image` |
| S07 | Security Headers Check | M3 | Bỏ chấm điểm, giữ bảng header |
| S07 | Detected Technologies | M2 | Từ `GET /urls/{url_id}`, bỏ "Wappalyzer" |
| S02 | Nút Refresh | M7 | Giữ, gọi lại `GET /dashboard/summary` và `GET /asset-events` |
| S02 | Nút Pause Stream, "Auto-scroll: ON" | M3 | Bỏ. Frontend chưa có kênh WebSocket, feed làm mới qua query |
| S02 | Thẻ Total Jobs | M3 | Bỏ: `jobs_by_status` không có tổng |
| S02 | Link View all | M7 | Chỉ hiện khi màn hình đích đã có `href` trong `nav-items.ts` |
| S02 | Feed Recent Activity | M7 | 8 sự kiện mới nhất, `sort=-created_at`, không phân trang như mockup |
| S06 | Clear Filters | M7 | Giữ, đặt lại program và Group by Similar |
| S06 | Toggle Show Failed | M3 | Bỏ: `GET /screenshots` không có tham số lọc `is_failed` |
| S06 | Prev, Next trên thanh lọc | M7 | Bỏ. Một bộ phân trang ở chân trang |
| S06 | Retry pending, Force Dispatch trên thẻ lỗi | M3 | Bỏ |
| S06 | Density 12, 24, 48, 96 | M7 | Giữ, gửi thành `limit`, mặc định 24 |
| S06 | "2h ago" | M2 | `captured_at` dạng `dd/mm/yyyy HH:mm` |
| S07 | Download PNG, PNG | M7 | Link `download` tới `GET /screenshots/{id}/image` |
| S07 | Tiêu đề h1 "Summary" | M2 | "Screenshot Detail" |
| S07 | Ô Requests, Console, DOM, Layers, Cookies, "Probed by worker", PID, "2.48 seconds" | M3 | Bỏ. Hiện `final_url`, `status_code`, `content_length`, `captured_at` |
| S07 | Dạng công nghệ trong `GET /urls/{url_id}` | Chưa có tài liệu | Giả định mảng `technologies` gồm `technology_id`, `name`, `category`, `version`, ghép `url_technology` với `technology`. Cần ghi vào bảng trường tính của api/architecture.md |

## Phần E: S15, S16, S17, S18, S20

| Màn hình | Phần tử | Quy tắc | Cách làm |
|---|---|---|---|
| S15 | BBRF CouchDB, gowitness DB | M1 nợ 1, 2 | Bỏ |
| S15 | Tab Tools: phiên bản, đường dẫn, Update | M1 nợ 9 | Chỉ liệt kê worker và tool module từ `GET /workers` |
| S15 | Phiên bản PostgreSQL, Redis ghi cứng | M2 | Bỏ |
| S15 | Ingest Proxy Vigolium | M1 nợ 8 | Bỏ |
| S15 | Run Diagnostics, Export Report, Recheck, Dispatch Now, fleet load | M3 | Bỏ. Nút Refresh gọi lại `GET /system/health` |
| S15 | Thẻ thành phần | M2 | Theo `components[]` của `GET /system/health` |
| S15 | Thiếu ngưỡng vận hành | M6 | Bảng `system_setting`, sửa bằng `PATCH`, chỉ Superadmin |
| S15 | Thiếu log ứng dụng, xóa log | M6 | `GET /logs` lọc `level`, `service`, thời gian. Xóa log trước ngày chọn, chỉ Superadmin, có hộp xác nhận |
| S16 | Scan Tactics, Environments, Database & Redis, Cloud & LLM, Schedules, Worker Pool, Daemon | M1 nợ 8 | Bỏ |
| S16 | Tab Workflows | M3 | Bỏ, link sang S18 |
| S16, S17 | Bearer Token, Master Secret, Reveal, Rotate, copy | M5, M3 | Nhãn "API key". Ô chỉ để ghi, để trống là giữ khóa cũ |
| S16 | Phiên bản engine ghi cứng | M4 | Theo response `POST /engines/{id}/test` |
| S16 | Cột Source của biến | M3 | Bỏ |
| S16 | Global Variables & Tokens | M2 | "Engine variables" |
| S17 | Agentic Olium, Ingestion, MITM, Native Modules, Hardening, Projects | M1 nợ 8 | Bỏ |
| S17 | Scope Defaults, Validate Config, port, daemon | M3 | Bỏ. Giữ `base_url` |
| S18 | New Module, capability, engine chính và thay thế | M1 nợ 5 | Bỏ. Mỗi dòng một tool module từ `GET /tool-modules` |
| S18 | Target Output BBRF, gowitness DB | M1 nợ 1, 2 | Domain, IP, URL, service, finding, screenshot |
| S18 | Phase | M2 | Nhóm Recon, Scan, Exploit |
| S18 | Lọc, thẻ ENGINES, JOBS 24H, ENABLED %, CATALOG, listener | M3 | Bỏ |
| S18 | Toggle, Configure | M6 | Chỉ Superadmin. Form theo cột tool module |
| S18 | Ô Threads, Rate tự do | M5 | Bỏ. Form tham số dựng từ schema tool module |
| S18 | Drawer Run | M6 | Select program, ô mục tiêu |
| S20 | Trạng thái New, Triaged, Reported, Duplicate, FP | M2 | 6 trạng thái `triage_status` |
| S20 | Mark Triaged | M2 | "Mark confirmed", `POST /findings/bulk-triage` tối đa 500 ID |
| S20 | Push to Jira, Sync Nuclei, badge Nuclei engine | M1 nợ 7, M2 | Bỏ |
| S20 | Select domain, Export đã chọn, Remediation, Copy as Markdown, Web Tier | M3 | Bỏ. Giữ Export theo bộ lọc |
| S20 | Select program, pill severity | M2 | `program_id`, `severity` |
| S20 | Drawer thiếu link output thô | M6 | Thêm link theo `raw_output_id` |
| S20 | Chọn Duplicate | M6 | Bắt buộc chọn finding gốc `duplicate_of_id` |
| S15 | Thẻ số Tools: installed, outdated | M1 nợ 9 | Bỏ. Giữ 3 thẻ Services, Workers, Queue length từ `GET /system/health` |
| S15 | Badge TICK 30s, dải Last diagnostic, View Diagnostics Log, "auto-refreshes every 30s" | M3, M5 | Bỏ |
| S15 | Ngày chọn khi xóa log | M6 | Chọn muộn nhất là hôm qua theo UTC, form tự báo "Pick a day before today.", bấm **Delete logs** hai lần để xác nhận |
| S16 | Khối Cluster Resource Overhead | M3 | Bỏ |
| S16, S17 | Tìm engine | M7 | Lấy dòng có `name` là `osmedeus`, `vigolium` trong `GET /engines`. Không có dòng: báo engine không tồn tại |
| S16 | Giá trị biến engine | M6 | Luôn hiện mặt nạ cố định. Nút **Replace**, **Delete**, ô giá trị chỉ để ghi |
| S18 | Cột Output Contract | M3 | Bỏ: `GET /tool-modules` không trả loại tài sản tool module tạo ra |
| S18 | Sửa `default_params` | M3 | Bỏ: schema tham số nằm trong mã, API không trả. Form Configure chỉ sửa `max_concurrency`, `rate_limit_per_minute`, `timeout_minutes` |
| S18 | Cột Concurrency, Rate limit, Timeout | M6 | Thêm theo cột `tool_module` |
| S18 | Drawer Dispatch Capability | M7 | Bấm **Run**: hộp chọn program, rồi RunScanDialog dùng chung với một tool module và ô mục tiêu tự nhập |
| S20 | Cột Matcher / Match, select số dòng mỗi trang, checkbox Hide False Positives | M3, M1, M2 | Bỏ. Lọc `triage_status` bằng select Status |
| S20 | Body `POST /findings/bulk-triage`, response `POST /engines/{id}/test` | M4 | openapi.yaml chưa ghi trường. Frontend gửi `{ids, triage_status}`, đọc `version` nếu có. Cần chốt khi backend làm |

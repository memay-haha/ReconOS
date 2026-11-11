# Sổ quyết định: dựng màn hình khớp mockup Stitch

> Phiên bản: 1.0 · Ngày: 2026-11-11 · Trạng thái: 🔵 Chờ duyệt
> Liên quan: [frontend/CLAUDE.md](../../../frontend/CLAUDE.md), [sổ quyết định 2026-11-05](2026-11-05-fe-shell-b-e-decisions.md), [tech-debt.md](../../tech-debt.md), [ADR xóa mềm](../../decisions/adr-soft-delete.md)

Người dùng duyệt 2026-11-12: chọn khuyến nghị cho mọi mục.

Quy tắc mới ngày 2026-11-11: mọi màn hình khớp mockup trong `docs/design/screens/`. Chỉ bỏ phần trong danh sách không làm (2FA/MFA, SSO, AD sync, mTLS, API token, vai trò ngoài 3 vai trò, BBRF, phân trang số, gowitness DB, New Module, Push to Jira, tự sinh job). API thiếu thì mở rộng API. Sổ này gom 5 báo cáo audit, chỉ ghi chỗ cần người dùng chọn. Mỗi mục có phương án khuyến nghị.

Ký hiệu: SA Superadmin, A Admin, U User. "Đổi schema" là phải thêm cột hoặc bảng.

## Quyết định lớn

### D1. Dữ liệu gowitness mở rộng trên S07

Vấn đề: S07 vẽ TLS, Network Log, Console Log, Cookies, HTML source, HAR, IP máy chủ, độ phân giải, thời gian chụp. Schema `screenshot` không có các cột này. Phải đổi schema, parser và contract worker (G8). Cookie của mục tiêu có thể là token phiên (G7).

- A: Lưu đủ dữ liệu vào `screenshot` (cột jsonb `tls`, `network_log`, `console_log`, `cookies`, cột `width`, `height`, `remote_ip`, `duration_ms`), HTML lưu thành output thô. Giá trị cookie che, chỉ hiện tên và cờ. Hệ quả: đổi schema, parser, contract; dựng đủ 5 tab. **(khuyến nghị)**
- B: Như A nhưng hiện nguyên giá trị cookie. Hệ quả: token phiên của mục tiêu lộ trên giao diện, trái G7.
- C: Chỉ làm TLS, độ phân giải, HTML. Network, Console, Cookies, HAR ghi nợ kỹ thuật. Hệ quả: S07 lệch mockup 4 phần.

### D2. Cấu trúc `finding.detail` cho drawer S20

Vấn đề: drawer S20 có Matcher, Vulnerability Synopsis, Request/Response, Remediation. `finding.detail` chưa có cấu trúc trong tài liệu.

- A: Định nghĩa key bắt buộc của `detail` cho từng tool module (nuclei: `matcher`, `description`, `remediation`, `request`, `response`). Parser ghi key, API trả thành field riêng. Hệ quả: sửa schema.md, parser nuclei, openapi. **(khuyến nghị)**
- B: Chỉ hiện `evidence` cắt dòng đầu làm Matcher, bỏ 3 khối còn lại. Hệ quả: drawer thiếu 3 khối.

### D3. Tab cấu hình engine trên S16, S17 (nợ 8)

Vấn đề: S16 có Scan Tactics, Environments, Database & Redis, Cloud & LLM, Workflows, Schedules. S17 có Scan Engine & AI, Ingest Proxy, MITM, CA, bridge Burp/Caido, LLM, Native Modules, Hardening flags, Scope Defaults, Projects. Database & Redis trái G1. Scope Defaults và Ingest Proxy đi vòng kiểm tra scope (G5). Khóa LLM là thông tin xác thực (G7). Chưa kiểm Osmedeus v5.1.2, Vigolium có REST cho các cấu hình này không.

- A: Dựng mọi tab, lưu vào `engine.settings` jsonb, truyền vào `params` mỗi lần chạy. Hệ quả: nhiều cấu hình không có tác dụng thật nếu engine không nhận qua `params`. Vi phạm G1, G5.
- B: Dựng phần đọc được qua REST (danh sách workflow, native module, phiên bản, trạng thái), Scan Tactics và LLM (khóa lưu mã hóa, chỉ ghi) qua `engine.settings`. Bỏ Database & Redis, Scope Defaults, Ingest Proxy, MITM, CA, bridge, Hardening flags; ghi lý do vào nợ 8. Kiểm REST của từng engine trước khi dựng. **(khuyến nghị)**
- C: Giữ nợ 8, thêm cả hai tab vào danh sách không làm. Hệ quả: S16, S17 lệch mockup nhiều nhất.

### D4. Tab Tools và Run Diagnostics trên S15 (nợ 9)

Vấn đề: S15 hiện phiên bản công cụ, bản mới nhất upstream, đường dẫn, nút Update, Recheck, chẩn đoán. deployment.md: công cụ nằm trong image worker, cập nhật bằng build image. architecture.md cấm trả path, PID.

- A: Worker báo `tools[]` {name, version} trong heartbeat (đổi contract, cột `worker.tool_versions`). Dựng `GET /tools` với installed/missing. Run Diagnostics lưu bảng `diagnostic_run`. Bỏ Latest upstream, Outdated, Update, đường dẫn, hash integrity. **(khuyến nghị)**
- B: Như A, thêm nguồn upstream (GitHub releases) để có Outdated. Hệ quả: thêm tích hợp gọi ra ngoài, thêm rủi ro.
- C: Giữ nợ 9, chỉ dựng Run Diagnostics.

### D5. Xóa tài khoản, domain, screenshot, program hàng loạt

Vấn đề: mockup có Delete User (S12), Delete domain (S04, S05), Delete Capture (S07), Delete Selected program (S11), Cleanup job (S10). authorization.md không có dòng quyền xóa tài sản, screenshot, tài khoản. Nhiều bảng tham chiếu `user`, output thô phải giữ (G8).

- A: Xóa mềm bằng cột `deleted_at` (ẩn khỏi danh sách, tài khoản không đăng nhập được). Output thô giữ nguyên. Quyền: tài khoản SA, tài sản và screenshot SA/A, có audit log. **(khuyến nghị)**
- B: Xóa cứng khi không còn tham chiếu, ngược lại trả 409 và gợi ý khóa. Hệ quả: hầu hết domain có finding sẽ không xóa được.
- C: Không làm nút xóa. Hệ quả: lệch mockup ở 5 màn hình.

### D6. Trạng thái hệ thống trên trang đăng nhập S01

Vấn đề: S01 chưa đăng nhập nhưng có pill "DISPATCHER ONLINE", chip phiên bản, chip "NODE 01-PROD". `GET /health` hiện trả 204, không lộ trạng thái nội bộ.

- A: `GET /health` trả JSON `{dispatcher, version, node}` cho người chưa đăng nhập. Hệ quả: lộ trạng thái nội bộ, sửa threat-model.md.
- B: Pill dựa trên `GET /health` hiện có (204 là "online"), phiên bản và tên node gắn lúc build frontend (biến môi trường mới `RECONOS_NODE_NAME`). Không lộ thêm dữ liệu. **(khuyến nghị)**
- C: Bỏ pill và chip node trên S01.

### D7. Engine thay thế và ghi đè engine theo job (S18, nợ 5)

Vấn đề: S18 có cột Alternative, radio Target Engine Override, ô Threads và Rate trong drawer. modules.md: một tool module là một công cụ hoặc một engine.

- A: Giữ quy tắc một tool module một engine. Bỏ cột Alternative và radio Override. Threads, Rate hiện khi `param_schema` của tool module có key đó. **(khuyến nghị)**
- B: Thêm engine thay thế cho tool module (ADR mới, cột mới). Hệ quả: đổi modules.md, runner, contract.

### D8. Điều khiển dispatcher thủ công trên S10 (nợ 10)

Vấn đề: S10 có Dispatch Now, Dispatch All, Cleanup, cột CPU load. S05 có chọn Priority. system.md: dispatcher tự giao theo priority và giới hạn; `job.priority` có trong schema nhưng API không nhận.

- A: `POST /jobs` nhận `priority` (low, normal, high). Dispatch Now nâng priority lên high. Dispatch All đánh thức dispatcher. Cleanup hủy job `queued` của program đã pause hoặc archive. CPU load do worker báo trong heartbeat (đổi contract). Quyền SA/A. **(khuyến nghị)**
- B: Như A nhưng bỏ CPU load và Cleanup.
- C: Giữ nợ 10, không làm.

## Định nghĩa chỉ số

| # | Màn hình | Chỉ số trên mockup | Định nghĩa khuyến nghị | Phương án khác |
|---|---|---|---|---|
| M1 | S04, S08, S09, S11, S20 | "today", "this week", "this month" | 24 giờ, 7 ngày, 30 ngày gần nhất, dùng `window` có sẵn (24h, 7d, 30d) | Theo lịch Asia/Ho_Chi_Minh: từ 00:00, thứ Hai, ngày 1 |
| M2 | Sidebar | Badge Domains "64" | Domain mới trong 24 giờ (`assets_new.domain`) | Domain có finding mở |
| M3 | S02 | Services "−74 closed" | Đổi schema: `service.closed_at`, parser đặt khi lần quét cổng sau trên IP đó không thấy cổng. Đếm trong `window` | Tính lúc đọc: `last_seen_at` cũ hơn job quét cổng `completed` gần nhất trên IP |
| M4 | S03, S04 | Unresolved | `dns_status` là `nxdomain` hoặc `timeout` | Mọi giá trị khác `resolved`, gồm `unknown` |
| M5 | S04 | TOTAL "100% active" | Tỷ lệ domain `in_scope=true` | Tỷ lệ domain thuộc program `active` |
| M6 | S04 | RESOLVED "+342 today" | Domain `resolved` có `first_seen_at` trong khung M1 | `asset_event` `changed` sang `resolved` trong khung M1 |
| M7 | S04 | WITH FINDINGS, "29 critical" | Domain có ít nhất 1 finding mở (`triage_status` ngoài `false_positive`, `duplicate`, `resolved`). Critical: số domain có finding critical mở | Critical: số finding critical mở |
| M8 | S08, S20 | Ô tổng finding, đếm theo severity | S08: finding mở, khớp `finding_counts`. S20: theo bộ lọc đang áp, mặc định mọi trạng thái | Cả hai đếm mọi trạng thái |
| M9 | S04 | NEW IN 24H "+8.1% vs avg" | So với trung bình ngày của 7 ngày trước | 14 ngày trước, khớp `new_assets_daily` |
| M10 | S05, S09 | "Both responding", "2 Active IPs", "880 resolved" | IP có ít nhất 1 `service` | IP có ít nhất 1 dòng `domain_ip` |
| M11 | S05 | "9 unique endpoints · 2 API" | Unique: số `url.path` khác nhau. API: `content_type` JSON hoặc XML | API: path chứa `/api/` hoặc đoạn `/v<số>/` |
| M12 | S05 | "Auto-reconciled · Confidence 99.8%" | Không có khái niệm trong tài liệu (nợ 7). Thêm vào danh sách không làm | Tỷ lệ lần quét DNS thấy `resolved`, cần lưu lịch sử DNS theo job (đổi schema) |
| M13 | S05 | "Estimated ~3 mins" | Trung vị `finished_at − started_at` của 20 job `completed` gần nhất cùng tool module | `timeout_minutes` làm cận trên |
| M14 | S06 | Chip HTTP 200, 403, 500 | Nhóm theo lớp 2xx, 3xx, 4xx, 5xx, hiện lớp có số lớn hơn 0 | Mã cụ thể, 3 mã nhiều nhất |
| M15 | S06 | "Group #04 (3)", "Unique" | Cùng `perception_hash`, đánh số trong bộ lọc hiện tại theo `captured_at` sớm nhất của nhóm | Khoảng cách Hamming ≤ N |
| M16 | S06 | Nhãn loại trên card ("CI Pipeline") và chữ phủ ảnh | `technology.category` đầu tiên của URL, không có chữ phủ | Tag tài sản của URL |
| M17 | S06 | Chip "Traceback" | Hiện khi `status_code ≥ 500` | Bỏ |
| M18 | S07 | "completed in 2.48 seconds" | `screenshot.duration_ms` từ output gowitness (phụ thuộc D1) | `job.finished_at − started_at` |
| M19 | S07 | "Security Headers 5/5 Hardened" | Có mặt 5 header: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy. Backend tính | Thêm Referrer-Policy, kiểm cả giá trị |
| M20 | S07 | "Key HTTP Headers 6 of 19" | Danh sách cố định: server, content-type, HSTS, CSP, X-Frame-Options, set-cookie (chỉ tên), kèm "Show all" | 6 header đầu |
| M21 | S08 | "Remediation SLA · 18 near breach" | Finding `confirmed` hoặc `reported` có tuổi quá `finding_sla_days − 2` ngày (`system_setting` mới) | Bỏ dòng này |
| M22 | S08, S18 | "Last scanned 2h ago", "18m ago" | max(`job.finished_at`) của job `completed` | max của mọi job đã kết thúc |
| M23 | S10 | "1,600 cap" | `system_setting` mới `queue_capacity` | Tổng `max_concurrency` nhân hệ số |
| M24 | S10, S15, S16 | Fleet load, Worker utilisation, Concurrency, Queue saturation 4/32 | Job `running` ÷ tổng `max_concurrency` của tool module bật. S16 chỉ tính tool module của Osmedeus | Worker online có job `running` ÷ worker online |
| M25 | S10 | Job Latency "1m 42s" | Thời gian chờ trung bình `started_at − coalesce(approved_at, created_at)`, job bắt đầu trong 60 phút | Thời gian chạy trung bình `finished_at − started_at` |
| M26 | S10 | Redis Store "1.2 MB" | `used_memory` từ Redis INFO | Bỏ |
| M27 | S11 | Checkbox "Unmapped only" | Program có `domain_count = 0` | Giống bộ lọc No Scope |
| M28 | S11 | "2,109 active" trên mỗi rule | Số domain của program khớp rule | Chỉ domain `resolved` khớp rule |
| M29 | S11 | "Latency: 18ms" | Thời gian request danh sách đo ở trình duyệt | `latency_ms` của `api` trong `/system/health` (chỉ SA/A) |
| M30 | S11 | "Mapped Targets" | Domain của mọi program, như hiện tại | Chỉ program `active` |
| M31 | S12 | "Topology: 3 web" | Số tài khoản có ít nhất 1 phiên còn hiệu lực | Chia theo trình duyệt từ `user_agent` |
| M32 | S12 | Trạng thái "Idle (45m)" | Phiên còn hiệu lực, `last_seen_at` cũ hơn 15 phút (`system_setting` mới) | Bỏ trạng thái |
| M33 | S15 | Dòng chi tiết trên card thành phần | postgres: kết nối đang dùng/tối đa. redis: `used_memory`/`maxmemory`. Thành phần khác: trống | Bỏ |
| M34 | S15, S18 | "9 installed", "14/14 Binary Dependencies" | Tool module bật có trên ít nhất 1 worker online ÷ tổng tool module | Số tên công cụ khác nhau trong `worker.tool_modules` |
| M35 | S16 | "Daemon Uptime 18d" | Thời gian từ lần health check `ok` đầu tiên của chuỗi `ok` hiện tại | Lấy từ API thông tin máy chủ Osmedeus, nếu có |
| M36 | S18 | "88.8% ready" | Tool module bật, có worker online cài, engine (nếu có) `ok`, chia tổng | `enabled_count ÷ total` |
| M37 | S18 | ENGINES "4 bound" | Số dòng `engine` bật (theo glossary chỉ có Osmedeus, Vigolium) | Số giá trị `runs_on` khác nhau |
| M38 | S18 | JOBS (24H) "1,420 run", "↑14.2%" | Job tạo trong khung, so với khung liền trước | Job `completed` trong khung |
| M39 | S18 | "0 stalled" | Job `running` có `last_heartbeat_at` quá timeout heartbeat job | Job `queued` quá N phút |
| M40 | S20 | Dòng phụ trên 5 ô severity | Finding mới (`first_seen_at`) trong 24 giờ theo severity | Thay đổi ròng 7 ngày: mới trừ `resolved` |
| M41 | S17 | "Top Active Modules" | 5 native module bật đầu tiên theo tên (phụ thuộc D3) | Module tạo nhiều finding nhất |

## Quyết định nhỏ khác

| # | Màn hình | Điểm cần chọn | Mặc định khuyến nghị | Phương án khác |
|---|---|---|---|---|
| N1 | Topbar | Phạm vi ô tìm ⌘K | `GET /search` trên program, domain, URL, finding, tool module, lọc theo program được gán | Chỉ điều hướng màn hình phía client |
| N2 | Mọi danh sách | Kiểu khớp `q` | Chuỗi con không phân biệt hoa thường; `*` là wildcard trên domain, IP; không regex | S20 nhận regex `~*` có giới hạn độ dài |
| N3 | Sidebar, S01, S10, S12, S18 | Nguồn chip phiên bản ("v2.4", "RBAC v3.1", "Daemon v2.4", "CATALOG_V2") | Một nguồn: phiên bản build ReconOS (theo D6) | Bỏ các chip trang trí |
| N4 | S01 | "All connections encrypted" | Chỉ hiện khi trang chạy HTTPS | Bỏ |
| N5 | S02 | Staging Snapshot 6 ô | Total + 7 trạng thái job theo glossary | 6 ô như mockup, bỏ `pending_approval`, `cancelled` |
| N6 | S02 | Dòng cảnh báo TLS sắp hết hạn | Đổi schema: `url.tls_not_after` từ httpx, `alert_type` mới `cert_expiring` | Ghi nợ kỹ thuật |
| N7 | S02, S03, S05 | Live WebSocket, "Sync Realtime" | Dựng client WebSocket trong đợt này (đóng nợ 40) | Giữ polling 30 giây |
| N8 | S03 | Badge "Active Scope" | Hiện khi đang lọc `in_scope=true` | Số program `active` |
| N9 | S03 | Select In-scope (app có, mockup không) | Giữ | Bỏ |
| N10 | S04 | Filter Presets | Đổi schema: bảng `saved_filter` theo tài khoản | Lưu localStorage |
| N11 | S04 | Tag Program hàng loạt | Gắn `asset_tag` cho domain chọn | Bỏ, coi là tag BBRF |
| N12 | S05 | Dòng thời gian hoạt động gộp | `GET /domains/{id}/activity` gộp asset_event, finding, screenshot | Chỉ asset_event kèm tên công cụ |
| N13 | S05, S20 | Phiên bản công cụ ("subfinder v2.6.4", "Nuclei v3.2.1") | `job.tool_version` do worker báo (phụ thuộc D4) | Bỏ |
| N14 | S05 | Run Scan nhiều tool module | `POST /jobs/bulk-create`, kiểm scope từng job | Gọi `POST /jobs` N lần |
| N15 | S06 | Nút Load Scan | Chọn job gowitness rồi lọc theo `job_id` | Tạo job gowitness mới |
| N16 | S06 | Card QUEUED | Hiện job gowitness `queued`, `dispatched`, `running` | Bỏ |
| N17 | S06 | Breadcrumb có đường dẫn socket | "Recon / Screenshots" | Thêm tên tool module |
| N18 | S06 | Force Dispatch trên card lỗi | Tạo job gowitness mới cho `final_url` | Retry cả job cũ |
| N19 | S07 | "Viewport #01", "Worker PID" | "Viewport" + độ phân giải; bỏ PID | Bỏ cả hai |
| N20 | S08 | Icon card program | Theo `bounty_type` | Một icon cố định |
| N21 | S08, S09 | Mã program trên nền tảng ("hackerone/uber", "ID #3142") | Đổi schema: `program.platform_handle` | Tách từ `platform_url` ở client |
| N22 | S08 | "Show empty scope" mặc định | Bật (hiện mọi program) | Tắt như mockup (ẩn program chưa có rule In-Scope) |
| N23 | S08 | Sort "Recently synced" | Thay bằng "Recently scanned" theo M22 | Bỏ |
| N24 | S09 | "Maintained by" | Tên người tạo program | Danh sách User được gán (U không xem được) |
| N25 | S09 | Nội dung tab Overview | Panel scope, schedule, lịch sử job như thân trang mockup | asset_event và tóm tắt finding |
| N26 | S09 | Icon `radar`, `add_link` | radar: Run Scan với mọi wildcard In-Scope. add_link: thêm nhiều rule một lần | Bỏ |
| N27 | S09 | Badge VERIFIED, MANUAL, "source: HackerOne policy" | Chỉ badge `rule_type` | Đổi schema: `scope_rule.source`, `is_verified` |
| N28 | S09 | Quyền nút Trigger schedule | SA/A, như quản lý schedule | Mọi người tạo được job của program |
| N29 | S09 | Dòng "gowitness daemon listening" | Hiện như schedule thường, bỏ trạng thái daemon | Bỏ |
| N30 | S09 | "Telemetry retention: 30 days" cho A/U | Cho A/U đọc `GET /system-settings/{key}` với key không nhạy cảm | Thêm vào `GET /dispatcher/status` |
| N31 | S09 | Link "Full Log View" | Tới S19 lọc theo program (cần sửa `/logs`) | Tới S10 lọc theo program |
| N32 | S10 | Tiêu đề "Staging Queue" | Giữ "Queue" theo glossary | Thêm "Staging" vào glossary |
| N33 | S11 | Chip "PROD" | Chip `bounty_type` | Bỏ |
| N34 | S11 | Nút "+ Target" | Mở Run Scan cho program | Thêm nhanh rule `domain` |
| N35 | S12 | Dòng email dưới tên | Không thêm email (dữ liệu cá nhân); hiện `username` | Đổi schema: `user.email` nullable |
| N36 | S12 | Nguồn Role Matrix | `GET /roles/permissions` sinh từ backend | Bản tĩnh ở frontend |
| N37 | S12 | Revoke Sessions trên dòng của chính mình | Giữ phiên hiện tại, thu hồi phiên khác | Từ chối |
| N38 | S12 | Nút Lock (app có, mockup không) | Giữ, làm icon thứ 4 | Bỏ |
| N39 | S12 | Ô thứ 4 (thay ô MFA) | Ô "Locked accounts" | Để 3 ô |
| N40 | S15 | Dòng Endpoint trên card | Chỉ card engine, lấy `engine.base_url`, hiện cho SA | Thêm `components[].endpoint`, nới quy tắc không trả IP nội bộ |
| N41 | S16 | Daemon Event Stream | `app_log` về lời gọi engine, thêm bộ lọc `event`, `engine` cho `/logs` | Chỉ kết quả test, health gần nhất |
| N42 | S16, S17 | Cột Source của biến, TTL khóa, Open Folder, View CA Path, "bind: loopback only" | Bỏ: không có nguồn dữ liệu hoặc lộ đường dẫn | Hiện giá trị cố định |
| N43 | S18 | Nút Refresh Index | Tải lại `GET /tool-modules` ở client | `POST /tool-modules/sync` (SA) |
| N44 | S18 | Bộ đếm trên card | `finding_count` khi output có finding, ngược lại `jobs_24h` | Luôn `jobs_24h` |
| N45 | S18 | Viền "CORE ASSESSMENT" | Bỏ | Đánh dấu tool module bọc engine |
| N46 | S18 | Lý do tắt trên card | `disabled_reason`: `off`, `engine_disabled`, `engine_down`, `not_installed` | Chỉ ghi "Disabled" |
| N47 | S18 | Cột Concurrency, Rate limit, Timeout (app có) | Giữ ở chế độ Table, thêm cột mockup | Bỏ |
| N48 | S18 | Chữ scope cạnh tên program trong drawer | Tên program + rule In-Scope đầu tiên | Chỉ tên program |
| N49 | S20 | Nút Sync Nuclei | Tạo job nuclei kiểm lại target của finding chọn, có kiểm scope | Bỏ |
| N50 | S20 | "Web Tier" trong drawer | Hiện loại tài sản | Bỏ |
| N51 | S20 | Trạng thái `duplicate` khi triage hàng loạt | Loại khỏi menu hàng loạt | Thêm `duplicate_of_id` vào body bulk-triage |

## Thay đổi API dự kiến

Đánh dấu `[D#]`, `[M#]`, `[N#]` khi phụ thuộc quyết định.

### Endpoint mới

| Endpoint | Việc | Quyền |
|---|---|---|
| `GET /search?q&limit` | Tìm toàn cục [N1] | SA/A/U |
| `GET /domains/summary` | `total, resolved, unresolved, with_findings, with_critical, new_24h` [M4-M9] | SA/A/U |
| `GET /findings/summary` | `total, by_severity, by_triage_status, by_program, new_24h_by_severity` [M8, M40] | SA/A/U |
| `GET /screenshots/summary` | `by_status_code` [M14] | SA/A/U |
| `GET /ips/export`, `/urls/export`, `/services/export` | Xuất CSV, JSONL theo bộ lọc | SA/A/U |
| `GET/POST /saved-filters`, `DELETE /saved-filters/{id}` | Filter Presets [N10] | Chủ sở hữu |
| `POST /asset-tags/bulk-create` | Gắn tag hàng loạt [N11] | SA/A/U |
| `DELETE /domains/{id}`, `POST /domains/bulk-delete` | [D5] | SA/A |
| `DELETE /screenshots/{id}` | [D5] | SA/A |
| `DELETE /users/{id}` | [D5] | SA |
| `POST /programs/bulk` | `pause, resume, archive, delete` (delete chỉ SA) [D5] | SA/A |
| `GET /domains/{id}/activity` | Dòng thời gian gộp [N12] | SA/A/U |
| `POST /jobs/bulk-create` | Nhiều tool module một lần [N14] | SA/A/U |
| `POST /jobs/bulk-retry` | Retry job lỗi hàng loạt | SA/A, U job của mình |
| `POST /jobs/{id}/prioritize`, `POST /dispatcher/wake`, `POST /jobs/cleanup` | [D8] | SA/A |
| `POST /schedules/{id}/run` | Trigger schedule [N28] | SA/A |
| `POST /programs/{id}/scope-rules/bulk` | Thêm nhiều rule [N26] | SA/A |
| `GET /screenshots/{id}/html`, `/har`, `/network` | [D1] | SA/A/U |
| `POST /users/{id}/revoke-sessions`, `POST /users/bulk-revoke-sessions` | [N37] | SA |
| `GET /users/export` | Xuất CSV tài khoản | SA |
| `GET /roles/permissions` | Role Matrix [N36] | SA |
| `POST /system/diagnostics`, `GET /system/diagnostics/{id}`, `GET /system/diagnostics/latest` | [D4] | SA/A |
| `GET /tools` | Danh sách công cụ [D4] | SA/A |
| `GET /tool-modules/stats?window` | `jobs, jobs_prev, stalled` [M38, M39] | SA/A/U |
| `GET /engines/{id}/workflows`, `GET /engines/{id}/workflows/{name}` | Danh sách workflow Osmedeus [D3] | SA |
| `GET/PATCH /engines/{id}/modules`, `POST /engines/{id}/validate`, `POST /engines/{id}/verify-model` | Vigolium [D3] | SA |

### Tham số truy vấn mới

| Endpoint | Tham số |
|---|---|
| `GET /programs` | `q`, `has_in_scope_rule`, `has_domain` [M27], sort `-domain_count`, `-finding_critical_count`, `-last_job_finished_at` [M22] |
| `GET /domains` | `q` [N2], `has_findings` [M7], `first_seen_at_from`, `program_status` [M30], `dns_status` lặp, sort `name`/`-name` |
| `GET /ips`, `/urls`, `/services` | `q` |
| `GET /domains/export` và export mới | `ids` (tối đa 500), `format` (`csv`, `jsonl`, `md`), bộ lọc như danh sách |
| `GET /screenshots` | `q`, `technology_id`, `status_code` [M14], `job_id` [N15] |
| `GET /jobs` | `q`, `tool_module_id` |
| `POST /jobs` body | `priority` [D8], khai báo `params` |
| `GET /users` | `q`, `role` |
| `GET /user-sessions` | `sort` |
| `GET /tool-modules` | `q`, `group`, `runs_on`, `is_enabled` |
| `GET /findings`, export, summary | `q`, `triage_status` lặp; export thêm `ids` |
| `GET /alerts` | `is_read` |
| `GET /logs` | `program_id`, `event`, `engine` [N41] |
| `GET /system/health` | `component` (kiểm lại một thành phần) |

### Field mới trong response

| Endpoint | Field |
|---|---|
| `GET /health` | `version` [D6, N3] |
| `GET /dispatcher/status` | `status`, `queued_total`, `queue_capacity` [M23], `workers_online`, `running_total`, `slot_capacity` [M24], `jobs_per_minute`, `avg_wait_seconds` [M25], `redis_used_bytes` [M26], `last_dispatched_at`, `last_dispatched_tool_module` |
| `GET /alerts` | `alert_type, message, program_id, finding_id, job_id, created_at, is_read` |
| `GET /dashboard/summary` | `assets_closed.service` [M3], `findings_near_sla` [M21] |
| `GET /programs`, `/programs/{id}` | `last_job_finished_at` [M22], `platform_handle` [N21], `scope_coverage`, `assets_new_today` [M1], `ip_resolved_count` [M10], `service_port_count`, `screenshot_count`, `created_by_username` [N24] |
| `GET /programs/{id}/scope-rules` | `matched_domain_count` [M28]; `source`, `is_verified` [N27] |
| `GET /domains` | `asn`, `asn_org` (IP đầu tiên), `has_findings` |
| `GET /domains/{id}` | `service_ports`, `ips[].record_type` |
| `GET /asset-events` | `job_id`, `tool_module_name`, `asn`, `asn_org` |
| `GET /findings` | `tool_module_name`, `asset {type, name, ip, port, service_name}`, `matcher` [D2]; chi tiết thêm `description`, `remediation`, `request`, `response` [D2], `in_scope`, `scope_rule` |
| `GET /jobs` | `created_by_username`, `worker_name`, `tool_version` [N13] |
| `GET /workers` | `running_job_count`, `running_tool_module_ids`, `is_online`, `cpu_percent` [D8] |
| `GET /screenshots` | `similar_count`, `similar_group` [M15], `technologies`, `retry_job_status`, `width`, `height` [D1] |
| `GET /screenshots/{id}` | `worker_name`, `device_scale`, `remote_ip`, `duration_ms`, `tls`, `console_log`, `cookies` (che giá trị), `html_size`, `html_sha256`, `security_headers` [D1, M19] |
| `GET /users`, `/users/{id}` | `role_counts`, `locked_count` [N39], `last_session_ip`, `last_seen_at` |
| `GET /user-sessions` | `username`, `display_name`, `account_count` [M31] |
| `GET /system/health` | `components[].version`, `detail` [M33], `message`, `tools_installed` [M34], `fleet_load` [M24] |
| `GET /engines` | `version`, `last_tested_at`, `last_test_ok`, `api_key_updated_at`, `slots_used`, `slots_total` [M24] |
| `GET /tool-modules` | Danh sách: `enabled_count`, `disabled_count`, `disabled_names`, `group_counts`, `engines_bound` [M37], `installed_count` [M34]. Mỗi dòng: `title`, `description`, `runs_on`, `tools`, `output_types`, `last_job_at` [M22], `jobs_24h`, `finding_count` [N44], `engine_status`, `disabled_reason` [N46], `param_schema` [D7], `estimated_seconds` [M13] |

## Tài liệu mâu thuẫn

| # | Mâu thuẫn | Đề xuất |
|---|---|---|
| C1 | `GET /logs` trong openapi.yaml có `x-roles: [superadmin, admin]`; authorization.md cho U xem log của job thuộc program được gán. `/logs` cũng thiếu `program_id` dù `app_log.program_id` có | Theo authorization.md: thêm `user` vào `x-roles`, thêm `program_id` |
| C2 | api/architecture.md cho tham số nhiều giá trị lặp lại; openapi.yaml khai báo `triage_status`, `dns_status` một giá trị | Khai báo dạng mảng lặp |
| C3 | openapi.yaml không khai báo tham số nào cho `GET /domains/export` (kể cả `format`) | Khai báo `format`, `ids`, bộ lọc danh sách |
| C4 | Glossary đặt Cảnh báo ở chuông header và có `/alerts`; sổ 2026-11-05 bỏ chuông vì "không có endpoint". openapi `GET /alerts` không khai báo field, tham số | Dựng chuông, khai báo field `alert` và `is_read` |
| C5 | system.md: dispatcher chọn job theo `priority`; `job.priority` có trong schema nhưng API không nhận, không định nghĩa mức | Định nghĩa trong D8 |
| C6 | authorization.md không có dòng quyền xóa tài sản, screenshot, tài khoản | Thêm theo D5 |
| C7 | Quy tắc mới lật quy tắc cũ: M3 trong frontend/CLAUDE.md, nợ 8, 9, 10, 32, 39, các dòng "bỏ" trong sổ 2026-11-05 | Sửa sau khi duyệt sổ này, theo doc-sync.md |

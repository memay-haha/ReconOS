# ReconOS: Thuật ngữ

> Phiên bản: 1.14 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt
> Mục 27: Phụ lục
> Liên quan: [overview.md](../architecture/overview.md), [documentation.md](../../.claude/rules/documentation.md)

- Tên trong mã: snake_case, số ít. Dùng chung cho bảng CSDL (cơ sở dữ liệu), biến, trường API (Application Programming Interface).
- Giá trị liệt kê viết thường, snake_case: `in_scope`, `critical`.
- Thuật ngữ chưa có trong file này thì chưa dùng trong tài liệu và mã.

## Program và scope

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| Program | Chương trình bug bounty hoặc VDP (Vulnerability Disclosure Program), có điều khoản và scope riêng. | Nền tảng bug bounty: HackerOne, Bugcrowd, Intigriti. | `program` |
| Scope | Tập scope rule của một program. Quyết định được tạo job cho mục tiêu nào (G5). | Danh sách tài sản đã phát hiện. | `scope` |
| Scope rule | Dòng trong scope, xác định một giá trị được quét hoặc bị loại trừ. Có loại In-Scope hoặc Out-of-Scope. Dạng giá trị: domain, wildcard, CIDR (Classless Inter-Domain Routing), URL. | Tài sản. | `scope_rule` |
| In-Scope | Loại scope rule cho phép tạo job trên mục tiêu khớp. | | `in_scope` |
| Out-of-Scope | Loại scope rule loại trừ mục tiêu khớp, kèm lý do. Không tạo job cho mục tiêu khớp Out-of-Scope, kể cả khi mục tiêu khớp In-Scope. | | `out_of_scope` |
| Wildcard | Giá trị scope rule dạng `*.example.com`. | Tài sản domain. | `wildcard` |
| Mục tiêu | Giá trị đầu vào của một job: domain, IP, URL, CIDR. | Tài sản: mục tiêu là đầu vào của job, tài sản là dữ liệu đã lưu. | `target` |
| Proxy | Địa chỉ proxy khai báo theo program, công cụ gửi lưu lượng của job qua proxy này. Lưu và che như thông tin xác thực. | Reverse proxy của ReconOS. | `proxy` |
| Lịch quét định kỳ | Cấu hình tạo job lặp lại cho một program: tool module, mục tiêu, tham số, chu kỳ. | Celery Beat: Beat chỉ đẩy task vào queue `schedule`. | `schedule` |
| Lưu trữ program | Đưa program sang trạng thái `archived`: ẩn khỏi danh sách, không tạo job, dữ liệu chỉ đọc. | Lưu output thô. Xóa cứng program. | `archived` |

## Tài sản

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| Tài sản | Thực thể phát hiện được, thuộc một program. Gồm 4 loại: domain, IP, URL, service. ReconOS là nguồn dữ liệu gốc duy nhất về tài sản (G3). | Finding, screenshot, output thô. | `asset`, loại: `asset_type` |
| Domain | Tên miền hoặc subdomain. | Wildcard trong scope rule. | `domain` |
| IP | Địa chỉ IPv4 hoặc IPv6. | CIDR trong scope rule. | `ip` |
| URL | Địa chỉ HTTP hoặc HTTPS đầy đủ, gồm scheme, host, cổng, đường dẫn. | Domain. | `url` |
| Service | Cổng mở trên một IP kèm giao thức, ví dụ `443/tcp https`. | Thành phần hệ thống của ReconOS: backend, worker. | `service` |
| Screenshot | Ảnh chụp trang web của một URL kèm metadata HTTP, do gowitness tạo. Không gọi là capture. | Tài sản. | `screenshot` |
| Tag | Nhãn tùy biến dạng key và value, ví dụ `env` = `prod`, gắn vào tài sản hoặc finding (G2). Danh mục tag dùng chung cho mọi program. | Trạng thái triage. | `tag` |
| Công nghệ | Framework, web server, CDN (Content Delivery Network), thư viện phát hiện trên một URL. | Công cụ. | `technology` |
| Sự kiện tài sản | Bản ghi một lần job phát hiện hoặc thay đổi tài sản, kèm output thô làm nguồn. | Nhật ký thao tác. | `asset_event` |

## Công cụ và thực thi

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| Công cụ | Phần mềm bảo mật bên ngoài chạy trên worker: nuclei, sqlmap, dalfox, gowitness. | Tool module, engine. | `tool` |
| Tool module | Phần mã tích hợp một công cụ vào ReconOS: tham số cho phép, tham số bị cấm, parser tương ứng. Thêm công cụ mới bằng cách thêm tool module (G4). | Capability: chỉ là nhãn trên màn hình S18. | `tool_module` |
| Nhóm công cụ | Phân loại tool module theo mức tác động: recon, quét, khai thác. Tool module nhóm khai thác phải được duyệt trước khi chạy (G5). Tool module của một workflow engine thuộc nhóm cao nhất trong các công cụ engine đó chạy. | Phase trên màn hình S18. | `tool_group`, giá trị: `recon`, `scan`, `exploit` |
| Engine | Nền tảng workflow bên ngoài điều phối nhiều công cụ: Osmedeus, Vigolium. | Nơi lưu dữ liệu: ReconOS không phụ thuộc CSDL của engine (G1). | `engine` |
| Biến engine | Giá trị truyền cho workflow của engine, ví dụ API key của nguồn dữ liệu bên ngoài. Lưu và che như thông tin xác thực. | Cấu hình kết nối tới engine. | `engine_variable` |
| Job | Một lần chạy một tool module trên một tập mục tiêu, đi qua hàng đợi. | Scan: "Run Scan" chỉ là nhãn trên UI, không phải thực thể riêng. | `job` |
| Độ ưu tiên job | Mức dispatcher dùng để chọn job `queued` giao trước: `low`, `normal`, `high`. Mặc định `normal`. Dispatch Now trên S10 nâng lên `high`. | Thứ tự tạo job. | `priority` |
| Phiên bản công cụ | Phiên bản của công cụ do worker báo: qua heartbeat cho mỗi công cụ đã cài, qua lời gọi kết thúc job cho công cụ đã chạy job đó. | Phiên bản ReconOS, phiên bản engine. | `tool_version` |
| Hàng đợi | Nơi job chờ dispatcher giao cho worker. Hiển thị ở màn hình S10. | Queue Celery `parse`, `schedule` của tiến trình nền. | `queue` |
| Dispatcher | Tiến trình riêng của ReconOS chọn job đến lượt trong hàng đợi và giao cho worker qua Celery. Giới hạn số job đồng thời và tốc độ theo công cụ, program, mục tiêu. Giữ job của tool module nhóm khai thác đến khi được duyệt. Tạm dừng, tiếp tục, ưu tiên job theo program. Trạng thái hiển thị ở màn hình S10, S15. | Worker: dispatcher không chạy công cụ. Engine: dispatcher không phải nền tảng workflow bên ngoài. | `dispatcher` |
| Contract | Thỏa thuận giao tiếp giữa hai thành phần: tên task hoặc endpoint, tham số, định dạng dữ liệu trả về. Contract worker ↔ backend gồm tên task Celery, tham số job, định dạng output thô gửi về. | Hợp đồng pháp lý với program. Giao thức truyền dữ liệu: HTTP, AMQP (Advanced Message Queuing Protocol). | `contract` |
| Worker | Tiến trình chạy công cụ cho job, gửi output thô về backend. | Nơi parse output thô (G8). | `worker` |
| Runner | Mã trong worker gọi một công cụ hoặc engine qua tiến trình con. Một file một công cụ. | Parser: runner không đọc hay chuyển đổi output. Tool module: runner chỉ là phần chạy trên worker. | `runner` |
| Tiến trình nền | Tiến trình Celery chạy mã backend, nhận task từ queue `parse` để parse output thô và từ queue `schedule` để tạo job quét định kỳ. | Worker: tiến trình nền không chạy công cụ. Dispatcher: tiến trình nền không giao job. | `background` |

## Output và finding

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| Output thô | Dữ liệu nguyên vẹn công cụ tạo ra trong một job: file, stdout. Backend lưu output thô trước khi parse. Người dùng tra cứu và tải về được kể cả khi chưa có parser (G8). | Kết quả đã parse. | `raw_output` |
| Parser | Thành phần ở backend đọc output thô, tạo hoặc cập nhật tài sản và finding. | Thành phần của worker. | `parser` |
| Finding | Lỗ hổng hoặc vấn đề bảo mật do công cụ phát hiện, gắn với tài sản và output thô làm bằng chứng (G6). | Tài sản. | `finding` |
| Severity | Mức nghiêm trọng của finding: `critical`, `high`, `medium`, `low`, `info`. | Trạng thái triage. | `severity` |
| Chuỗi khử trùng lặp | Tổ hợp trường dùng để xác định hai finding trùng nhau: `template-id`, `matched-at`. | ID của finding. | `dedup_key` |
| Triage | Quá trình xem xét finding và gán trạng thái triage. | Severity. | `triage` |
| Trạng thái triage | Kết quả xem xét một finding. | Trạng thái job. | `triage_status` |
| Báo cáo | Tài liệu mô tả finding để nộp cho program, tạo trong ReconOS. ReconOS không gửi báo cáo lên nền tảng bug bounty. | Báo cáo hệ thống, nhật ký thao tác. | `report` |

## Người dùng và vận hành

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| Tài khoản | Danh tính đăng nhập ReconOS, có đúng một vai trò. | Vai trò User. | `user` |
| Vai trò | Nhóm quyền gán cho tài khoản: Superadmin, Admin, User. Ma trận quyền: [authorization.md](../security/authorization.md). | | `role`, giá trị: `superadmin`, `admin`, `user` |
| Phiên đăng nhập | Phiên phía server tạo khi tài khoản đăng nhập, gắn với cookie. | Token worker. | `user_session` |
| Số phiên đang hoạt động | Số phiên đăng nhập của một tài khoản chưa quá hạn tuyệt đối (`expires_at`) và chưa quá thời gian không hoạt động (`session_idle_timeout_minutes`). Thu hồi phiên xóa dòng `user_session`, nên phiên đã thu hồi không có trong số này. Giá trị tính từ `user_session`, không lưu thành cột. | Số dòng `user_session`, số phiên đã tạo. | `active_user_session_count` |
| Token worker | Token riêng của một worker để gọi endpoint trong contract worker ↔ backend. | Phiên đăng nhập. | `worker_token` |
| Superadmin | Vai trò quản trị toàn hệ thống: tài khoản, vai trò, công cụ, engine, cấu hình. | | `superadmin` |
| Admin | Vai trò vận hành nghiệp vụ trên toàn hệ thống: program, scope, job, duyệt job, triage, báo cáo. Không quản trị tài khoản, công cụ, engine. | | `admin` |
| User | Vai trò làm việc trên program được gán: xem dữ liệu, tạo job, triage, tạo báo cáo. | Tài khoản. | `user` |
| Thông tin xác thực | Giá trị bí mật dùng để xác thực hoặc truy cập: API key, token, mật khẩu, proxy có tên đăng nhập và mật khẩu. Luôn che trên UI. Lưu dạng mã hóa. Riêng mật khẩu, session ID, token worker chỉ lưu giá trị băm (G7). | | `secret` |
| Nhật ký thao tác | Bản ghi hành động của tài khoản trên hệ thống (G7). | Log ứng dụng. | `audit_log` |
| Dashboard | Màn hình tổng quan S02. | | `dashboard` |
| Cảnh báo | Thông báo trên biểu tượng chuông ở header khi có finding critical hoặc high mới, job chờ duyệt, job thất bại, tài sản mới, chứng chỉ TLS của URL sắp hết hạn, lịch quét định kỳ đến hạn mà không tạo được job. Hiển thị cho tài khoản xem được program. | Log ứng dụng, nhật ký thao tác. | `alert` |
| Xóa mềm | Đánh dấu dòng đã xóa bằng cột `deleted_at`, không xóa dòng khỏi CSDL. Dòng đã xóa mềm ẩn khỏi danh sách, đọc chi tiết trả `404`. Áp dụng cho tài khoản, domain, screenshot: [ADR xóa mềm](../decisions/adr-soft-delete.md). | Xóa cứng program. Lưu trữ program. Khóa tài khoản. | `deleted_at` |
| Bộ lọc đã lưu | Bộ tham số lọc của một màn hình danh sách, tài khoản tự đặt tên và lưu để dùng lại. Chỉ chủ sở hữu thấy. Nút Filter Presets trên S04. | Tag. | `saved_filter` |
| Lần chẩn đoán | Một lần chạy Run Diagnostics trên S15: tiến trình nền kiểm tra từng thành phần hệ thống và công cụ trên worker, ghi kết quả từng dòng. | Healthcheck định kỳ của `GET /system/health`. | `diagnostic_run` |

## Từ dùng khi viết tài liệu

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| File | Đơn vị dữ liệu có tên trên đĩa hoặc trong repo. Giữ tiếng Anh trong tài liệu. | Object trong MinIO: gọi là object. | |
| Từ tiếng Anh giữ nguyên | Thuật ngữ kỹ thuật viết tiếng Anh trong câu văn: commit, rollback, lock, cache, stream, publish, subscribe, parse, upload, claim, render, realtime, test, server, production, UI, comment, bullet, task, dependency. Chỉ dùng "dependency" cho dependency của FastAPI, thư viện mà package cần thì viết "thư viện phụ thuộc". Từ phổ thông khác dịch sang tiếng Việt theo [vietnamese-writing.md](../../.claude/rules/vietnamese-writing.md). | | |
| Viết tắt miễn giải thích | Viết tắt dùng thẳng, không cần tên đầy đủ: API (Application Programming Interface), UI (User Interface), URL (Uniform Resource Locator), HTTP/HTTPS (Hypertext Transfer Protocol/Secure), JSON (JavaScript Object Notation), SQL (Structured Query Language), REST (Representational State Transfer), UUID (Universally Unique Identifier), IP (Internet Protocol), DNS (Domain Name System), TLS (Transport Layer Security), CDN (Content Delivery Network), CI (Continuous Integration), CSDL (cơ sở dữ liệu). Viết tắt khác ghi tên đầy đủ ở lần đầu xuất hiện trong mỗi file. | | |
| Rủi ro tồn dư | Rủi ro còn lại sau khi áp dụng biện pháp giảm thiểu, đã được chấp nhận. Theo TCVN (Tiêu chuẩn Quốc gia Việt Nam) 10295:2014. | | |
| Trợ năng | Khả năng người dùng, kể cả người khuyết tật, dùng được giao diện. Tương ứng với accessibility trong WCAG (Web Content Accessibility Guidelines). | Kiểm soát truy cập. | |
| Tiền đề | Tài liệu mà một tài liệu khác dựa trên, ghi ở cột Phụ thuộc của roadmap. Viết tiền đề trước. | Tài liệu tham khảo bên ngoài. | |
| Kế thừa | Tài liệu dựa trên một tài liệu khác. Quan hệ ngược của tiền đề. | | |
| Phạm vi ảnh hưởng | Các file phải cập nhật trong cùng lượt khi một file nguồn thay đổi, theo bảng Kích hoạt của [doc-sync.md](../../.claude/rules/doc-sync.md). | Tài liệu kế thừa. | |
| Nguồn ảnh hưởng | File mà khi thay đổi thì tài liệu đang xét phải cập nhật. Quan hệ ngược của phạm vi ảnh hưởng. | | |

## Từ không dùng

Nguồn duy nhất cho các thay thế thuật ngữ đã chốt. Gặp từ ở cột Không dùng thì viết theo cột Viết thay. Cụm sáo, lỗi văn phong: mục 1 của [vietnamese-writing.md](../../.claude/rules/vietnamese-writing.md).

| Không dùng | Viết thay | Phạm vi |
|---|---|---|
| bí mật | thông tin xác thực | API key, token, mật khẩu, URL proxy có tài khoản |
| che dữ liệu | ẩn thông tin xác thực | Processor thay giá trị bằng `***` trước khi ghi log |
| hàng đợi lô | bộ đệm log | Vùng nhớ trong tiến trình giữ bản ghi log chờ ghi theo lô. Khác queue Celery |
| khóa khử trùng lặp | chuỗi khử trùng lặp | `dedup_key` |
| khóa cho đối tượng không phải khóa mã hóa hay khóa CSDL | khóa object, tên thiết lập, key cache, giá trị băm | Giữ "khóa" cho: khóa mã hóa, khóa chính, khóa ngoại, khóa tự nhiên, khóa phân vùng |
| primary key, foreign key, natural key | khóa chính, khóa ngoại, khóa tự nhiên | Câu văn. Tên cột, câu SQL giữ nguyên |
| tệp | file |  |
| review | rà soát | Câu văn. Tên skill giữ nguyên |
| capture | screenshot |  |
| run của engine | lượt chạy | Osmedeus, Vigolium |
| accessibility | trợ năng |  |
| rủi ro còn lại, residual risk | rủi ro tồn dư |  |
| dependency, khi chỉ thư viện mà package cần | thư viện phụ thuộc | Giữ "dependency" cho dependency của FastAPI |
| TLS termination | giải mã TLS | Reverse proxy |
| tài sản cần bảo vệ | đối tượng cần bảo vệ | Threat model. "Tài sản" chỉ dùng theo định nghĩa ở mục Tài sản |
| null, Null | `NULL` |  |
| ". G1." cuối câu | "(G1)" | Tham chiếu mục tiêu |
| đọc trước, dựa trên, khi chỉ quan hệ giữa tài liệu | tiền đề | |
| dựa vào file này | kế thừa | |
| phải sửa theo, đổi file này thì sửa | phạm vi ảnh hưởng | |
| bị sửa theo khi đổi | nguồn ảnh hưởng | |

## Ngoài hệ thống

| Thuật ngữ | Định nghĩa | Không phải là | Tên trong mã |
|---|---|---|---|
| BBRF | Công cụ quản lý tài sản bug bounty cũ. Chỉ dùng để tham khảo kiến trúc và tính năng (G1). | Thành phần, nguồn dữ liệu hay phụ thuộc của ReconOS. | ❌ Cấm dùng trong mã |

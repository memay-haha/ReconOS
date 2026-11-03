# Thiết kế: Thứ tự viết mã ReconOS phiên bản đầu

> Ngày: 2026-11-03 · Trạng thái: 🟢 Xong
> Liên quan: [roadmap.md](../../roadmap.md), [tech-debt.md](../../tech-debt.md), [overview.md](../../architecture/overview.md), [dependency-graph.md](../../architecture/dependency-graph.md)

## 🎯 Mục tiêu

- Chia việc viết mã phiên bản đầu thành 13 đợt, mỗi đợt một lát cắt chạy được từ giao diện xuống worker.
- Nội dung chính của từng đợt ghi vào [roadmap.md](../../roadmap.md). File này giữ bước chi tiết.
- Repo hiện chưa có mã. Tài liệu đặc tả đã 🟢 Xong 38/40, đủ để bắt đầu.

## 📐 Nguyên tắc xếp thứ tự

1. Lát cắt dọc: mỗi đợt kết thúc bằng một việc người dùng làm được trên giao diện, không dừng ở API.
2. Theo tầng phụ thuộc module trong [dependency-graph.md](../../architecture/dependency-graph.md): tầng dưới làm trước, `asset` trước `finding`.
3. Xương sống trước, bề rộng sau: chứng minh G4, G5, G8 và contract worker ↔ backend ở đợt 4, rồi mới thêm công cụ.
4. Tool module đầu tiên là `nuclei`: worker chỉ cần một binary, chưa cần engine server. Parser đầu tiên là workflow Osmedeus vì parser phải sinh tài sản trước khi có finding.
5. Mỗi đợt sửa mockup lệch tài liệu trước khi dựng màn hình của đợt đó. Danh sách lệch: [tech-debt.md](../../tech-debt.md).
6. Frontend dựng trong cùng đợt với backend tương ứng, không gom thành giai đoạn riêng.

## 🔄 Đợt 1: Nền tảng dự án

**Lát cắt:** 8 lệnh trong `Makefile` chạy được trên repo rỗng, `GET /health` trả 200.

- Gốc repo: `pyproject.toml` uv workspace gồm `backend/`, `workers/`, `contracts/`. Cấu hình ruff kèm nhóm rule `S`, mypy strict, pytest, coverage.
- Kiểm tra Celery, SQLAlchemy, Pydantic trên Python 3.15. Giữ hoặc đổi phiên bản trong `tech-stack.md`: nợ 13.
- `frontend/`: Next.js, pnpm, Tailwind với design token lấy từ mockup, ESLint, Prettier, Vitest, Playwright.
- `infras/compose/compose.dev.yaml`: PostgreSQL, Redis, MinIO. Tạo `reconos`, `reconos_log`, `reconos_test`, `reconos_log_test`.
- `infras/docker/`: chốt tên `backend.Dockerfile`, `frontend.Dockerfile`, `worker.Dockerfile`, ghi vào `deployment.md`: nợ 14.
- `backend/app/core/`: `config.py` đọc biến `RECONOS_*` và hậu tố `_FILE`, `db.py`, `logging.py` structlog JSON kèm processor che dữ liệu và ghi lô vào CSDL log, `errors.py` lớp `AppError` và bộ xử lý RFC 9457, `storage.py`, `realtime.py` dạng khung.
- Alembic: `backend/alembic.ini`, `migrations/`, phân vùng bảng log theo `logged_at`.
- Xóa `backend/.env`, khôi phục 4 quy tắc chặn đọc `.env` trong `.claude/settings.json`: nợ 16.
- CI chạy `make lint` và `make test`.
- Test: processor che dữ liệu với từng tên trường trong danh sách. Mỗi lớp `AppError` trả đúng status, `code`, định dạng RFC 9457.

## 🔄 Đợt 2: Tài khoản và phân quyền

**Lát cắt:** đăng nhập trên S01, Superadmin tạo tài khoản trên S12, mọi thao tác ghi nhật ký.

- Bảng: `user`, `user_session`, `login_attempt`, `audit_log`, `system_setting`.
- Module: `user`, `audit_log`. Mã dùng chung: `core/security.py`.
- Mật khẩu Argon2id, từ chối mật khẩu có điểm zxcvbn dưới 3. Phiên phía server, cookie giữ session ID gốc, CSDL giữ giá trị băm SHA-256. Thuộc tính cookie chọn theo scheme của `RECONOS_PUBLIC_ORIGIN`. Chống CSRF theo `api/architecture.md`.
- Chặn đăng nhập sai bằng bảng `login_attempt`, đếm theo tài khoản và theo IP trong cửa sổ đếm.
- Ngưỡng vận hành đọc từ `system_setting`, thiếu tên thiết lập thì dùng giá trị mặc định trong `configuration.md`. Màn hình sửa ngưỡng vẫn ở đợt 10.
- Tài khoản Superadmin đầu tiên tạo bằng lệnh `bootstrap` đọc biến môi trường, chỉ chạy khi bảng `user` chưa có dòng nào.
- Dependency phân quyền cho 3 vai trò. Hàm lọc theo program viết sẵn khung ở đợt 2, nối vào bảng `program_user` ở đợt 3.
- Màn hình S01, S12. Sửa trước khi dựng: nợ 4 bỏ MFA Enforced, FIDO2, WebAuthn, SSO SAML, Active Directory, mTLS, API Tokens và 3 vai trò ngoài glossary. Nợ 11 phân trang cursor với nút Trước, Sau.
- Test: mỗi endpoint với từng vai trò. Độ phủ 100% nhánh cho `core/security.py`.
- E2E (end-to-end): luồng đăng nhập.

## 🔄 Đợt 3: Program và scope

**Lát cắt:** tạo program, khai báo scope rule, thấy mục tiêu ngoài scope bị từ chối.

- Bảng: `program`, `program_user`, `scope_rule`, `proxy`.
- Module: `program`, `scope`. Mã dùng chung: `core/crypto.py` AES-256-GCM, ID khóa kèm bản mã, nonce ngẫu nhiên 96 bit, nạp khóa từ `RECONOS_ENCRYPTION_KEYS`.
- Tạm dừng, lưu trữ, xóa cứng program. Gán User vào program. Proxy của program lưu cột `url_encrypted`.
- So khớp 4 dạng scope rule: `domain`, `wildcard`, `cidr`, `url`, cho cả In-Scope và Out-of-Scope.
- Màn hình S08, S09, S11. Sửa trước khi dựng: nợ 1 bỏ phần BBRF, nợ 6 bỏ chú thích tự sinh job và runner chặn scope, nợ 11 phân trang.
- Test: bảng ca so khớp theo trường hợp biên trong `business-flow.md`, độ phủ 100% nhánh, chạy trong CI (G5). Tài khoản User gọi tài nguyên program chưa gán trả `404`.

## 🔄 Đợt 4: Xương sống job và output thô

**Lát cắt:** tạo job `nuclei` trên mục tiêu trong scope, worker chạy, output thô tải về được, S10 cập nhật realtime.

- Bảng: `tool_module`, `job`, `raw_output`, `worker`, `worker_token`.
- `contracts/`: `tasks.py`, `raw_output.py`, `job_status.py`.
- Module: `tool_module`, `job`, `raw_output`, `dispatcher`. Hoàn thiện `core/realtime.py`.
- Tạo job: kiểm tra scope và kiểm tra tham số theo schema tool module. Chuyển trạng thái bằng `UPDATE` có điều kiện trạng thái hiện tại. Gửi `NOTIFY` trong cùng transaction.
- Dispatcher: advisory lock, `LISTEN` kèm quét định kỳ, chọn theo độ ưu tiên, giới hạn số job đồng thời và tốc độ, heartbeat.
- Contract worker: claim, heartbeat, upload output thô, finish, gửi log theo lô.
- Lưu output thô nguyên vẹn vào MinIO rồi mới ghi metadata và `sha256`. Chưa có parser thì đặt `parse_status` là `no_parser` (G8). Tải về kèm header `Content-Disposition: attachment`.
- `workers/`: `celery_app.py`, `client.py`, `logging.py`, `runners/base.py`, `runners/nuclei.py`. Image worker cài nuclei.
- Realtime: publish sự kiện job đổi trạng thái lên Redis pub/sub, Backend API đẩy qua WebSocket theo quyền.
- `infras/redis/`: liệt kê key cho ACL (Access Control List) của tài khoản `worker`, nợ 15.
- Màn hình S10, S15 phần worker và dispatcher, S18. Sửa trước khi dựng: nợ 10 bỏ Generate Jobs, Dispatch All, Cleanup, CPU load. Nợ 2 bỏ dòng kiểm tra CSDL gowitness trên S15 và đổi Target Output trên S18. Nợ 9 bỏ nút Update. Nợ 5 bỏ nút New Module.
- Test: schema tham số đạt 100% nhánh. Runner kiểm tra danh sách đối số, mock tiến trình con. Hai tiến trình cùng chuyển trạng thái thì chỉ một thành công. Worker không ghi được vào queue `parse`, `schedule`.
- E2E: luồng tạo job.

## 🔄 Đợt 5: Engine, tài sản và parser

**Lát cắt:** chạy workflow Osmedeus, parser sinh domain, IP, URL, service, xem trên S03 đến S05.

- Bảng: `engine`, `engine_variable`, `domain`, `ip`, `domain_ip`, `service`, `url`, `technology`, `url_technology`, `asset_event`, `tag`, `asset_tag`.
- Module: `engine`, `asset`, `tag`, `parser`.
- Chốt cách cô lập workspace Osmedeus theo job: thử truyền qua `params` hoặc dùng `id` của lượt chạy, rồi sửa `external-services.md`. Nợ 12.
- `workers/worker/runners/osmedeus-<workflow>.py`: gọi REST API bằng `engine.base_url` và API key nhận khi claim, nén thư mục output thành một gói.
- `backend/app/parser/`: `base.py`, `registry.py`, parser workflow Osmedeus. Task `parse` thử lại tối đa 3 lần, backoff lũy thừa, hết lượt thì `parse_status = failed` kèm `parse_error`.
- Parser đọc output thô dạng stream, upsert theo lô, coi output thô là dữ liệu không tin cậy.
- Tài sản ngoài scope vẫn lưu và đánh dấu. Scope rule đổi thì tính lại đánh dấu bằng task thuộc module `asset`.
- Màn hình S03, S04, S05, S16. Sửa trước khi dựng: nợ 1, nợ 7 bỏ Confidence và Auto-reconciled trên S05, nợ 8 giữ lại phần kết nối và biến engine trên S16, nợ 11.
- Test: parser đọc output thô mẫu trong `backend/tests/fixtures/raw_output/`, parse hai lần không tạo bản trùng.

## 🔄 Đợt 6: Finding và triage

**Lát cắt:** chạy nuclei, parser sinh finding, đổi trạng thái triage trên S20.

- Bảng: `finding`, `finding_tag`.
- Module: `finding`. Parser `nuclei`.
- `dedup_key` bắt đầu bằng tên tool module, chuỗi khử trùng lặp gồm `template-id` và `matched-at`. Finding trùng chỉ cập nhật thời điểm phát hiện gần nhất, giữ trạng thái triage.
- 6 trạng thái triage. Mỗi lần đổi ghi nhật ký thao tác.
- Màn hình S20. Sửa trước khi dựng: nợ 7 dùng 6 trạng thái triage, bỏ Push to Jira và Sync Nuclei.
- E2E: luồng triage finding.

## 🔄 Đợt 7: Screenshot

**Lát cắt:** chạy gowitness trên URL đã có, xem ảnh trên S06 và S07.

- Bảng: `screenshot`.
- Module: `screenshot`. Runner và parser `gowitness`.
- Ảnh đi theo đường output thô, lưu trong MinIO. ReconOS không đọc CSDL riêng của gowitness (G1).
- `perception_hash` gom ảnh giống nhau, `is_failed` cho lần chụp lỗi. Trả header `X-Content-Type-Options: nosniff`.
- Màn hình S06, S07.

## 🔄 Đợt 8: Nhóm khai thác và duyệt job

**Lát cắt:** tạo job `sqlmap`, tài khoản thứ hai duyệt trên S10, job mới chạy.

- Tool module `sqlmap`, `dalfox`: schema allowlist trong `contracts/`, runner trong `workers/`.
- Trạng thái `pending_approval`, thao tác duyệt và từ chối, ghi `status_reason`. Dispatcher không giao job chờ duyệt.
- Người tạo job không duyệt được chính job đó, kể cả Superadmin (G5).
- Màn hình S10 phần duyệt.
- Test: tham số ngoài allowlist bị từ chối, ví dụ `--os-shell`, `--file-write`, `--dump-all` của sqlmap.
- E2E: luồng duyệt job nhóm khai thác bằng tài khoản thứ hai.

## 🔄 Đợt 9: Vigolium

**Lát cắt:** cấu hình engine Vigolium trên S17, chạy job, finding về S20.

- Runner và parser `vigolium`, dùng lại module `engine` của đợt 5.
- Kiểm chứng cách lọc `GET /api/findings` theo `scan_id` khi có mục tiêu cho quét chủ động: phần còn lại của nợ 12.
- Màn hình S17. Sửa trước khi dựng: nợ 8 giữ lại phần kết nối và biến engine.

## 🔄 Đợt 10: Cảnh báo và dashboard

**Lát cắt:** chuông trên header báo finding mới, S02 hiện số liệu tổng hợp.

- Bảng: `alert`, `alert_read`.
- Module: `alert` với 4 loại `finding_new`, `job_pending_approval`, `job_failed`, `asset_new`. Module `dashboard` chỉ đọc, cache Redis 30 giây.
- Superadmin sửa `system_setting` trên giao diện.
- Màn hình S02, S15 đầy đủ.

## 🔄 Đợt 11: Báo cáo

**Lát cắt:** gom finding `confirmed` thành báo cáo, đánh dấu đã nộp, finding chuyển `reported`.

- Bảng: `report`, `report_finding`.
- Module: `report`. Nội dung Markdown, đính kèm bằng chứng từ output thô, `platform_report_ref` nhập tay.
- Xuất CSV (Comma-Separated Values): thêm `'` trước ô bắt đầu bằng `=`, `+`, `-`, `@`.

## 🔄 Đợt 12: Lịch quét định kỳ

**Lát cắt:** đặt lịch trên S09, Celery Beat sinh job đến hạn.

- Bảng: `schedule`.
- Celery Beat gửi task vào queue `schedule`. Task gọi service của module `job`, kiểm tra scope như job tạo từ API (G5).
- `created_by` của job do lịch sinh để `NULL`. Cập nhật `next_run_at`. Program tạm dừng hoặc lưu trữ thì lịch ngừng.
- Màn hình: phần lịch trên S09.

## 🔄 Đợt 13: Triển khai production

**Lát cắt:** hệ thống chạy sau Nginx có TLS, có sao lưu và khôi phục.

- Nginx: TLS, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- Compose production, Uvicorn, chạy migration bằng lượt chạy riêng trước khi khởi động ứng dụng.
- Sao lưu: `pg_dump` cho PostgreSQL, `mc mirror` cho MinIO.
- Chạy đủ 4 luồng E2E. Đối chiếu tiêu chí thành công trong `overview.md`: 17 màn hình chạy với dữ liệu thật.

## ✍️ Quy tắc chung mỗi đợt

- Viết test trước mã theo skill `test-driven-development`.
- Chạy `make lint` và `make test` trước khi báo xong một thay đổi mã.
- Thêm endpoint thì cập nhật `openapi.yaml` trong cùng lượt.
- Quyết định mới hoặc đổi quyết định: đồng bộ tài liệu theo [doc-sync.md](../../../.claude/rules/doc-sync.md) trong cùng lượt.
- Nợ kỹ thuật xử lý xong: chuyển trạng thái trong `tech-debt.md`.
- Lưu memory theo [agentmemory.md](../../../.claude/rules/agentmemory.md) khi người dùng ra tín hiệu chốt.

## 🔍 Cách kiểm tra thứ tự

- Mỗi đợt chỉ dùng module ở tầng bằng hoặc thấp hơn các module đã làm ở đợt trước.
- Mỗi bảng CSDL xuất hiện đúng một lần trong 13 đợt.
- Mỗi màn hình trong `docs/design/screens/index.json` thuộc đúng một đợt.
- Mỗi nợ trong `tech-debt.md` có đợt xử lý, trừ nợ 3 MFA nằm ở phần sau phiên bản đầu.

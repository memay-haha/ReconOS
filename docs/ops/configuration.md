# Cấu hình

> Phiên bản: 1.8 · Ngày: 2026-11-12 · Trạng thái: 🔵 Chờ duyệt
> Mục 14: Cấu hình
> Liên quan: [external-services.md](../integrations/external-services.md), [system.md](../architecture/system.md), [security.md](../../.claude/rules/security.md), [deployment.md](deployment.md)

## 📌 Đây là gì

- Nguồn cấu hình của ReconOS, biến môi trường của từng tiến trình, ngưỡng vận hành sửa được trên UI và giá trị mặc định.
- Cách nạp thông tin xác thực của hệ thống và xoay vòng khóa mã hóa.

## 🎯 Dùng để làm gì

- Một nơi tra mọi giá trị cấu hình, không có giá trị cố định trong mã.
- Thông tin xác thực không nằm trong mã, image, repo (G7).

## ⏰ Dùng khi nào

- Thêm biến cấu hình, triển khai môi trường mới, đổi ngưỡng vận hành, xoay vòng khóa.
- Không dùng để tra cấu hình tool module, engine: xem [modules.md](../architecture/modules.md), [external-services.md](../integrations/external-services.md).

## 📍 Ở đâu

- Mã: `backend/app/core/config.py`, `workers/worker/config.py`. Bảng `system_setting`: [schema.md](../data/schema.md).
- Màn hình: S15 cho ngưỡng vận hành, S16, S17, S18 cho engine và tool module.

## ⚙️ Làm như thế nào

### Nguồn cấu hình

| Nguồn | Chứa | Ai đổi | Áp dụng |
|---|---|---|---|
| Biến môi trường `RECONOS_*` | Hạ tầng, thông tin xác thực của hệ thống | Người triển khai | Khởi động lại tiến trình |
| Bảng `system_setting` | Ngưỡng vận hành | Superadmin trên UI | Trong vòng 60 giây, không cần khởi động lại |
| Bảng `tool_module`, `engine`, `engine_variable` | Cấu hình tool module, engine | Superadmin trên S16, S17, S18 | Job tạo sau khi đổi |

- Nạp biến môi trường bằng pydantic-settings, kiểm tra kiểu khi khởi động. Thiếu biến bắt buộc thì tiến trình ghi log `critical` rồi dừng.
- File `.env` chỉ dùng khi phát triển. ❌ Không commit `.env`, chỉ commit `.env.example` không có giá trị thật.

### Nạp thông tin xác thực

- Biến thông tin xác thực nhận hai dạng: giá trị trực tiếp hoặc hậu tố `_FILE` trỏ tới file chứa giá trị.
- 💡 Ví dụ: `RECONOS_DB_PASSWORD_FILE=/run/secrets/db_password`. Có cả hai dạng thì dùng `_FILE`.
- Dạng `_FILE` dùng với Docker secrets khi triển khai: [deployment.md](deployment.md).

### Biến môi trường của lõi

Dùng cho Backend API, dispatcher, tiến trình nền, Celery Beat. ✅: biến là thông tin xác thực, nhận cả dạng `_FILE`.

| Biến | Thông tin xác thực | Ý nghĩa |
|---|---|---|
| `RECONOS_DATABASE_URL` | | URL kết nối CSDL chính, không chứa mật khẩu |
| `RECONOS_DB_PASSWORD` | ✅ | Mật khẩu CSDL chính |
| `RECONOS_LOG_DATABASE_URL` | | URL kết nối CSDL log `reconos_log` |
| `RECONOS_LOG_DB_PASSWORD` | ✅ | Mật khẩu CSDL log |
| `RECONOS_REDIS_URL` | | URL kết nối Redis, không chứa mật khẩu |
| `RECONOS_REDIS_PASSWORD` | ✅ | Mật khẩu tài khoản Redis của lõi |
| `RECONOS_S3_ENDPOINT` | | Endpoint MinIO |
| `RECONOS_S3_BUCKET` | | Bucket output thô |
| `RECONOS_S3_ACCESS_KEY`, `RECONOS_S3_SECRET_KEY` | ✅ | Khóa truy cập MinIO |
| `RECONOS_ENCRYPTION_KEYS` | ✅ | Khóa mã hóa cột `_encrypted` |
| `RECONOS_PUBLIC_ORIGIN` | | Origin của ReconOS, dùng kiểm tra CSRF (Cross-Site Request Forgery), WebSocket và chọn thuộc tính cookie phiên theo scheme. Chỉ nhận dạng `scheme://host[:port]`, phần còn lại bị bỏ khi nạp. Giá trị sai dạng làm tiến trình dừng ngay khi khởi động |
| `RECONOS_BOOTSTRAP_ADMIN_USERNAME` | | Tên đăng nhập của Superadmin đầu tiên, chỉ lệnh `bootstrap` đọc |
| `RECONOS_BOOTSTRAP_ADMIN_PASSWORD` | ✅ | Mật khẩu của Superadmin đầu tiên, chỉ lệnh `bootstrap` đọc |
| `RECONOS_LOG_LEVEL` | | Cấp log ra stdout, mặc định `info` |
| `RECONOS_DB_POOL_SIZE` | | Số kết nối CSDL cho luồng request mỗi tiến trình, mặc định 10 |

- Backend API giữ thêm 2 kết nối cố định ngoài `RECONOS_DB_POOL_SIZE`, dành riêng cho transaction độc lập ghi lần đăng nhập sai và yêu cầu bị từ chối. Số này không cấu hình được. Khi cả 2 kết nối đang bận, request chờ tối đa 2 giây rồi bỏ, để một đợt đăng nhập sai dồn dập không làm request treo.
- Hai biến `RECONOS_BOOTSTRAP_ADMIN_*` chỉ có tác dụng khi bảng `user` chưa có dòng nào. Đổi giá trị sau đó không sửa tài khoản đã tạo: [authentication.md](../security/authentication.md).

### Biến môi trường của frontend

| Biến | Thông tin xác thực | Ý nghĩa |
|---|---|---|
| `RECONOS_API_URL` | | URL Backend API, bắt buộc ở mọi môi trường. Server Next.js chuyển tiếp `/api/*` của trình duyệt tới địa chỉ này, và tự gọi Backend API ở mỗi request để kiểm tra phiên. ❌ Không kết thúc giá trị bằng `/`, vì Next ghép thành `//api` |
| `RECONOS_NODE_NAME` | | Tên node hiện trên chip của S01, ví dụ `NODE 01-PROD`. Đọc lúc build frontend, gắn cố định vào bản build. Để trống thì S01 không hiện chip node |

- Phiên bản ReconOS trên mọi chip phiên bản lấy từ trường `version` của `frontend/package.json` lúc build. Backend API không trả phiên bản cho người chưa đăng nhập: [threat-model.md](../security/threat-model.md).
- Trình duyệt chỉ gọi origin của Next.js, không gọi thẳng Backend API. Nhờ vậy `Origin` luôn khớp `RECONOS_PUBLIC_ORIGIN` và cookie `SameSite=Lax` gửi kèm.
- Production định tuyến `/api/` của trình duyệt ở Nginx: [deployment.md](deployment.md). Server Next.js vẫn cần `RECONOS_API_URL`, vì server component kiểm tra phiên gọi thẳng Backend API ở mỗi request, không đi qua Nginx. Thiếu biến, Next gọi giá trị mặc định `http://127.0.0.1:8000`, tức chính container frontend. S01 vẫn dựng được form đăng nhập, nhưng mọi màn hình sau khi đăng nhập đều hỏng.

### Biến môi trường của bộ test E2E

Chỉ dùng trên máy phát triển. ❌ Không đặt ba biến này trong môi trường production.

| Biến | Thông tin xác thực | Ý nghĩa |
|---|---|---|
| `RECONOS_E2E_BASE_URL` | | Địa chỉ Playwright mở ứng dụng, mặc định `http://127.0.0.1:3000`. Playwright lấy host và cổng từ đây để chạy `pnpm dev` |
| `RECONOS_E2E_USERNAME` | | Tên đăng nhập bộ test dùng. Để trống thì lấy `RECONOS_BOOTSTRAP_ADMIN_USERNAME` |
| `RECONOS_E2E_PASSWORD` | ✅ | Mật khẩu của tài khoản trên. Để trống thì lấy `RECONOS_BOOTSTRAP_ADMIN_PASSWORD` |

- `frontend/playwright.config.ts` nạp `frontend/.env`, rồi đọc đúng hai biến `RECONOS_BOOTSTRAP_ADMIN_*` trong `.env` ở gốc repo để điền hai biến còn trống. Playwright là tiến trình riêng, không tự đọc file env nào, nên thiếu bước này thì `frontend/.env` điền đủ vẫn không tới được bộ test.
- Config chỉ lấy hai khóa cần dùng, không nạp cả `.env` ở gốc repo, vì file đó còn chứa mật khẩu CSDL và khóa mã hóa mà server phát triển không cần (G7).
- Biến đã có sẵn trong môi trường thắng giá trị trong file. Nhờ vậy chạy bộ test bằng tài khoản khác chỉ cần đặt biến ngay trên dòng lệnh.
- Sau `make init`, bộ test chạy được ngay bằng lệnh trong [testing.md](../../.claude/rules/testing.md), không cần điền thêm biến nào.

### Biến môi trường của worker

| Biến | Thông tin xác thực | Ý nghĩa |
|---|---|---|
| `RECONOS_API_URL` | | URL Backend API |
| `RECONOS_WORKER_TOKEN` | ✅ | Token worker do Superadmin tạo |
| `RECONOS_REDIS_URL` | | URL kết nối Redis |
| `RECONOS_REDIS_PASSWORD` | ✅ | Mật khẩu tài khoản Redis của worker, chỉ dùng queue job |
| `RECONOS_WORKER_TOOL_MODULES` | | Tool module đã cài, cách nhau bằng dấu phẩy. Worker nghe queue tương ứng |
| `RECONOS_WORKER_WORKDIR` | | Thư mục làm việc của job |
| `RECONOS_WORKER_CONCURRENCY` | | Số job chạy song song trên máy, mặc định 1 |

### Khóa mã hóa

- `RECONOS_ENCRYPTION_KEYS` là danh sách `<id>:<khóa base64>` cách nhau bằng dấu phẩy. Khóa đầu tiên dùng để mã hóa, mọi khóa dùng được để giải mã.
- Khóa dài 256 bit, sinh bằng nguồn ngẫu nhiên an toàn.
- Xoay vòng khóa:
  1. Thêm khóa mới vào đầu danh sách.
  2. Khởi động lại lõi.
  3. Chạy lệnh mã hóa lại trong `backend/app/core/` để chuyển mọi bản mã sang khóa mới.
  4. Xóa khóa cũ khỏi danh sách.
  5. Khởi động lại lõi.
- Mất khóa thì không giải mã được thông tin xác thực đã lưu. Sao lưu khóa tách khỏi bản sao lưu CSDL.

### Ngưỡng vận hành

Lưu trong `system_setting`, Superadmin sửa trên UI. Thiếu tên thiết lập thì dùng giá trị mặc định. Cột Đọc công khai ✅: Admin, User đọc được qua `GET /system-settings/{key}`.

| Tên thiết lập | Mặc định | Đọc công khai | Ý nghĩa |
|---|---|---|---|
| `session_idle_timeout_minutes` | 30 |  | Số phút không hoạt động trước khi phiên hết hạn |
| `session_absolute_timeout_hours` | 12 |  | Thời hạn tối đa của một phiên |
| `login_max_failures_per_account` | 5 |  | Số lần đăng nhập sai theo tài khoản trong khoảng thời gian đếm |
| `login_max_failures_per_ip` | 20 |  | Số lần đăng nhập sai theo IP trong khoảng thời gian đếm |
| `login_failure_window_minutes` | 15 |  | Khoảng thời gian đếm lần đăng nhập sai, cũng là thời gian từ chối tạm |
| `dispatcher_poll_seconds` | 30 |  | Chu kỳ dispatcher quét bù sự kiện bị lỡ |
| `job_heartbeat_seconds` | 30 |  | Chu kỳ worker gửi heartbeat job |
| `job_heartbeat_timeout_minutes` | 5 |  | Không nhận heartbeat quá ngưỡng thì job chuyển sang `failed` |
| `upload_max_bytes` | 10 GB |  | Kích thước tối đa một file output thô |
| `parser_batch_size` | 1.000 |  | Số dòng mỗi lô upsert của parser |
| `log_retention_days` | 30 | ✅ | Thời hạn giữ log trong CSDL log |
| `finding_sla_days` | 30 | ✅ | Số ngày xử lý finding `confirmed`, `reported`. Finding có tuổi quá giá trị này trừ 2 ngày tính vào `findings_near_sla` |
| `queue_capacity` | 1.000 | ✅ | Sức chứa hàng đợi hiển thị trên S10, mẫu số của Queue Depth Pressure. Không chặn tạo job |
| `user_idle_after_minutes` | 15 | | Phiên còn hiệu lực có `last_seen_at` cũ hơn ngưỡng này hiện trạng thái Idle trên S12 |
| `cert_expiring_days` | 14 | ✅ | Chứng chỉ TLS của URL hết hạn trong số ngày này thì sinh cảnh báo `cert_expiring` |

- Backend ghi nhật ký thao tác mỗi lần đổi ngưỡng.
- `upload_max_bytes` cũng phải đặt ở reverse proxy: [deployment.md](deployment.md).

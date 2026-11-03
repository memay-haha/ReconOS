# Thiết kế: Nền tảng xác thực backend, đợt 2a

> Ngày: 2026-11-03 · Trạng thái: 🟢 Xong
> Liên quan: [roadmap.md](../../roadmap.md), [thiết kế thứ tự viết mã](2026-11-02-implementation-roadmap-design.md), [authentication.md](../../security/authentication.md), [authorization.md](../../security/authorization.md), [schema.md](../../data/schema.md), [api/architecture.md](../../api/architecture.md)

## 🎯 Mục tiêu

- Lát cắt: 13 endpoint xác thực và quản lý tài khoản chạy được, mỗi endpoint có test theo từng vai trò.
- Phạm vi backend. Màn hình S01, S12 và test E2E (end-to-end) thuộc spec 2b.
- Đợt 2 chia hai spec vì backend là phụ thuộc của frontend và đủ lớn để kiểm thử riêng.

## 📐 Quyết định chốt cho đợt này

| Quyết định | Lý do | Phương án đã loại |
|---|---|---|
| Superadmin đầu tiên tạo bằng lệnh `bootstrap` đọc biến môi trường, chỉ chạy khi bảng `user` rỗng | Theo đúng cách nạp cấu hình sẵn có, không thêm đường tạo tài khoản không cần xác thực | Data migration Alembic chèn từ env. Màn hình setup lần đầu trên UI |
| Đếm lần đăng nhập sai bằng bảng `login_attempt` | Không thêm trạng thái đếm ngoài CSDL, truy vết được IP, test tất định | Bộ đếm Redis có TTL. Đếm từ `audit_log` |
| Từ chối mật khẩu có điểm zxcvbn dưới 3 | Bắt cả mật khẩu phổ biến và mẫu dễ đoán, chạy cục bộ | File danh sách top-N trong repo. Gọi API mật khẩu đã lộ |
| Thuộc tính cookie chọn theo scheme của `RECONOS_PUBLIC_ORIGIN` | Mở đường cho E2E chạy trên http mà production vẫn giữ `__Host-` kèm `Secure` | Thêm reverse proxy TLS vào compose phát triển |
| `audit_log` xuống tầng riêng ngay trên `core` | Mọi module ghi nhật ký được, kể cả `user`, không còn phụ thuộc vòng (G3) | Ngoại lệ hai chiều. Router gọi `audit_log` thay cho service |
| Kéo bảng `system_setting` lên đợt 2 | Ngưỡng phiên và ngưỡng đăng nhập đọc từ nguồn chính ngay từ đầu | Hằng số trong mã, đổi nguồn ở đợt 4 |
| Cột người thực hiện của `audit_log` không có khóa ngoại | Nhật ký chỉ thêm dòng, phải ghi được từ transaction độc lập. Cùng cách xử lý với `worker_id`, `program_id` | Giữ khóa ngoại rồi cho fixture test commit tài khoản. Router tự dựng response lỗi thay vì ném lỗi |

- Tài liệu đã đồng bộ theo [doc-sync.md](../../../.claude/rules/doc-sync.md) ngày 03/11/2026.

## 🔄 Bảng CSDL

Một migration trong `backend/migrations/`. Cột đầy đủ: [erd.mermaid](../../data/erd.mermaid).

| Bảng | Ghi chú khi viết migration |
|---|---|
| `user` | `username` duy nhất. `role` ràng buộc 3 giá trị. `is_locked` mặc định `false` |
| `user_session` | `session_hash` duy nhất. Khóa ngoại tới `user` kèm `ON DELETE CASCADE`. Index theo `user_id` |
| `login_attempt` | Không có khóa ngoại vì ghi cả khi tên đăng nhập không tồn tại. Index theo `username`, `attempted_at` và theo `ip_address`, `attempted_at` |
| `audit_log` | Chỉ thêm dòng. Cột `worker_id`, `program_id` tạo không kèm ràng buộc khóa ngoại, thêm ràng buộc ở đợt 3 và đợt 4. Index theo `created_at`, `id` |
| `system_setting` | Khóa chính `key`. `updated_by` khóa ngoại tới `user` |

## 🔄 `core/security.py`

Đạt 100% phủ nhánh: [testing.md](../../../.claude/rules/testing.md).

| Nhóm | Hàm và hành vi |
|---|---|
| Mật khẩu | Băm và kiểm bằng Argon2id. Báo khi cần băm lại. Kiểm chính sách: độ dài từ 12 đến 128 ký tự, điểm zxcvbn từ 3, truyền tên đăng nhập và tên hiển thị vào zxcvbn làm từ cấm |
| Phiên | Sinh session ID bằng `secrets`, dài 256 bit. Băm SHA-256. So sánh bằng `hmac.compare_digest` |
| Cookie | Trả tên và thuộc tính cookie theo scheme của `RECONOS_PUBLIC_ORIGIN`: https dùng `__Host-reconos_session` kèm `Secure`, http dùng `reconos_session` không `Secure`. Luôn có `HttpOnly`, `SameSite=Lax`, `Path=/` |
| CSRF | Chặn `POST`, `PUT`, `PATCH`, `DELETE` khi `Origin` khác origin của ReconOS, khi `Sec-Fetch-Site` là `cross-site`, hoặc khi thiếu cả hai header mà request có cookie phiên |
| Xác thực | Dependency `current_user`: đọc cookie, băm, tra phiên, kiểm hạn tuyệt đối theo `expires_at` và hạn không hoạt động theo `last_seen_at`, từ chối tài khoản đang khóa, cập nhật `last_seen_at` |
| Phân quyền | Dependency theo vai trò, mặc định từ chối. Hàm lọc theo program: Superadmin và Admin trả toàn bộ, User trả rỗng, đợt 3 nối vào bảng `program_user` |

## 🔄 Ghi nhật ký khi request thất bại

Request bị từ chối thì transaction rollback, nên hai loại bản ghi sau phải ghi qua session độc lập:

- Dòng `login_attempt` của lần đăng nhập sai. Mất dòng này thì chặn dò mật khẩu không còn tác dụng.
- Bản ghi `audit_log` của yêu cầu bị từ chối vì thiếu quyền.

Ba điểm bắt buộc khi cài:

- Đặt hàm mở session độc lập trong `core`, dùng chung một engine của tiến trình. ❌ Không tạo engine mới mỗi lần gọi.
- Cột người thực hiện của `audit_log` không có khóa ngoại nên session độc lập ghi được mà không cần dòng `user` đã commit: [schema.md](../../data/schema.md).
- Test dọn `login_attempt` và `audit_log` ở đầu mỗi test, vì hai bảng này nhận dòng commit nằm ngoài transaction của test.

## 🔄 Module `user`

| Endpoint | Vai trò | Hành vi chính |
|---|---|---|
| `POST /auth/login` | Không cần | Kiểm ngưỡng theo tài khoản và theo IP, kiểm mật khẩu, tạo phiên, đặt cookie, cập nhật `last_login_at`, xóa `login_attempt` của tài khoản |
| `POST /auth/logout` | 3 vai trò | Xóa phiên hiện tại, xóa cookie |
| `GET /auth/me` | 3 vai trò | Trả `id`, `username`, `display_name`, `role` |
| `POST /auth/password` | 3 vai trò | Kiểm mật khẩu hiện tại, kiểm chính sách, đổi mật khẩu, hủy mọi phiên khác |
| `GET /users` | Superadmin | Phân trang cursor |
| `POST /users` | Superadmin | Tạo tài khoản, kiểm chính sách mật khẩu |
| `GET /users/{user_id}` | Superadmin | Chi tiết tài khoản |
| `PATCH /users/{user_id}` | Superadmin | Sửa tên hiển thị, đổi vai trò |
| `POST /users/{user_id}/lock` | Superadmin | Đặt `is_locked`, hủy mọi phiên của tài khoản đó |
| `POST /users/{user_id}/unlock` | Superadmin | Bỏ `is_locked` |
| `GET /users/{user_id}/sessions` | Superadmin | Phân trang cursor |
| `DELETE /user-sessions/{user_session_id}` | Superadmin | Thu hồi phiên |

- Sai tên đăng nhập, sai mật khẩu và tài khoản đang khóa trả cùng một lỗi `401 unauthenticated`. Khi tài khoản không tồn tại vẫn chạy một lần kiểm băm giả để thời gian phản hồi không lộ tài khoản nào có thật.
- Vượt ngưỡng đăng nhập sai trả `429 rate_limited` kèm header `Retry-After`.
- Tên đăng nhập trùng trả `409 conflict`.
- Superadmin không đổi vai trò của chính mình và không khóa chính mình, trả `403 forbidden`: [authorization.md](../../security/authorization.md).
- Response không bao giờ chứa `password_hash`, `session_hash`.

## 🔄 Module `audit_log`

- Hàm ghi nhận `action`, `user_id`, `resource_type`, `resource_id`, `detail`, `ip_address`.
- `GET /audit-logs` cho Superadmin và Admin, phân trang cursor, lọc theo `user_id`, `action`, `created_at_from`, `created_at_to`.
- Tên `action` viết snake_case: `login_succeeded`, `login_failed`, `logout`, `password_changed`, `user_created`, `user_updated`, `user_role_changed`, `user_locked`, `user_unlocked`, `session_revoked`, `permission_denied`.
- ❌ Không ghi mật khẩu, session ID, token vào `detail`: [logging.md](../../../.claude/rules/logging.md).

## 🔄 Phân trang cursor

Theo [api/architecture.md](../../api/architecture.md): keyset theo trường sắp xếp kèm `id`, `limit` mặc định 50 và tối đa 200, trả `items`, `next_cursor`, `total`, `total_is_estimate`. Cursor sai định dạng trả `400 bad_request`. Bảng của đợt 2 nhỏ nên `total` đếm chính xác.

## 🔄 Ngưỡng vận hành

Đặt hàm đọc `system_setting` trong `core`, cache trong tiến trình 60 giây, thiếu tên thiết lập thì dùng giá trị mặc định của [configuration.md](../../ops/configuration.md). Đợt 2a dùng 5 tên thiết lập: `session_idle_timeout_minutes`, `session_absolute_timeout_hours`, `login_max_failures_per_account`, `login_max_failures_per_ip`, `login_failure_window_minutes`.

## 🔄 Lệnh `bootstrap`

1. Đọc `RECONOS_BOOTSTRAP_ADMIN_USERNAME`, `RECONOS_BOOTSTRAP_ADMIN_PASSWORD`.
2. Bảng `user` đã có dòng: ghi log rồi thoát với mã 0, không sửa gì.
3. Bảng rỗng mà thiếu biến: ghi log `critical`, thoát với mã khác 0.
4. Bảng rỗng và đủ biến: kiểm chính sách mật khẩu, tạo tài khoản Superadmin, ghi `audit_log` với `user_id` rỗng.

## ✍️ Test bắt buộc

- `core/security.py` đạt 100% phủ nhánh.
- Mỗi endpoint gọi bằng 4 trạng thái: Superadmin, Admin, User, chưa đăng nhập.
- Đăng nhập: đúng, sai mật khẩu, sai tên đăng nhập, tài khoản khóa, vượt ngưỡng theo tài khoản, vượt ngưỡng theo IP.
- Phiên: hết hạn không hoạt động, hết hạn tuyệt đối, khóa tài khoản hủy mọi phiên, đổi mật khẩu hủy mọi phiên khác.
- CSRF: `Origin` khác, `Sec-Fetch-Site` là `cross-site`, thiếu cả hai header kèm cookie phiên.
- Cookie: scheme https sinh `__Host-` kèm `Secure`, scheme http sinh tên không tiền tố.
- Chính sách mật khẩu: ngắn hơn 12 ký tự, dài hơn 128 ký tự, điểm zxcvbn dưới 3, mật khẩu chứa tên đăng nhập.
- Nhật ký: mỗi `action` ghi đúng một dòng. Dòng của lần đăng nhập sai và của yêu cầu bị từ chối vẫn còn sau khi request rollback.
- Quản trị tài khoản: Superadmin đổi vai trò của chính mình và khóa chính mình đều trả `403`.
- `bootstrap`: chạy lần đầu tạo tài khoản, chạy lại không sửa tài khoản đã có, thiếu biến thì thoát với mã khác 0.

## 🔍 Tiêu chí hoàn thành

- `make lint` và `make test` chạy đạt.
- `make test-coverage` đạt 100% nhánh cho `backend/app/core/security.py`.
- `openapi.yaml` sinh từ FastAPI khớp 13 endpoint của đợt này.
- `make bootstrap` tạo được tài khoản Superadmin trên CSDL phát triển.

## ⛔ Ngoài phạm vi

| Việc | Thuộc về |
|---|---|
| Màn hình S01, S12, bảng màu sáng của design system, nợ 4, nợ 11, nợ 17 | Spec 2b |
| Test E2E luồng đăng nhập | Spec 2b |
| Hàm lọc theo program nối vào bảng `program_user` | Đợt 3 |
| Test User gọi tài nguyên program chưa gán trả `404` | Đợt 3, khi đã có tài nguyên thuộc program |
| Bảng `worker`, `worker_token` do module `user` sở hữu | Đợt 4 |
| Endpoint sửa `system_setting` trên giao diện | Đợt 10 |
| MFA (Multi-Factor Authentication) | Sau phiên bản đầu, nợ 3 |


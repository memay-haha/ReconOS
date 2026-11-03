# Xác thực

> Phiên bản: 1.1 · Ngày: 2026-11-03 · Trạng thái: 🟢 Xong
> Mục 7: Xác thực
> Liên quan: [system.md](../architecture/system.md), [authorization.md](authorization.md), [modules.md](../architecture/modules.md)

## 📌 Đây là gì

- Cơ chế xác định danh tính của hai loại chủ thể gọi Backend API: tài khoản đăng nhập qua trình duyệt và worker.
- Gồm đăng nhập, phiên, chính sách mật khẩu, token worker.

## 🎯 Dùng để làm gì

- Chỉ tài khoản và worker đã xác thực mới gọi được Backend API (G7).
- Làm nền cho phân quyền theo vai trò: [authorization.md](authorization.md).

## ⏰ Dùng khi nào

- Viết endpoint mới, thêm kênh giao tiếp mới, cấu hình cookie và reverse proxy.
- Không dùng để tra ai được làm gì: xem [authorization.md](authorization.md).

## 📍 Ở đâu

- Mã: `backend/app/core/security.py`, module `user`. Phía worker: `workers/worker/client.py`.
- Màn hình: S01 đăng nhập, S12 tài khoản và phiên.

## ⚙️ Làm như thế nào

### Chủ thể và cơ chế

| Chủ thể | Cơ chế | Kênh |
|---|---|---|
| Tài khoản | Tên đăng nhập và mật khẩu, rồi dùng phiên phía server gắn với cookie | HTTPS, WSS (WebSocket Secure) từ trình duyệt |
| Worker | Token riêng cho từng worker, gửi trong header `Authorization: Bearer` | HTTPS từ vùng worker |

- Celery Beat, dispatcher, tiến trình nền không gọi Backend API: [system.md](../architecture/system.md).

### Tài khoản

- Chỉ Superadmin tạo tài khoản. ❌ Không cho tự đăng ký.
- Mỗi tài khoản có đúng một vai trò: [glossary](../appendix/glossary.md).
- Mật khẩu băm bằng Argon2id. ❌ Không lưu, không log mật khẩu ở dạng bản rõ.
- Superadmin khóa được tài khoản. Khóa tài khoản thì mọi phiên của tài khoản đó bị hủy ngay.
- Tài khoản Superadmin đầu tiên tạo bằng lệnh `bootstrap`, đọc tên đăng nhập và mật khẩu từ biến môi trường: [configuration.md](../ops/configuration.md). Lệnh chỉ tạo khi bảng `user` chưa có dòng nào. Chạy lại không sửa tài khoản đã có trong CSDL.

### Chính sách mật khẩu

| Quy tắc | Giá trị |
|---|---|
| Độ dài tối thiểu | 12 ký tự |
| Độ dài tối đa cho phép | Không thấp hơn 64 ký tự |
| Bắt buộc loại ký tự: chữ hoa, ký tự đặc biệt | ❌ Không áp dụng |
| Mật khẩu yếu, mật khẩu phổ biến | Từ chối khi điểm zxcvbn dưới 3. Thư viện chấm điểm chạy cục bộ, không gọi dịch vụ ngoài |
| Đổi mật khẩu định kỳ | ❌ Không bắt buộc |
| Dán mật khẩu, trình quản lý mật khẩu | ✅ Cho phép |

- Đổi mật khẩu phải nhập mật khẩu hiện tại. Đổi xong thì hủy mọi phiên khác của tài khoản.
- Chính sách theo OWASP (Open Worldwide Application Security Project) ASVS (Application Security Verification Standard). Nguồn: [references.md](../appendix/references.md).

### Đăng nhập

1. Trình duyệt gửi tên đăng nhập và mật khẩu tới Backend API qua reverse proxy.
2. Backend kiểm tra giới hạn đăng nhập sai theo tài khoản và theo IP. Vượt giới hạn thì từ chối tạm thời.
3. Backend so mật khẩu với giá trị băm. Sai tên đăng nhập hay sai mật khẩu đều trả cùng một thông báo.
4. Mật khẩu đúng thì backend tạo phiên mới, đặt cookie phiên.
5. Backend ghi nhật ký thao tác cho mọi lần đăng nhập thành công và thất bại.

- Ngưỡng giới hạn đăng nhập sai: [configuration.md](../ops/configuration.md).
- Mỗi lần đăng nhập sai ghi một dòng vào bảng `login_attempt`, đếm theo tài khoản và theo IP trong cửa sổ đếm. Đăng nhập đúng thì xóa dòng của tài khoản đó: [schema.md](../data/schema.md).

### Phiên

| Thuộc tính | Giá trị |
|---|---|
| Nơi lưu | PostgreSQL. Cookie chỉ chứa session ID |
| Session ID | Ngẫu nhiên từ CSPRNG (Cryptographically Secure Pseudo-Random Number Generator), tối thiểu 128 bit. CSDL lưu giá trị băm |
| Cookie | `HttpOnly`, `SameSite=Lax`. Scheme của `RECONOS_PUBLIC_ORIGIN` là https thì thêm `Secure` và tiền tố `__Host-`, là http thì bỏ cả hai vì trình duyệt không nhận cookie `__Host-` trên http |
| Hết hạn | Theo thời gian không hoạt động và theo thời hạn tối đa tính từ lúc đăng nhập. Giá trị: [configuration.md](../ops/configuration.md) |

- Đăng nhập luôn tạo session ID mới.
- Production luôn chạy sau reverse proxy có TLS nên cookie luôn mang `Secure` và tiền tố `__Host-`: [deployment.md](../ops/deployment.md).
- Đăng xuất xóa phiên ở CSDL và xóa cookie.
- Superadmin xem và thu hồi phiên của mọi tài khoản trên S12.
- Frontend và Backend API cùng domain qua reverse proxy, nên trình duyệt gửi cookie tới cả hai.
- Khi render phía server, Next.js chuyển tiếp cookie của trình duyệt tới Backend API. Next.js không đọc, không lưu nội dung phiên.
- Backend xác thực kết nối WebSocket bằng cookie phiên lúc bắt tay, kiểm tra header `Origin`.
- Chống CSRF (Cross-Site Request Forgery) cho endpoint thay đổi dữ liệu: [api/architecture.md](../api/architecture.md).

### Token worker

1. Superadmin tạo token cho một worker, đặt tên theo máy worker.
2. Token hiển thị một lần duy nhất khi tạo. CSDL chỉ lưu giá trị băm.
3. Worker đọc token từ biến môi trường, gửi trong header `Authorization: Bearer`.
4. Token chỉ gọi được endpoint của contract worker: báo trạng thái job, upload output thô.
5. Backend ghi worker nào đã gửi output thô vào metadata của output thô đó để truy vết.
6. Superadmin thu hồi token khi lộ hoặc khi ngừng dùng máy worker. Xoay vòng token bằng cách tạo token mới rồi thu hồi token cũ.

- Backend ghi nhật ký thao tác khi tạo, thu hồi token.
- Endpoint của contract worker: [external-services.md](../integrations/external-services.md). Quản lý thông tin xác thực trên worker: [configuration.md](../ops/configuration.md).

### Chưa hỗ trợ

| Tính năng | Ghi ở |
|---|---|
| MFA (Multi-Factor Authentication) bằng TOTP (Time-based One-Time Password) | [roadmap.md](../roadmap.md), [tech-debt.md](../tech-debt.md) |
| API key cá nhân cho tài khoản | [roadmap.md](../roadmap.md) |

- ⚠️ Chưa có MFA nên xác thực chưa đạt mục tiêu ASVS L2 trong [overview](../architecture/overview.md).

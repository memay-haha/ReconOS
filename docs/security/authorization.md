# Phân quyền

> Phiên bản: 1.14 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt
> Mục 8: Phân quyền
> Liên quan: [authentication.md](authentication.md), [modules.md](../architecture/modules.md), [business-flow.md](../architecture/business-flow.md), [overview.md](../architecture/overview.md), [ADR xóa mềm](../decisions/adr-soft-delete.md)

## 📌 Đây là gì

- Quy định chủ thể đã xác thực được làm gì trên tài nguyên nào: ba vai trò Superadmin, Admin, User và token worker.
- Gồm ma trận quyền và cách Backend API kiểm tra quyền.

## 🎯 Dùng để làm gì

- Phân quyền theo vai trò bằng RBAC (Role-Based Access Control), tách dữ liệu theo program (G7).
- Bắt buộc hai người cho job nhóm khai thác: người tạo không tự duyệt (G5).

## ⏰ Dùng khi nào

- Viết endpoint, sự kiện WebSocket, màn hình mới. Thêm vai trò hoặc thao tác.
- Không dùng để tra cách đăng nhập và phiên: xem [authentication.md](authentication.md).

## 📍 Ở đâu

- Mã: `backend/app/core/security.py`, module `user`. Bảng gán User vào program: [database.md](../data/database.md).
- Màn hình quản lý tài khoản và vai trò: S12, chỉ Superadmin. Nhật ký thao tác: S14, Superadmin và Admin. S14 tách khỏi S12 vì mọi endpoint khác của S12 chỉ Superadmin, nên Admin mở S12 chỉ thấy lỗi. Gán User vào program: S09.

## ⚙️ Làm như thế nào

### Vai trò

| Vai trò | Phạm vi dữ liệu | Tóm tắt |
|---|---|---|
| Superadmin | Toàn hệ thống | Mọi quyền của Admin, cộng quyền quản trị tài khoản, tool module, engine, token worker, cấu hình |
| Admin | Toàn hệ thống | Vận hành nghiệp vụ: program, scope, job, duyệt, triage, báo cáo, gán User vào program |
| User | Program được gán | Xem dữ liệu, tạo job, triage, tạo báo cáo trên program được gán |

- Mỗi tài khoản có đúng một vai trò.
- User chỉ thấy program được gán và dữ liệu thuộc program đó: scope, tài sản, job, output thô, finding, báo cáo.
- User chỉ thao tác trên job mình tạo: hủy, thử lại. ❌ Không thao tác trên job của tài khoản khác.

### Ma trận quyền

✅ được phép, ❌ không được phép.

| Thao tác | Superadmin | Admin | User |
|---|---|---|---|
| Quản lý tài khoản, đổi vai trò, khóa tài khoản | ✅ trừ vai trò và trạng thái khóa của chính mình | ❌ | ❌ |
| Xóa mềm tài khoản | ✅ trừ chính mình | ❌ | ❌ |
| Xem, thu hồi phiên của tài khoản khác. Thu hồi mọi phiên của chính mình trừ phiên đang dùng | ✅ | ❌ | ❌ |
| Xem ma trận quyền, xuất danh sách tài khoản | ✅ | ❌ | ❌ |
| Cấu hình tool module, engine trên S16, S17, S18 | ✅ | ❌ | ❌ |
| Tạo, thu hồi token worker | ✅ | ❌ | ❌ |
| Sửa cấu hình hệ thống: ngưỡng vận hành trong `system_setting` | ✅ | ❌ | ❌ |
| Đọc ngưỡng vận hành có cột Đọc công khai trong [configuration.md](../ops/configuration.md) | ✅ | ✅ | ✅ |
| Chạy chẩn đoán, xem danh sách công cụ trên S15 | ✅ | ✅ | ❌ |
| Tạo, sửa, tạm dừng, lưu trữ program | ✅ | ✅ | ❌ |
| Xóa cứng program | ✅ | ❌ | ❌ |
| Quản lý proxy, lịch quét định kỳ của program, chạy ngay một lịch | ✅ | ✅ | ❌ |
| Thêm, sửa, xóa scope rule | ✅ | ✅ | ❌ |
| Gán, bỏ gán User vào program | ✅ | ✅ | ❌ |
| Xem danh sách tài khoản rút gọn: `id`, `username`, `role` | ✅ | ✅ | ❌ |
| Xem program, scope, lịch quét định kỳ, tài sản, screenshot, tìm toàn cục | ✅ | ✅ | ✅ chỉ program được gán |
| Xóa mềm domain, screenshot | ✅ | ✅ | ❌ |
| Gắn, gỡ tag tài sản, kể cả hàng loạt | ✅ | ✅ | ✅ chỉ program được gán |
| Tạo tag trong danh mục dùng chung | ✅ | ✅ | ✅ |
| Xóa tag khỏi danh mục, gỡ khỏi mọi tài sản | ✅ | ✅ | ❌ |
| Lưu, xóa bộ lọc đã lưu | ✅ chỉ của mình | ✅ chỉ của mình | ✅ chỉ của mình |
| Tạo job | ✅ | ✅ | ✅ chỉ program được gán |
| Thử lại job, kể cả hàng loạt | ✅ | ✅ | ✅ chỉ job mình tạo |
| Duyệt, từ chối job nhóm khai thác | ✅ trừ job mình tạo | ✅ trừ job mình tạo | ❌ |
| Hủy job | ✅ | ✅ | ✅ chỉ job mình tạo |
| Xem hàng đợi, trạng thái dispatcher | ✅ | ✅ | ✅ job thuộc program được gán |
| Dispatch Now, Dispatch All, Cleanup hàng đợi | ✅ | ✅ | ❌ |
| Xem, tải output thô | ✅ | ✅ | ✅ chỉ program được gán |
| Parse lại output thô | ✅ | ✅ | ❌ |
| Triage finding | ✅ | ✅ | ✅ chỉ program được gán |
| Gắn, gỡ tag finding | ✅ | ✅ | ✅ chỉ program được gán |
| Tạo báo cáo, đánh dấu đã nộp | ✅ | ✅ | ✅ chỉ program được gán |
| Xem nhật ký thao tác trên S14 | ✅ | ✅ | ❌ |
| Xem log ứng dụng | ✅ | ✅ | ✅ log của job thuộc program được gán |
| Xóa log ứng dụng trên S15 | ✅ | ❌ | ❌ |
| Xem dashboard | ✅ | ✅ | ✅ số liệu của program được gán |

- Token worker không mang vai trò. Token chỉ gọi được endpoint của contract worker: [authentication.md](authentication.md).

### Kiểm tra quyền

1. Mặc định từ chối. Endpoint không khai báo quyền thì không ai gọi được.
2. Mỗi endpoint khai báo quyền cần có qua dependency của FastAPI trong `core/security.py`.
3. Tài nguyên thuộc program: backend kiểm tra User được gán vào program của tài nguyên đó. Truy vấn danh sách luôn lọc theo program được gán.
4. Với tài nguyên ngoài phạm vi của User, backend trả lỗi giống khi tài nguyên không tồn tại, để không lộ tài nguyên đó có tồn tại.
5. Duyệt job: backend so người duyệt với người tạo job. Trùng thì từ chối, kể cả Superadmin.
6. Hủy, thử lại job với vai trò User: backend so tài khoản gọi với người tạo job. Khác thì trả `403 forbidden`.
7. Quản trị tài khoản: Superadmin không đổi vai trò của chính mình, không khóa, không xóa chính mình, để hệ thống luôn còn người quản trị tài khoản.
8. WebSocket: chỉ đẩy sự kiện thuộc program mà tài khoản được xem. Sự kiện không thuộc program nào, ví dụ worker đổi trạng thái, chỉ đẩy cho Superadmin, Admin. Đổi vai trò, gán hoặc bỏ gán program: áp dụng ngay từ sự kiện tiếp theo trên kết nối đang mở.
9. Frontend ẩn nút theo vai trò chỉ để tiện dùng. ❌ Không dựa vào frontend để phân quyền.

- Mã lỗi khi bị từ chối: [api/architecture.md](../api/architecture.md).

### Ghi nhật ký thao tác

Backend luôn ghi nhật ký thao tác cho các thao tác sau (G7):

- Tạo, sửa, khóa, xóa mềm tài khoản. Đổi vai trò. Thu hồi phiên.
- Tạo, sửa, tạm dừng, tiếp tục, lưu trữ, xóa cứng program, kể cả hàng loạt.
- Thêm, sửa, xóa proxy. `detail` chỉ ghi tên proxy hoặc tên trường đã đổi, không ghi URL.
- Xóa mềm domain, screenshot.
- Dispatch Now, Dispatch All, Cleanup hàng đợi, chạy ngay một lịch.
- Tạo lần chẩn đoán.
- Gán, bỏ gán User vào program.
- Thêm, sửa, xóa scope rule.
- Tạo, duyệt, từ chối, hủy job.
- Đổi trạng thái triage.
- Tải nội dung output thô. Parse lại output thô.
- Tạo, xóa tag. Gắn, gỡ tag tài sản, finding.
- Xóa log ứng dụng.
- Tạo, thu hồi token worker. Sửa cấu hình tool module, engine, hệ thống.
- Yêu cầu bị từ chối vì thiếu quyền, chỉ với phương thức thay đổi dữ liệu `POST`, `PUT`, `PATCH`, `DELETE`. Yêu cầu đọc bị từ chối không ghi dòng nào: nhật ký chỉ thêm dòng và chưa có thời hạn giữ.

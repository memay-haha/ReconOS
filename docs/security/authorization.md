# Phân quyền

> Phiên bản: 1.1 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 8: Phân quyền
> Liên quan: [authentication.md](authentication.md), [modules.md](../architecture/modules.md), [business-flow.md](../architecture/business-flow.md), [overview.md](../architecture/overview.md)

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
- Màn hình quản lý tài khoản và vai trò: S12. Gán User vào program: S09.

## ⚙️ Làm như thế nào

### Vai trò

| Vai trò | Phạm vi dữ liệu | Tóm tắt |
|---|---|---|
| Superadmin | Toàn hệ thống | Mọi quyền của Admin, cộng quyền quản trị tài khoản, tool module, engine, token worker, cấu hình |
| Admin | Toàn hệ thống | Vận hành nghiệp vụ: program, scope, job, duyệt, triage, báo cáo, gán User vào program |
| User | Program được gán | Xem dữ liệu, tạo job, triage, tạo báo cáo trên program được gán |

- Mỗi tài khoản có đúng một vai trò.
- User chỉ thấy program được gán và dữ liệu thuộc program đó: scope, tài sản, job, output thô, finding, báo cáo.

### Ma trận quyền

✅ được phép, ❌ không được phép.

| Thao tác | Superadmin | Admin | User |
|---|---|---|---|
| Quản lý tài khoản, đổi vai trò, khóa tài khoản | ✅ | ❌ | ❌ |
| Xem, thu hồi phiên của tài khoản khác | ✅ | ❌ | ❌ |
| Cấu hình tool module, engine trên S16, S17, S18 | ✅ | ❌ | ❌ |
| Tạo, thu hồi token worker | ✅ | ❌ | ❌ |
| Sửa cấu hình hệ thống: ngưỡng vận hành trong `system_setting` | ✅ | ❌ | ❌ |
| Tạo, sửa, tạm dừng, lưu trữ program | ✅ | ✅ | ❌ |
| Xóa cứng program | ✅ | ❌ | ❌ |
| Quản lý proxy, lịch quét định kỳ của program | ✅ | ✅ | ❌ |
| Thêm, sửa, xóa scope rule | ✅ | ✅ | ❌ |
| Gán, bỏ gán User vào program | ✅ | ✅ | ❌ |
| Xem program, scope, tài sản, screenshot | ✅ | ✅ | ✅ chỉ program được gán |
| Tạo job, thử lại job | ✅ | ✅ | ✅ chỉ program được gán |
| Duyệt, từ chối job nhóm khai thác | ✅ trừ job mình tạo | ✅ trừ job mình tạo | ❌ |
| Hủy job | ✅ | ✅ | ✅ chỉ job mình tạo |
| Xem hàng đợi, trạng thái dispatcher | ✅ | ✅ | ✅ job thuộc program được gán |
| Xem, tải output thô | ✅ | ✅ | ✅ chỉ program được gán |
| Triage finding | ✅ | ✅ | ✅ chỉ program được gán |
| Tạo báo cáo, đánh dấu đã nộp | ✅ | ✅ | ✅ chỉ program được gán |
| Xem nhật ký thao tác | ✅ | ✅ | ❌ |
| Xem log ứng dụng | ✅ | ✅ | ✅ log của job thuộc program được gán |
| Xem dashboard | ✅ | ✅ | ✅ số liệu của program được gán |

- Token worker không mang vai trò. Token chỉ gọi được endpoint của contract worker: [authentication.md](authentication.md).

### Kiểm tra quyền

1. Mặc định từ chối. Endpoint không khai báo quyền thì không ai gọi được.
2. Mỗi endpoint khai báo quyền cần có qua dependency của FastAPI trong `core/security.py`.
3. Tài nguyên thuộc program: backend kiểm tra User được gán vào program của tài nguyên đó. Truy vấn danh sách luôn lọc theo program được gán.
4. Với tài nguyên ngoài phạm vi của User, backend trả lỗi giống khi tài nguyên không tồn tại, để không lộ tài nguyên đó có tồn tại.
5. Duyệt job: backend so người duyệt với người tạo job. Trùng thì từ chối, kể cả Superadmin.
6. WebSocket: chỉ đẩy sự kiện thuộc program mà tài khoản được xem.
7. Frontend ẩn nút theo vai trò chỉ để tiện dùng. ❌ Không dựa vào frontend để phân quyền.

- Mã lỗi khi bị từ chối: [api/architecture.md](../api/architecture.md).

### Ghi nhật ký thao tác

Backend luôn ghi nhật ký thao tác cho các thao tác sau (G7):

- Tạo, sửa, khóa tài khoản. Đổi vai trò. Thu hồi phiên.
- Lưu trữ, xóa cứng program.
- Gán, bỏ gán User vào program.
- Thêm, sửa, xóa scope rule.
- Tạo, duyệt, từ chối, hủy job.
- Đổi trạng thái triage.
- Tạo, thu hồi token worker. Sửa cấu hình tool module, engine, hệ thống.
- Yêu cầu bị từ chối vì thiếu quyền.

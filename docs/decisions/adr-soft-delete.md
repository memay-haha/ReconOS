# ADR: Xóa mềm tài khoản, domain, screenshot

> Trạng thái: 🔵 Proposed · Ngày: 2026-11-12

## 🧭 Bối cảnh

- Mockup có nút Delete User trên S12, Delete domain trên S04, S05, Delete trên S07. [database.md](../data/database.md) bản 1.3 quy định tài khoản chỉ khóa, tài sản không xóa riêng lẻ.
- Nhiều bảng tham chiếu `user` qua cột người thực hiện. Domain là nguồn của URL, finding, sự kiện tài sản. Xóa cứng phải xóa dây chuyền hoặc bị khóa ngoại chặn.
- Output thô là bằng chứng gốc, không được mất khi người dùng dọn danh sách (G8).
- Người dùng chọn phương án A của mục D5 trong [sổ quyết định 2026-11-11](../superpowers/specs/2026-11-11-stitch-fidelity-decisions.md), ngày 2026-11-12.

## ✅ Quyết định

- Thêm cột `deleted_at` cho `user`, `domain`, `screenshot`. Có giá trị: dòng đã xóa mềm.
- Danh sách, tìm kiếm, số liệu tổng hợp bỏ dòng đã xóa mềm. Đọc chi tiết dòng đã xóa mềm trả `404`.
- Tài khoản đã xóa mềm: không đăng nhập được, mọi phiên bị thu hồi, giữ nguyên liên kết người thực hiện. `username` vẫn giữ ràng buộc duy nhất nên không dùng lại được.
- Output thô, job, finding, URL, sự kiện tài sản liên quan giữ nguyên.
- Parser gặp lại dòng đã xóa mềm theo khóa tự nhiên: cập nhật `last_seen_at`, giữ `deleted_at`.
- Quyền: xóa tài khoản chỉ Superadmin, xóa domain và screenshot Superadmin, Admin. Mọi lần xóa ghi nhật ký thao tác (G7). Chi tiết: [authorization.md](../security/authorization.md).
- Program giữ cơ chế lưu trữ và xóa cứng sẵn có: [database.md](../data/database.md).

## ❌ Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Xóa cứng khi không còn tham chiếu, ngược lại trả `409` | Domain có finding hoặc URL thì không xóa được, tức phần lớn domain. Nút Delete gần như luôn lỗi |
| Không làm nút xóa | Lệch mockup ở S04, S05, S07, S12 |
| Xóa cứng dây chuyền | Mất output thô và finding làm bằng chứng, trái G8 |

## ⚖️ Hệ quả

Mọi truy vấn đọc `user`, `domain`, `screenshot` phải lọc `deleted_at IS NULL`, nên bộ lọc này đặt ở một hàm dùng chung của từng module thay vì viết lại ở mỗi truy vấn. Dòng đã xóa mềm vẫn chiếm chỗ trong ràng buộc duy nhất, vì vậy parser không tạo lại domain đã xóa và domain đó không hiện lại sau lần quét sau.

- ✅ Nút xóa trên mockup dựng được mà không mất bằng chứng.
- ⚠️ Chưa có thao tác khôi phục trên UI. Khôi phục làm bằng tay trong CSDL.
- ⚠️ Index của ba bảng nên là index từng phần trên `deleted_at IS NULL` để danh sách không quét dòng đã xóa.

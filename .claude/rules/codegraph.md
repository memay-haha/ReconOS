# Dùng CodeGraph

> Phiên bản: 1.0 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt

CodeGraph parse mã trong `backend/`, `frontend/`, `workers/`, `contracts/` thành đồ thị symbol lưu ở `.codegraph/`, không gọi LLM. Dùng để tra quan hệ gọi hàm trước và sau khi sửa mã. Hiểu kiến trúc tổng thể: [understand-anything.md](understand-anything.md).

## ✅ Bắt buộc

- Chạy `codegraph sync` trước lần tra cứu đầu tiên của lượt và sau mỗi lần sửa mã.
- Tìm định nghĩa symbol: `codegraph query <tên>`.
- Tìm chuỗi trong tài liệu, cấu hình: dùng `grep`.
- Tìm hiểu khu vực mã chưa đọc: chạy `codegraph explore <từ khóa>` trước khi mở từng file.
- Trước khi đổi chữ ký hàm, đổi hành vi hoặc xóa symbol: chạy `codegraph impact <symbol>`. Liệt kê nơi bị ảnh hưởng.
- Sau khi sửa mã: chạy `codegraph affected <file>` để chọn test cần chạy trong lúc làm.
- Giao việc cho subagent: yêu cầu subagent chạy `codegraph explore` theo [agentmemory.md](agentmemory.md).

## ❌ Cấm

- Kết luận symbol không có nơi gọi khi chưa chạy `codegraph sync`.
- Dùng `codegraph affected` thay cho `make test` trước khi báo xong.
- Commit `.codegraph/`.

## 💡 Ví dụ

```bash
codegraph impact AppError                       # 53 symbol bị ảnh hưởng
codegraph affected backend/app/core/errors.py   # 20 file test
```

## 🔍 Cách kiểm tra

```bash
codegraph status   # Files khác 0, có dòng "Index is up to date"
```

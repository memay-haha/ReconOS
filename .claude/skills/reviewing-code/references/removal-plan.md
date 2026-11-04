# Kế hoạch xóa code và lặp tiếp

Dùng khi review phát hiện code không dùng, thừa, hoặc nằm sau feature flag đã tắt. Phân biệt mục xóa ngay an toàn với mục phải hoãn kèm kế hoạch, rồi đưa kế hoạch tiếp theo có bước cụ thể và điểm kiểm tra (test, chỉ số).

## Mức ưu tiên

Mức ưu tiên dùng chung thang P0-P3 của skill, áp cho thời điểm xóa:

- [ ] P0: xóa ngay (rủi ro bảo mật, tốn chi phí đáng kể, chặn việc khác).
- [ ] P1: xóa trong sprint hiện tại.
- [ ] P2: đưa vào backlog, xóa ở vòng lặp sau.

## Xóa ngay an toàn

### Mục: [Tên hoặc mô tả]

| Trường | Nội dung |
|---|---|
| Vị trí | `path/to/file.ts:line` |
| Lý do | Vì sao nên xóa |
| Bằng chứng | Không có tham chiếu, feature flag chết, API đã deprecated |
| Ảnh hưởng | Không có hoặc thấp, không còn bên dùng |
| Bước xóa | 1. Xóa code. 2. Xóa test. 3. Xóa cấu hình |
| Xác minh | Chạy test, kiểm tra không có lỗi lúc chạy, theo dõi log |

## Hoãn xóa (cần kế hoạch)

### Mục: [Tên hoặc mô tả]

| Trường | Nội dung |
|---|---|
| Vị trí | `path/to/file.ts:line` |
| Lý do hoãn | Còn bên dùng, cần migration, cần bên liên quan đồng ý |
| Điều kiện trước | Feature flag tắt đủ 2 tuần, telemetry cho thấy 0 lượt dùng |
| Breaking change | Liệt kê thay đổi API hoặc contract |
| Kế hoạch migration | Các bước để bên dùng chuyển đổi |
| Mốc thời gian | Ngày hoặc sprint mục tiêu |
| Người phụ trách | Người hoặc nhóm chịu trách nhiệm |
| Xác nhận | Chỉ số chứng minh xóa an toàn (tỷ lệ lỗi, số lượt dùng) |
| Kế hoạch rollback | Cách khôi phục khi phát hiện sự cố |

## Kế hoạch tiếp theo

Mỗi mục hoãn cần một kế hoạch có bước cụ thể và điểm kiểm tra:

1. Bước: việc cần làm, ví dụ tắt flag, chuyển bên dùng sang API mới.
2. Điểm kiểm tra: test phải xanh, chỉ số phải đạt (số lượt gọi bằng 0, tỷ lệ lỗi không tăng).
3. Bước kế tiếp chỉ bắt đầu khi điểm kiểm tra trước đã đạt.

## Checklist

- [ ] Đã tìm mọi tham chiếu trong codebase (`rg`, `grep`).
- [ ] Đã kiểm tra cách dùng động hoặc qua reflection.
- [ ] Đã xác minh không có bên dùng ngoài (API, SDK, tài liệu).
- [ ] Đã xem telemetry của feature flag (nếu có).
- [ ] Đã cập nhật hoặc xóa test.
- [ ] Đã cập nhật tài liệu.
- [ ] Đã báo nhóm (nếu là code dùng chung).

# Checklist review nhanh

Dùng để review nhẹ, tra nhanh từng nhóm mục. Review đầy đủ có phân tích kiến trúc và hiệu năng: theo quy trình bốn giai đoạn trong [SKILL.md](../SKILL.md).

## Trước khi review (2 phút)

- [ ] Đọc mô tả PR và issue liên kết.
- [ ] Kiểm tra kích thước PR (lý tưởng <400 dòng).
- [ ] Kiểm tra trạng thái CI/CD (test có qua không?).
- [ ] Hiểu yêu cầu nghiệp vụ.

Diff lớn: chạy `git diff main...HEAD | python3 scripts/pr-analyzer.py` để xem kích thước, độ phức tạp, rủi ro trước khi đọc.

## Kiến trúc và thiết kế (5 phút)

- [ ] Giải pháp hợp với vấn đề.
- [ ] Khớp pattern đang có.
- [ ] Không có cách đơn giản hơn.
- [ ] Mở rộng được khi tải tăng.
- [ ] Thay đổi đặt đúng chỗ.

## Logic và tính đúng (10 phút)

- [ ] Đã xử lý điều kiện biên.
- [ ] Có kiểm tra null/undefined.
- [ ] Đã kiểm tra lỗi off-by-one.
- [ ] Đã xét race condition.
- [ ] Xử lý lỗi đầy đủ.
- [ ] Dùng đúng kiểu dữ liệu.

## Bảo mật (5 phút)

- [ ] Không hard-code secret.
- [ ] Đầu vào đã validate và làm sạch.
- [ ] Đã chặn SQL injection.
- [ ] Đã chặn XSS.
- [ ] Có kiểm tra phân quyền.
- [ ] Dữ liệu nhạy cảm được bảo vệ.

## Hiệu năng (3 phút)

- [ ] Không có N+1 query.
- [ ] Thao tác tốn kém đã tối ưu.
- [ ] Danh sách lớn có phân trang.
- [ ] Không rò rỉ bộ nhớ.
- [ ] Đã cân nhắc cache khi phù hợp.

## Test (5 phút)

- [ ] Code mới có test.
- [ ] Điều kiện biên có test.
- [ ] Trường hợp lỗi có test.
- [ ] Test dễ đọc.
- [ ] Test cho kết quả ổn định (deterministic).

## Chất lượng code (3 phút)

- [ ] Tên biến, hàm rõ ràng.
- [ ] Không lặp code.
- [ ] Mỗi hàm làm một việc.
- [ ] Code phức tạp có comment.
- [ ] Không có magic number.

## Tài liệu (2 phút)

- [ ] API public có tài liệu.
- [ ] README cập nhật khi cần.
- [ ] Breaking change có ghi chú.
- [ ] Logic phức tạp có giải thích.

## Mức nghiêm trọng

| Mức | Nghĩa | Hành động |
|---|---|---|
| P0 🔴 | Nghiêm trọng: lỗ hổng bảo mật, mất dữ liệu, sai logic nghiêm trọng | Chặn merge |
| P1 🔴 | Cao: lỗi logic, vi phạm SOLID đáng kể, suy giảm hiệu năng | Sửa trước merge |
| P2 🟡 | Trung bình: code smell, khó bảo trì | Nên sửa, thảo luận nếu không đồng ý |
| P3 🟢 | Thấp: style, đặt tên, gợi ý nhỏ | Không chặn merge |
| 💡 | Gợi ý cách làm khác | Cân nhắc |
| 📚 | Chia sẻ kiến thức | Không cần hành động |
| 🎉 | Khen | Ghi nhận |

## Ma trận quyết định

| Tình huống | Quyết định |
|---|---|
| Vấn đề bảo mật nghiêm trọng | P0 🔴 chặn merge, sửa ngay |
| Breaking change không có migration | P1 🔴 chặn merge |
| Thiếu xử lý lỗi | P2 🟡 nên sửa |
| Code mới không có test | P2 🟡 nên sửa |
| Sở thích style | P3 🟢 không chặn |
| Cải thiện đặt tên nhỏ | P3 🟢 không chặn |
| Code khéo léo nhưng chạy đúng | 💡 gợi ý cách đơn giản hơn |

## Ngân sách thời gian

Checklist này dành cho review nhanh. Review đầy đủ gồm kiến trúc và hiệu năng: dùng quy trình bốn giai đoạn trong [SKILL.md](../SKILL.md) (19-36 phút). PR nhỏ nghiêng về cận dưới của mỗi giai đoạn, PR lớn nghiêng về cận trên.

| Kích thước PR | Review nhanh | Review đầy đủ (4 giai đoạn) |
|---|---|---|
| < 100 dòng | 10-15 phút | khoảng 19-28 phút |
| 100-400 dòng | 20-40 phút | khoảng 28-36 phút |
| > 400 dòng | Yêu cầu tách | Yêu cầu tách |

## Cờ đỏ

Chú ý các mẫu sau:

- `// TODO` trong code production.
- `console.log` còn sót.
- Code bị comment bỏ.
- Kiểu `any` trong TypeScript.
- Khối `catch` rỗng.
- `unwrap()` trong code Rust production.
- Magic number hoặc magic string.
- Khối code copy-paste.
- Thiếu kiểm tra null.
- URL hoặc thông tin xác thực hard-code.

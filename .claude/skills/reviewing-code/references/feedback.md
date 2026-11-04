# Tư duy người review và cách viết phản hồi

Dùng khi viết nhận xét review, xếp mức nghiêm trọng, xử lý bất đồng với tác giả PR, hoặc khi xây quy trình review cho nhóm.

## Tư duy review

### Mục tiêu

Mục tiêu chính:

- Bắt bug và điều kiện biên trước khi lên production.
- Giữ code dễ bảo trì và dễ đọc.
- Chia sẻ kiến thức trong nhóm.
- Áp chuẩn viết code nhất quán.
- Cải thiện quyết định thiết kế và kiến trúc.

Mục tiêu phụ:

- Kèm cặp dev mới.
- Xây văn hóa nhóm và niềm tin.
- Ghi lại quyết định thiết kế qua thảo luận.

### Review không phải là

- Cơ chế gác cổng để chặn tiến độ.
- Dịp khoe kiến thức.
- Chỗ bắt lỗi định dạng (dùng linter).
- Cách viết lại code theo sở thích cá nhân.

### Phạm vi review

Cần review:

- Tính đúng của logic và điều kiện biên.
- Lỗ hổng bảo mật.
- Ảnh hưởng hiệu năng.
- Độ phủ và chất lượng test.
- Xử lý lỗi.
- Tài liệu và comment.
- Thiết kế API và đặt tên.
- Độ khớp với kiến trúc.

Không review bằng tay:

- Định dạng code (dùng Prettier, Black, ruff format...).
- Thứ tự import.
- Vi phạm lint.
- Lỗi chính tả đơn giản.

## Thời điểm review

### Khi nào review

| Sự kiện | Hành động |
|---|---|
| PR mở | Review trong 24 giờ, tốt nhất trong ngày |
| Tác giả PR đã sửa theo yêu cầu | Review lại trong 4 giờ |
| Phát hiện vấn đề chặn merge | Báo ngay |

### Phân bổ thời gian

- PR nhỏ (<100 dòng): 10-15 phút.
- PR vừa (100-400 dòng): 20-40 phút.
- PR lớn (>400 dòng): yêu cầu tách, hoặc từ 60 phút trở lên.

## Mức độ sâu

### Mức 1: đọc lướt (5 phút)

- Đọc mô tả PR và issue liên kết.
- Kiểm tra trạng thái CI/CD.
- Xem tổng quan file thay đổi.
- Quyết định có cần review sâu hơn không.

### Mức 2: review chuẩn (20-30 phút)

- Đọc hết code.
- Kiểm tra logic.
- Kiểm tra độ phủ test.
- Quét bảo mật.

### Mức 3: review sâu (từ 60 phút)

- Đánh giá kiến trúc.
- Phân tích hiệu năng.
- Audit bảo mật.
- Dò điều kiện biên.

## Phản hồi tốt

Phản hồi tốt có các đặc điểm:

- Cụ thể và làm theo được.
- Mang tính hướng dẫn, không phán xét.
- Nói về code, không nói về người.
- Cân bằng: khen cả phần làm tốt.
- Có thứ tự ưu tiên: phân biệt việc nghiêm trọng với việc có thì tốt.

```markdown
❌ Sai: "Chỗ này sai."
✅ Đúng: "Chỗ này có thể gây race condition khi nhiều người dùng
         truy cập cùng lúc. Cân nhắc dùng mutex ở đây."

❌ Sai: "Sao không dùng pattern X?"
✅ Đúng: "Bạn đã cân nhắc Repository pattern chưa? Pattern này giúp
         phần này dễ test hơn. Ví dụ: [link]"

❌ Sai: "Đổi tên biến này."
✅ Đúng: "P3 Cân nhắc đổi `uc` thành `userCount` cho rõ.
         Không chặn merge nếu bạn muốn giữ nguyên."
```

### Giọng văn

Dùng ngôn ngữ cộng tác:

- "Bạn nghĩ sao về..." thay cho "Bạn phải...".
- "Mình cân nhắc... được không" thay cho "Chỗ này sai".
- "Mình tò mò về..." thay cho "Sao bạn không...".

Cụ thể và làm theo được:

- Kèm ví dụ code khi đề xuất thay đổi.
- Liên kết tới tài liệu hoặc thảo luận trước đó.
- Giải thích lý do đằng sau đề xuất.

## Kỹ thuật review

### Kỹ thuật 1: dùng checklist

Dùng checklist để review nhất quán: [review-checklist.md](../assets/review-checklist.md), [code-quality.md](code-quality.md), [architecture-solid.md](architecture-solid.md).

### Kỹ thuật 2: đặt câu hỏi

Thay vì khẳng định vấn đề, đặt câu hỏi:

```markdown
❌ "Chỗ này lỗi nếu danh sách rỗng."
✅ "Nếu `items` là mảng rỗng thì chuyện gì xảy ra?"

❌ "Bạn cần xử lý lỗi ở đây."
✅ "Nếu gọi API thất bại thì chỗ này nên xử lý thế nào?"
```

### Kỹ thuật 3: gợi ý thay vì ra lệnh

Dùng ngôn ngữ cộng tác:

```markdown
❌ "Bạn phải đổi chỗ này sang async/await"
✅ "Gợi ý: async/await có thể làm chỗ này dễ đọc hơn. Bạn thấy sao?"

❌ "Tách cái này ra thành hàm"
✅ "Logic này xuất hiện ở 3 chỗ. Tách thành hàm riêng có hợp lý không?"
```

### Kỹ thuật 4: phân biệt mức nghiêm trọng

Gắn mức cho mỗi nhận xét. Thang mức thống nhất toàn skill:

| Mức | Nghĩa | Hành động |
|---|---|---|
| P0 🔴 Nghiêm trọng | Lỗ hổng bảo mật, mất dữ liệu, sai logic nghiêm trọng | Chặn merge |
| P1 🔴 Cao | Lỗi logic, vi phạm SOLID đáng kể, suy giảm hiệu năng | Sửa trước merge |
| P2 🟡 Trung bình | Code smell, khó bảo trì | Sửa trong PR hoặc tạo việc tiếp theo, thảo luận nếu không đồng ý |
| P3 🟢 Thấp | Style, đặt tên, gợi ý nhỏ | Tùy chọn, không chặn merge |

Nhãn không phải mức, không chặn merge:

| Nhãn | Nghĩa |
|---|---|
| 💡 | Gợi ý cách làm khác để cân nhắc |
| 📚 | Chia sẻ kiến thức, không cần hành động |
| 🎉 | Khen phần làm tốt |

## Xếp ưu tiên

### Phải sửa (P0, P1)

- Lỗ hổng bảo mật (P0).
- Rủi ro hỏng dữ liệu (P0).
- Breaking change mà không có migration (P1).
- Vấn đề hiệu năng nghiêm trọng (P1).
- Thiếu xử lý lỗi ở tính năng người dùng thấy (P1).

### Nên sửa (P2)

- Thiếu độ phủ test.
- Vấn đề hiệu năng mức vừa.
- Code lặp.
- Đặt tên hoặc cấu trúc chưa rõ.
- Thiếu tài liệu cho logic phức tạp.

### Có thì tốt (P3)

- Sở thích style ngoài phạm vi linter.
- Tối ưu nhỏ.
- Thêm test case.
- Cải thiện tài liệu.

## Xử lý bất đồng

1. Tìm hiểu trước: đặt câu hỏi làm rõ.
2. Ghi nhận điểm đúng: cho thấy đã xét góc nhìn của tác giả PR.
3. Đưa dữ liệu: benchmark, tài liệu, ví dụ.
4. Đưa lên cấp trên khi cần: mời dev senior hoặc kiến trúc sư.
5. Biết khi nào nên dừng: không phải điểm nào cũng đáng tranh đến cùng.

## Anti-pattern trong review

### Của người review

- Rubber stamping: duyệt mà không thực sự đọc.
- Bike shedding: tranh luận dài về chi tiết vặt.
- Scope creep: "Nhân tiện sửa luôn cả..."
- Ghosting: yêu cầu sửa rồi biến mất.
- Perfectionism: chặn merge vì sở thích style nhỏ.

### Của tác giả PR

- Mega PR: gửi thay đổi trên 1000 dòng.
- Thiếu ngữ cảnh: không có mô tả PR hoặc issue liên kết.
- Phản ứng phòng thủ: cãi mọi đề xuất.
- Cập nhật im lặng: sửa code mà không trả lời nhận xét.

## Chỉ số và cải tiến

### Chỉ số cần theo dõi

- Thời gian tới lần review đầu.
- Thời gian một vòng review.
- Số vòng review.
- Tỷ lệ lỗi lọt qua review.
- Tỷ lệ thay đổi có review.

### Cải tiến liên tục

- Họp retrospective về quy trình review.
- Chia sẻ bài học từ bug đã lọt.
- Cập nhật checklist theo vấn đề hay gặp.
- Ghi nhận các lượt review tốt và lỗi bắt được.

## Checklist

- [ ] Mỗi nhận xét có mức P0-P3 hoặc nhãn 💡, 📚, 🎉.
- [ ] Nhận xét cụ thể, có vị trí, có lý do, có đề xuất sửa hoặc ví dụ code.
- [ ] Nói về code, không nói về người. Dùng câu hỏi và gợi ý thay cho mệnh lệnh.
- [ ] Có ít nhất một ghi nhận phần làm tốt khi có.
- [ ] Không nhận xét định dạng, thứ tự import, lỗi lint: để công cụ lo.
- [ ] Không mở rộng phạm vi PR ngoài mục tiêu PR.
- [ ] PR trên 400 dòng: đã đề nghị tách hoặc dành đủ thời gian.

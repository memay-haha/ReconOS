---
name: review-document
description: Review tài liệu ReconOS trong docs/, .claude/rules/, CLAUDE.md. Dùng khi người dùng nói "review", "đánh giá lại", "kiểm tra tài liệu", "còn câu hỏi mở không", hoặc trước khi đề nghị duyệt.
---

# Review tài liệu

Quy tắc: [documentation.md](../../rules/documentation.md). Skill này chỉ mô tả cách review.

## 1. Đọc

- Memory liên quan qua `memory_smart_search`, nhất là nhãn `pending`.
- Tài liệu cần review, `documentation.md`, `vietnamese-writing.md`, glossary và bảng Từ không dùng.
- Dòng của tài liệu trong roadmap, tài liệu ở cột Phụ thuộc, ADR 🟢 Accepted liên quan.
- Mục 🚫 Cấm trong `CLAUDE.md`, mục tiêu G# trong overview.

## 2. Kiểm tra hình thức

- Theo mục 3 đến 6 của `documentation.md`, dùng mục 7 làm danh sách kiểm tra.
- Liên kết: file đích tồn tại. Chưa tồn tại nhưng có trong roadmap thì ghi vào báo cáo, không phải lỗi.
- Roadmap: trạng thái khớp file. Đếm lại từng trạng thái trong bảng rồi so với dòng Tiến độ. Lỗi đã gặp: ghi 26/10 khi bảng có 27/9.
- `grep -n "—\|–"` trên file: không còn kết quả, trừ chỗ trích dẫn trong `documentation.md`.
- Grep từng từ ở cột Không dùng của glossary trên file: không còn kết quả. Bỏ qua chính glossary. Dòng cần hiểu nghĩa, như "khóa", "dependency": rà soát bằng mắt.

## 3. Kiểm tra nội dung

| Câu hỏi | Lỗi đã gặp |
|---|---|
| Thuật ngữ đúng glossary, đúng nghĩa? | "Tài sản cần bảo vệ" trong threat model |
| Mâu thuẫn overview, ADR Accepted, CLAUDE.md? | Parser ở worker, trái G8 |
| Sự kiện đúng thực tế dự án? | "Quy trình hiện tại dùng BBRF" khi chưa từng dùng |
| Lập luận đúng kỹ thuật? | Loại SQLite vì "worker ghi đồng thời", worker không ghi CSDL |
| Câu ngầm chốt câu hỏi mở? | "Dispatcher kiểm tra scope" khi chưa quyết |
| Thông tin chưa kiểm chứng? | Tình trạng phát hành phần mềm bên thứ ba |
| ADR: lý do loại cụ thể, hệ quả có cả mặt mất? | Lý do chung chung "hệ sinh thái nhỏ hơn" |
| Định lượng có số liệu hoặc ghi rõ chưa có? | "Quy mô rất lớn", "giảm rõ rệt", "dữ liệu thử đủ lớn" |
| Thuật ngữ khớp bảng Từ không dùng? | "bí mật", "khóa khử trùng lặp". Agent con đổi "khóa ngoại" sang tiếng Anh |
| Cùng loại nội dung viết cùng một dạng giữa các file? | Tham chiếu ". G1." và "(G1)". Ghi chú roadmap lúc có tiền tố phiên bản, lúc không |

## 4. Rà soát ngôn ngữ bằng agent riêng

Chạy khi tài liệu mới viết, sửa nhiều chỗ, hoặc người dùng yêu cầu rà soát văn phong. Agent có ngữ cảnh mới nên không bỏ qua lỗi theo cách người viết đã bỏ qua.

- Brief chỉ gồm: đường dẫn file, `vietnamese-writing.md`, mục 8 của `documentation.md`, glossary.
- Không đưa kết luận của mình, không đưa danh sách lỗi nghi ngờ.
- Yêu cầu agent chỉ báo, không sửa file. Kết quả dạng bảng: dòng, câu gốc, quy tắc vi phạm, cách viết đề xuất.
- Xét từng điểm agent báo. Điểm trái glossary hoặc quyết định đã chốt: bỏ. Điểm cần quyết định: hỏi người dùng.

## 5. Sửa

- **Tự sửa:** lỗi hình thức, sai thuật ngữ, lỗi lập luận chỉ có một cách sửa.
- **Hỏi người dùng:** quyết định, phạm vi, quy tắc nghiệp vụ, câu ngầm chốt, nội dung tài liệu đã 🟢.
- **Không làm:** chuyển trạng thái 🟢, lưu memory trước khi duyệt.

## 6. Báo cáo

```markdown
**Đã sửa:** <lỗi>: <cũ> → <mới>
**Cần bạn quyết định:** <vấn đề>, <đề xuất>
**Câu hỏi mở:**
| # | Câu hỏi | Chốt ở |
**Trạng thái:** <hiện tại>. <Đủ để duyệt | Cần quyết định trước>
```

- Bỏ mục trống.
- Mỗi câu hỏi mở ghi tài liệu sẽ chốt, theo roadmap. Câu đã có trong memory `pending`: chỉ ghi "đã có trong memory".

## 7. Khi người dùng duyệt

Tín hiệu: "duyệt", "chốt", "xong", "được".

1. Đổi trạng thái file: 🟢 Xong, ADR là 🟢 Accepted.
2. Cập nhật roadmap: Trạng thái, Cập nhật, Tiến độ.
3. Lưu memory theo [agentmemory.md](../../rules/agentmemory.md). Xóa memory `pending` đã giải quyết.
4. Báo số memory lưu, xóa và tài liệu tiếp theo.

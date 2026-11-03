---
name: writing-document
description: Viết tài liệu ReconOS theo documentation-roadmap.md. Dùng khi người dùng nói "viết tài liệu", "viết tiếp", "viết ADR", "xây dựng đề xuất" hoặc nêu tên file trong roadmap.
---

# Viết tài liệu

Quy tắc: [documentation.md](../../rules/documentation.md). Skill này chỉ mô tả cách viết.

## 1. Chọn tài liệu

- Tài liệu người dùng chỉ định, hoặc # nhỏ nhất chưa 🟢 Xong trong roadmap.
- Mọi tài liệu ở cột Phụ thuộc phải 🟢 Xong. Chưa đủ: báo tài liệu đang chặn, dừng.
- Đọc cột Ghi chú.

## 2. Thu thập ngữ cảnh

- Memory liên quan qua `memory_smart_search`, nhất là nhãn `pending`.
- Khung hiện có: chú thích `<!-- -->` là gợi ý nội dung.
- Glossary, nhất là bảng Từ không dùng. Tài liệu ở cột Phụ thuộc, ADR 🟢 Accepted liên quan, mục 🚫 Cấm trong `CLAUDE.md`, G# trong overview.
- Dữ kiện thật: mockup trong `docs/design/screens/`, mã tham khảo trong `_reference/`.

## 3. Hỏi trước khi viết

Tài liệu chỉ ghi điều đã quyết.

- Liệt kê điểm chưa có câu trả lời, hỏi bằng `AskUserQuestion`: tối đa 4 câu, phương án khuyến nghị đặt đầu.
- Dựa câu hỏi trên dữ kiện: "Mockup S15 hiển thị FastAPI, PostgreSQL, Redis. Chốt bộ này không?"
- Người dùng hỏi "tại sao", "cho ví dụ": trả lời cả mặt được và mặt mất, ví dụ bằng program, công cụ, màn hình thật. Kết thúc bằng câu hỏi quyết định.

## 4. Viết

- Đúng mẫu theo loại tài liệu trong `documentation.md`.
- Không viết điều chưa quyết. Điểm thuộc tài liệu sau: liên kết tới tài liệu đó.
- Không có câu ngầm chốt câu hỏi mở.
- Thông tin chưa kiểm chứng: ghi rõ cần kiểm tra.
- Thuật ngữ mới: đề xuất thêm vào glossary, chờ người dùng đồng ý.
- Quyết định mới, kể cả từ thay thế: sửa tài liệu theo [doc-sync.md](../../rules/doc-sync.md).
- ADR: phương án Claude tự thêm ghi "Chưa đánh giá chi tiết". Hệ quả có cả mặt được và mặt mất.

## 5. Giao việc cho agent con

Brief phải có:

- Đường dẫn file cần viết hoặc sửa, phạm vi sửa.
- Liên kết `documentation.md`, `vietnamese-writing.md`, glossary. Ghi rõ: dùng đúng bảng Từ không dùng.
- Câu: "Không đổi thuật ngữ, quyết định đã chốt. Thấy điểm nghi sai thì báo lại, không tự sửa."
- Yêu cầu trả về danh sách thay đổi dạng `<file>:<dòng>: <cũ> → <mới>`.

Khi nhận kết quả:

- Đọc danh sách thay đổi, hoàn tác thay đổi trái glossary hoặc quyết định đã chốt.
- Grep các từ ở cột Không dùng của glossary trên file agent đã sửa.

## 6. Tự rà soát trước khi chuyển 🔵

- Chạy danh sách tự rà soát ở mục 12 của `vietnamese-writing.md`, trừ các điểm ở mục 8 của `documentation.md`.
- `grep -n "—\|–"` trên file: không còn kết quả.
- Grep từng từ ở cột Không dùng của glossary trên file: không còn kết quả. Dòng cần hiểu nghĩa, như "khóa", "dependency": rà soát bằng mắt.
- Câu có "rất", "nhiều", "đáng kể", "rõ rệt", "lớn", "nhỏ": thay bằng số liệu, hoặc ghi chưa có số liệu.
- Cùng loại nội dung viết cùng một dạng với file khác: tham chiếu G#, ghi chú roadmap, tên endpoint.

## 7. Cập nhật

- Viết xong: chuyển 🔵 Chờ duyệt. ADR giữ 🔵 Proposed trong file.
- Cập nhật roadmap: Trạng thái, Cập nhật, Tiến độ.
- Quyết định mới ảnh hưởng tài liệu đã viết: sửa tài liệu đó cùng lúc, tăng phiên bản.

## 8. Bàn giao

1. Chạy skill `review-document` trên tài liệu vừa viết.
2. Báo: nội dung chính, điểm cố ý chưa quyết, điểm cần người dùng xác nhận.
3. Người dùng duyệt: làm theo mục 7 của `review-document`.

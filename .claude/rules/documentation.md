---
paths:
  - "docs/**/*.md"
  - ".claude/rules/*.md"
  - "CLAUDE.md"
  - "*/CLAUDE.md"
---
# Quy tắc viết tài liệu

> Nguồn duy nhất cho quy tắc cấu trúc, trạng thái, icon, trình bày của tài liệu ReconOS. File khác chỉ liên kết tới đây, không chép lại.
> Ngôn ngữ và văn phong: [vietnamese-writing.md](vietnamese-writing.md). Hai file xung đột thì làm theo mục 8 của file này.

## 1. 📂 Phạm vi áp dụng

- Mọi tài liệu mô tả trong `docs/` và file quy tắc trong `.claude/rules/`.
- `CLAUDE.md` ở gốc repo và trong `backend/`, `frontend/`, `workers/`: chỉ áp dụng mục 4 đến 6. Cấu trúc gồm các mục: Cấm, Quy ước, Chỉ mục, Build và test.
- Ngoại lệ về cấu trúc, vẫn áp dụng mục 4 đến 6:
  - ADR trong `docs/decisions/`: mẫu ADR ở mục 3.
  - File quy tắc trong `.claude/rules/`: mẫu rule ở mục 3.
  - `.claude/rules/vietnamese-writing.md`, `.claude/rules/agentmemory.md`: giữ cấu trúc riêng.
  - `.claude/rules/doc-sync.md`: mẫu rule, không có `paths` để luôn được nạp, không có dòng Mục.
  - `docs/architecture/overview.md`: cấu trúc riêng 9 mục, icon theo nhóm Overview ở mục 5.
  - Cột bảng riêng:
    - Glossary: Thuật ngữ, Định nghĩa, Không phải là, Tên trong mã. Riêng mục Từ không dùng: Không dùng, Viết thay, Phạm vi.
    - `docs/appendix/references.md`: Nhóm, Nguồn, Nội dung, Dùng cho.
    - `docs/tech-debt.md`: Nợ, Lý do chấp nhận, Ảnh hưởng, Hướng xử lý, Trạng thái.
    - `docs/roadmap.md`: Giai đoạn, Tính năng, Phụ thuộc, Trạng thái.
    - `docs/documentation-roadmap.md`: bảng theo dõi.

## 2. 🔄 Quy trình

- Viết theo thứ tự cột **#** trong [documentation-roadmap.md](../../docs/documentation-roadmap.md).
- Chỉ bắt đầu một tài liệu khi mọi tài liệu ở cột **Phụ thuộc** đã 🟢 Xong.
- Vòng đời trạng thái: 🔴 Chưa làm → 🟠 Có khung → 🟡 Đang làm → 🔵 Chờ duyệt → 🟢 Xong. ADR bị thay thế: ⚪ Superseded.
- Không tự chuyển trạng thái sang 🟢 Xong. Chỉ người dùng chuyển, sau khi duyệt.
- Mỗi lần đổi trạng thái: cập nhật cột Trạng thái, cột Cập nhật và dòng Tiến độ trong roadmap.
- Khi sửa hành vi hệ thống: cập nhật tài liệu liên quan cùng lúc.
- Quyết định kiến trúc mới: viết ADR mới.
- Không sửa ADR đã chấp nhận. Chuyển ADR đó sang ⚪ Superseded, trỏ tới ADR thay thế.

## 3. 🧱 Cấu trúc file

**Tên file:** kebab-case, mô tả nội dung, không bắt đầu bằng số thứ tự. Chữ hiển thị của liên kết ghi tên nội dung, không ghi số.

**Khối thông tin đầu file:**

```markdown
> Phiên bản: 1.0 · Ngày: YYYY-MM-DD · Trạng thái: 🟡 Đang làm
> Mục <số>: <tên mục>
> Liên quan: <liên kết>
```

**Tài liệu mô tả:** đủ 5 mục, đúng thứ tự.

| # | Mục | Nội dung |
|---|---|---|
| 1 | `## 📌 Đây là gì` | Bản chất, 1 đến 3 câu |
| 2 | `## 🎯 Dùng để làm gì` | Vấn đề giải quyết, liên kết mục tiêu G# trong overview |
| 3 | `## ⏰ Dùng khi nào` | Điều kiện dùng, kèm trường hợp không dùng |
| 4 | `## 📍 Ở đâu` | Thành phần, thư mục mã, bảng CSDL, endpoint, màn hình |
| 5 | `## ⚙️ Làm như thế nào` | Cơ chế, các bước, sơ đồ, bảng. Đây là phần chính |

**ADR:** file `docs/decisions/adr-<tên-quyết-định>.md`.

```markdown
# ADR: <Tên quyết định>
> Trạng thái: 🔵 Proposed | 🟢 Accepted | ⚪ Superseded by [ADR <tên quyết định thay thế>](adr-<tên>.md) · Ngày: YYYY-MM-DD

## 🧭 Bối cảnh
## ✅ Quyết định
## ❌ Phương án đã loại
## ⚖️ Hệ quả
```

**Rule trong `.claude/rules/`:**

```markdown
---
paths:
  - "<glob thư mục áp dụng>"
---
# <Tên quy tắc>
> Phiên bản · Ngày · Trạng thái
> Mục <số>: <tên mục>

## ✅ Bắt buộc
## ❌ Cấm
## 💡 Ví dụ
## 🔍 Cách kiểm tra
```

- Viết quy tắc dạng mệnh lệnh, mỗi dòng một quy tắc kiểm tra được.
- Ví dụ: đoạn đúng và sai, tối đa 10 dòng mỗi đoạn.

## 4. ✍️ Trình bày

- Tài liệu chỉ **mô tả**: không viết đề xuất, không bàn luận.
- Mục 1 đến 4 của tài liệu mô tả: mỗi mục tối đa 5 dòng. Toàn file tối đa 300 dòng, vượt thì tách file.
- Dùng bullet thay đoạn văn dài. Viết lập luận nhân quả thành đoạn văn ngắn: mục 8.
- Dùng bảng cho dữ liệu có cấu trúc, sơ đồ `mermaid` cho luồng.
- Viết tiếng Việt theo [vietnamese-writing.md](vietnamese-writing.md).
- Dùng thuật ngữ nghiệp vụ đúng [glossary](../../docs/appendix/glossary.md).
- Viết tắt trong danh sách miễn của [glossary](../../docs/appendix/glossary.md) không cần ghi tên đầy đủ.
- Đặt danh sách liệt kê sau dấu hai chấm, không đặt trong ngoặc.
- Viết mỗi nội dung ở một nơi: nội dung đã có ở file khác thì liên kết tới file đó.
- Chỉ ghi nguồn tham khảo bên ngoài vào [references.md](../../docs/appendix/references.md). Không tạo mục tham khảo riêng trong từng tài liệu.
- Chỉ liên kết tài liệu trong dự án ở dòng `Liên quan` đầu file.
- Ghi gợi ý nội dung trong file khung bằng chú thích `<!-- ... -->`.
- Xóa chú thích gợi ý khi viết xong.

## 5. 🎨 Icon

Chỉ dùng icon trong bảng dưới. Mỗi tiêu đề tối đa 1 icon, đặt đầu tiêu đề. Tiêu đề có số thứ tự thì đặt icon sau số: `## 1. 🔭 Tầm nhìn`.

| Nhóm | Icon |
|---|---|
| Trạng thái | Theo mục 2 |
| Mục chuẩn | 📌 Đây là gì · 🎯 Dùng để làm gì · ⏰ Dùng khi nào · 📍 Ở đâu · ⚙️ Làm như thế nào |
| Mục ADR | 🧭 Bối cảnh · ✅ Quyết định · ❌ Phương án đã loại · ⚖️ Hệ quả |
| Mục rule | ✅ Bắt buộc · ❌ Cấm · 💡 Ví dụ · 🔍 Cách kiểm tra |
| Đánh dấu nội dung | ✅ Bắt buộc, đúng · ❌ Cấm, sai · ⚠️ Lưu ý, rủi ro · 💡 Ví dụ |
| Overview | 🔭 Tầm nhìn · 🧩 Vấn đề cần giải quyết · 🏁 Mục tiêu · 👥 Đối tượng sử dụng · 📈 Quy mô · 📊 Mục tiêu cụ thể · 🎛️ Kiểm soát công cụ · ⛔ Ngoài phạm vi · 🏆 Tiêu chí thành công |
| Tiêu đề quy tắc, chỉ mục | 🗺️ Roadmap · 🔗 Tham chiếu · 📂 Phạm vi · 🔄 Quy trình · 🧱 Cấu trúc · ✍️ Trình bày · 🎨 Icon · 🚫 Cấm · 📐 Quy ước · 📚 Chỉ mục · 🛠️ Build và test · 🔍 Cách kiểm tra · 📋 Sổ theo dõi |

- Trạng thái luôn ghi **icon kèm chữ**: `🔴 Chưa làm`. Lý do: tìm được bằng `grep`, người khó phân biệt màu vẫn đọc được.
- Trong thân câu chỉ dùng 4 icon đánh dấu nội dung.

## 6. 🚫 Cấm

- ❌ Dùng dấu gạch dài "—". Thay bằng dấu phẩy, dấu chấm hoặc hai chấm, không dùng ngoặc đơn.
- ❌ Mở ngoặc giải thích lại nội dung đã viết bằng tiếng Việt. Ngoặc chỉ dùng cho tên đầy đủ của từ viết tắt và tham chiếu mục tiêu, ví dụ (G5).
- ❌ Dùng icon ngoài bảng ở mục 5.
- ❌ Viết nội dung không trả lời câu hỏi nào trong 5 mục.

## 7. 🔍 Cách kiểm tra

- Có đủ các mục `##` đúng thứ tự, đúng icon theo mẫu.
- Mục 1 đến 4 của tài liệu mô tả không vượt 5 dòng.
- `grep -n "—" <file>` không trả về kết quả.
- Mọi thuật ngữ nghiệp vụ có trong glossary.
- Trạng thái trong file khớp với roadmap.
- Chạy danh sách tự rà soát ở mục 12 của [vietnamese-writing.md](vietnamese-writing.md), trừ các điểm ở mục 8.

## 8. 📐 Quan hệ với vietnamese-writing.md

[vietnamese-writing.md](vietnamese-writing.md) áp dụng cho mọi phần ngôn ngữ, văn phong. Với tài liệu ReconOS, các điểm sau làm theo file này:

| Điểm | vietnamese-writing.md | Tài liệu ReconOS |
|---|---|---|
| Emoji, mục 7.3 | Không dùng emoji | Dùng icon trong bảng mục 5. Ngoài bảng vẫn cấm |
| Ngoặc đơn, mục 2.1 và 8.1 | Dùng thay gạch dài, chú thích nghĩa | Ngoặc chỉ cho tên đầy đủ của từ viết tắt và tham chiếu mục tiêu G#. Chú thích nghĩa viết thành câu riêng |
| Ngày, mục 10 | `01/11/2026` | Khối thông tin đầu file, roadmap, tech-debt, ADR: `2026-11-01`. Trong câu văn: `01/11/2026` |
| Bullet và đoạn văn, mục 6.7 | Đoạn phân tích viết văn liền mạch | Bullet là mặc định. Lập luận nhân quả viết đoạn văn ngắn: bối cảnh, hệ quả của ADR, phân tích trong threat-model |
| "file" và "tệp", mục 2.2 | Dịch từ phổ thông | Giữ "file" theo [glossary](../../docs/appendix/glossary.md) |
| Nguồn tham khảo | Mục tham khảo trong file | Chỉ ghi ở [references.md](../../docs/appendix/references.md) |

## 9. 📐 Quy ước vẽ sơ đồ tài liệu

Sơ đồ: [documentation-map.html](../../docs/documentation-map.html). Vẽ mới hoặc vẽ lại: dùng skill `drawing-documentation-map`, cùng bảng mã hóa dưới đây.

**Nguồn dữ liệu:**

- Tiền đề: cột Phụ thuộc của [documentation-roadmap.md](../../docs/documentation-roadmap.md).
- Phạm vi ảnh hưởng, mức thay đổi: [doc-sync.md](doc-sync.md).
- Mục đích, tóm tắt từ mục 📌 Đây là gì:
  - Trường `purpose`: tối đa 8 từ, hiện trên tab Bản đồ.
  - Trường `about`: một đến hai câu, hiện trên tab Mục đích.

**Cách vẽ lại:**

- Chỉ sửa mảng `GROUPS`, `DOCS` đầu script. Không sửa phần vẽ.
- Xếp tài liệu mới vào một trong 8 nhóm có sẵn. Cần nhóm mới: hỏi người dùng.

**Mã hóa cố định:**

| Thành phần | Ý nghĩa |
|---|---|
| Thẻ nhóm đánh số 01 đến 08 | Nhóm, theo thứ tự đọc |
| Thứ tự file trong thẻ | Tầng phụ thuộc, tiền đề đứng trên |
| Nhãn `ADR`, `RULE`, `DATA` | ADR, quy tắc cho Claude, file dữ liệu máy đọc. Tài liệu mô tả không có nhãn |
| 1 đến 3 vạch | Mức thay đổi thấp, vừa, cao |
| Xanh dương, nét liền | Tiền đề: tài liệu mà file đang chọn dựa trên |
| Xanh lá, nét liền | Kế thừa: tài liệu dựa trên file đang chọn |
| Cam, nét đứt | Phạm vi ảnh hưởng: tài liệu phải cập nhật khi file đang chọn đổi |

- Chỉ vẽ đường nối cho file đang chọn.
- ❌ Thêm màu, nhãn, kiểu nét ngoài bảng trên.

## 10. 📐 Quy ước vẽ sơ đồ kiến trúc và luồng

Sơ đồ: [system-flows.html](../../docs/system-flows.html), 3 tab Kiến trúc, Luồng request, Tính năng.

**Nguồn dữ liệu:** chỉ lấy từ tài liệu đã duyệt, ghi tên file nguồn ở cuối mỗi sơ đồ. Mã lỗi chỉ ghi khi tài liệu nguồn có ghi.

**Cách vẽ lại:** chỉ sửa mảng `COMPONENTS`, `LINKS`, `ZONES`, `FLOWS` đầu script. Không sửa phần vẽ.

**Mã hóa cố định:**

| Thành phần | Ý nghĩa |
|---|---|
| Hình chữ nhật bo góc nhỏ | Tiến trình |
| Hình trụ | Kho dữ liệu |
| Viền đứt, bo tròn | Bên ngoài hệ thống: trình duyệt, mục tiêu |
| Nền xám nhạt | Lớp trong Backend API: middleware, dependency, service |
| Vùng nền | Ranh giới tin cậy: bên ngoài, vùng lõi, vùng worker, mục tiêu |
| Màu xanh dương | Kênh HTTP |
| Màu xanh lá | Kênh SQL |
| Màu cam | Kênh S3 tới MinIO |
| Màu tím, nét đứt | Queue Celery, NOTIFY, pub/sub |
| Màu đỏ | Chạy công cụ, lưu lượng tới mục tiêu |
| Màu chữ chính | Gọi trong cùng tiến trình |
| Xám, nét đứt, đầu rỗng | Trả về |
| Số trên đường nối | Số thứ tự trong bảng kênh giao tiếp |
| Nét đứt màu chữ chính, dọc dưới mỗi thành phần | Trục thời gian của sơ đồ tuần tự: bước ở trên xảy ra trước |
| Khối nền xanh | Một transaction |
| Khối nền xanh lá | Lặp |
| Cột Không đạt thì, chữ đỏ | Kết quả khi bước kiểm tra không đạt |

**Ảnh động:**

- Sơ đồ tuần tự: nút Chạy, Bước tiếp, Về đầu. Bước đang chạy đậm lên, bước sau mờ đi, gói tin chạy dọc mũi tên theo màu kênh.
- Dòng chảy: chấm cùng màu chạy dọc mọi mũi tên theo chiều dữ liệu. Bật mặc định trên cả hai loại sơ đồ. Nút Tắt dòng chảy để tắt.
- Mặc định sơ đồ tuần tự hiện đủ mọi bước. Phát từng bước chỉ chạy khi bấm Chạy.

**Tên luồng:** động từ cộng đối tượng, 2 đến 3 từ: Tạo job, Duyệt job, Tải output.

**Nhãn bước:** tối đa 5 từ, không dài hơn mũi tên. Nhãn dài hơn mũi tên thì tự xuống dòng.

| Loại bước | Mẫu | Ví dụ |
|---|---|---|
| Request HTTP | `METHOD /đường dẫn`, rút gọn tiền tố chung bằng `…` | `POST /jobs`, `PUT …/raw-outputs` |
| Gọi, tự xử lý | Động từ cộng đối tượng | Kiểm tra scope, Ghi job, Đọc object |
| Chuyển trạng thái | Chuyển sang `<trạng thái>` | Chuyển sang running |
| Trả về | Cụm danh từ | Job vừa tạo, Cookie phiên |
| Bất đồng bộ | Tên task, tên sự kiện | Task parse, Sự kiện finding mới |
| Không đạt thì | Mã lỗi nếu tài liệu có ghi, nếu không thì cụm ngắn | 409 conflict, Từ chối |

- Đường nối vào khối luôn vuông góc với cạnh khối.

- Mỗi luồng có tên, một câu tóm tắt, tối đa 3 ghi chú.
- ❌ Thêm màu, hình, kiểu nét ngoài bảng trên.

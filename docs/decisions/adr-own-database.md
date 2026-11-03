# ADR: Tự xây CSDL riêng

> Trạng thái: 🟢 Accepted · Ngày: 2026-10-30

## 🧭 Bối cảnh

- Dự án tham khảo BBRF, công cụ lưu program, scope và tài sản. Dự án chưa từng dùng BBRF. BBRF lưu dữ liệu trong CouchDB.
- BBRF không đáp ứng nhu cầu của ReconOS:
  - Thiếu trường dữ liệu cần cho dashboard và triage.
  - Tag khó tùy biến.
  - Không có giao diện trực quan.
  - Không lưu finding, output thô, lịch sử job.
- Dữ liệu còn phân tán ở các engine. Osmedeus và Vigolium mỗi engine có CSDL và schema riêng, không liên kết chéo được với nhau và với BBRF.
- Tài liệu tổng quan [overview.md](../architecture/overview.md) đặt yêu cầu: làm chủ dữ liệu (G1), hợp nhất tài sản với ReconOS là nguồn sự thật duy nhất (G3), lưu output thô tập trung (G8).

## ✅ Quyết định

- ReconOS dùng CSDL riêng, schema do ReconOS định nghĩa và quản lý bằng migration.
- CSDL của ReconOS lưu toàn bộ: program, scope, tài sản, tag, job, output thô hoặc vị trí lưu output thô, finding, trạng thái triage, tài khoản, nhật ký thao tác.
- ❌ BBRF: không cài đặt, không đồng bộ, không gọi API. BBRF chỉ là tài liệu tham khảo kiến trúc và tính năng.
- ❌ Không đọc, không ghi, không phụ thuộc CSDL của Osmedeus, Vigolium hay engine khác.
- Dữ liệu từ công cụ và engine chỉ vào CSDL của ReconOS qua một đường: worker gửi output thô, backend lưu output thô, parser ở backend tạo hoặc cập nhật tài sản và finding.
- Chọn hệ quản trị CSDL: thuộc [ADR tech stack](adr-tech-stack.md). Chi tiết schema: [database.md](../data/database.md).

## ❌ Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Dùng BBRF, bổ sung script bên ngoài | Không khắc phục được việc thiếu trường, tag khó tùy biến, thiếu giao diện. Finding và output thô vẫn nằm ngoài BBRF. Trái G1. |
| Fork và mở rộng BBRF | Vẫn gắn với mô hình tài liệu CouchDB của BBRF. Phải tự bảo trì bản fork, khó cập nhật. Trái G1. |
| Dùng CSDL của Osmedeus hoặc Vigolium làm nguồn chính | Mỗi engine chỉ chứa dữ liệu công cụ do chính engine đó chạy. Schema thay đổi theo phiên bản engine. Không phải nguồn sự thật duy nhất, trái G3. |
| Đồng bộ hai chiều giữa CSDL riêng và BBRF hoặc engine | Hai nguồn sự thật, phát sinh xung đột dữ liệu. Trái G1, G3. |
| Dùng nền tảng quản lý lỗ hổng có sẵn: DefectDojo, Faraday | Mô hình dữ liệu do bên thứ ba quyết định. Mở rộng trường, tag, quy tắc scope cho job phải theo cơ chế của nền tảng đó. Trái G1, G2. Chưa đánh giá chi tiết, giữ lại để tham khảo. |
| Chỉ lưu file output, không dùng CSDL | Không truy vấn và liên kết chéo được tài sản, finding, job. Trái G3, G6. |

## ⚖️ Hệ quả

**✅ Đạt được:**

- Toàn quyền thiết kế schema, thêm trường và tag theo nhu cầu dashboard (G2).
- Liên kết chéo domain, IP, URL, service, screenshot, finding, output thô trong một CSDL (G3).
- Output thô gắn với job, tra cứu và tải về được kể cả khi chưa có parser (G8).
- Nâng cấp hoặc thay engine không ảnh hưởng dữ liệu đã lưu.

**⚠️ Đánh đổi:**

- Tự thiết kế, viết migration và bảo trì schema.
- Mỗi công cụ và engine cần một parser riêng ở backend. Công cụ chưa có parser chỉ có output thô.
- Tự xây API và giao diện.
- Tự lo sao lưu, hiệu năng, mở rộng: xem [performance.md](../ops/performance.md), [scalability.md](../ops/scalability.md).

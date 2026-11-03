# ADR: Chọn tech stack

> Trạng thái: 🟢 Accepted · Ngày: 2026-10-30

## 🧭 Bối cảnh

- [ADR tự xây CSDL riêng](adr-own-database.md) quyết định ReconOS có CSDL riêng, chưa chọn hệ quản trị CSDL.
- Hệ thống cần các thành phần:
  - Backend: API cho UI, kiểm tra scope (G5), lưu output thô rồi chạy parser (G8).
  - Hàng đợi và dispatcher: giao job cho worker phân tán (G4). Điều phối job phải đáp ứng:
    - Giới hạn số job đồng thời và tốc độ theo công cụ, program, mục tiêu, để tuân thủ điều khoản program.
    - Giữ job của công cụ khai thác chờ người duyệt trước khi chạy (G5).
    - Tạm dừng, tiếp tục và ưu tiên job theo program.
  - Nơi lưu output thô: dữ liệu lớn, tăng liên tục, tải về được (G8).
  - Frontend: nhiều bảng dữ liệu lớn, cập nhật realtime qua WebSocket.
- Dữ liệu có nhiều quan hệ chéo: domain, IP, URL, service, screenshot, finding, output thô (G3). Scope rule có dạng CIDR (Classless Inter-Domain Routing) và wildcard.
- Phần lớn công cụ chạy dạng CLI (Command Line Interface), viết bằng Go hoặc Python. Worker gọi công cụ qua tiến trình con.
- Chưa ước tính được quy mô, phải mở rộng ngang bằng cách thêm worker và dung lượng lưu trữ.

## ✅ Quyết định

| Thành phần | Công nghệ | Lý do chính |
|---|---|---|
| Backend | Python, FastAPI | Hỗ trợ bất đồng bộ và WebSocket sẵn. Nhiều công cụ và thư viện bảo mật viết bằng Python, viết parser nhanh. |
| CSDL | PostgreSQL | Quan hệ chéo bằng khóa ngoại (G3). Kiểu `inet`, `cidr` cho IP và scope rule. `jsonb` cho dữ liệu bán cấu trúc: tham số job, chi tiết finding. Phân vùng bảng cho dữ liệu lớn. |
| Hàng đợi, dispatcher | Celery, Redis làm broker. Dispatcher là tiến trình riêng của ReconOS, gửi task qua Celery | Celery có sẵn cơ chế thử lại, timeout, lập lịch định kỳ bằng Celery Beat, giám sát. Trạng thái job lưu ở PostgreSQL. Dispatcher chọn job đến lượt theo độ ưu tiên, bỏ qua job chờ duyệt và program tạm dừng, kiểm tra giới hạn theo công cụ, program, mục tiêu, rồi gửi task Celery. Tiến trình riêng phản ứng ngay khi có job mới hoặc job vừa xong, không phụ thuộc chỗ trống của worker, có heartbeat riêng như bản thiết kế S15. Celery Beat chỉ dùng để tạo job quét định kỳ. |
| Sự kiện realtime | Redis pub/sub, WebSocket của FastAPI | Dùng lại Redis, không thêm thành phần hạ tầng. |
| Lưu output thô | Object storage tương thích S3 (Amazon Simple Storage Service), chạy tại chỗ bằng MinIO | Mở rộng ngang, không phình CSDL. PostgreSQL chỉ lưu metadata và khóa object của output thô. |
| Frontend | Next.js, Tailwind | Framework React có sẵn routing, layout, cấu trúc thư mục cho nhiều màn hình. Người phát triển quen React. Giữ Tailwind từ mockup trong `docs/design/screens/`. |

- Phiên bản cụ thể và thư viện đi kèm: [tech-stack.md](../architecture/tech-stack.md).
- Worker là Celery worker viết bằng Python, gọi công cụ qua tiến trình con. Contract worker ↔ backend: [external-services.md](../integrations/external-services.md).

## ❌ Phương án đã loại

| Thành phần | Phương án | Lý do loại |
|---|---|---|
| Backend | Go | Ưu điểm: cùng ngôn ngữ với Osmedeus, nuclei, gowitness, hiệu năng cao. Loại vì Python phù hợp hơn với lĩnh vực bảo mật: nhiều thư viện, script và công cụ bảo mật viết bằng Python, viết parser nhanh hơn. |
| CSDL | MySQL | Không có kiểu `inet`, `cidr` sẵn cho IP và scope rule. |
| CSDL | MongoDB | Mô hình tài liệu, liên kết chéo nhiều quan hệ khó và kém nhất quán (G3). |
| CSDL | SQLite | CSDL dạng file, chỉ một tiến trình ghi tại một thời điểm. Không phục vụ được backend và dispatcher chạy trên nhiều máy. |
| Hàng đợi | Celery, không có dispatcher: API gửi task thẳng sang Celery | Job chạy ngay khi có worker rảnh. Không giữ được job chờ duyệt, không giới hạn theo program hoặc mục tiêu, không tạm dừng hay ưu tiên theo program. |
| Dispatcher | Task định kỳ của Celery Beat | Phải chờ chu kỳ Beat, nút **Dispatch Now** không chạy ngay. Task `dispatch` xếp hàng chung với job khác. Các lượt Beat có thể chạy chồng nhau, giao trùng job hoặc vượt giới hạn. |
| Hàng đợi | Redis Streams, dispatcher tự viết hoàn toàn | Phải tự viết cơ chế thử lại, timeout, nhận lại job khi worker dừng đột ngột, lập lịch, giám sát. Nhiều mã mới, rủi ro mất hoặc chạy trùng job. |
| Hàng đợi | arq, Dramatiq | Ít tính năng có sẵn hơn Celery: lập lịch, giám sát. Cộng đồng nhỏ hơn. |
| Broker của Celery | RabbitMQ, Kafka | Thêm một thành phần hạ tầng. Redis đã cần cho pub/sub. |
| Lưu output thô | File system cục bộ hoặc volume | Khó mở rộng khi có nhiều máy, khó sao lưu tách khỏi server. |
| Lưu output thô | Lưu trong PostgreSQL | CSDL phình nhanh, sao lưu và truy vấn chậm. |
| Lưu output thô | SeaweedFS, Garage | Tương thích S3 nhưng ít phổ biến hơn MinIO, ít tài liệu và ví dụ hơn. |
| Lưu output thô | AWS S3 hoặc S3 của cloud khác | Output thô nằm ngoài hạ tầng tự quản lý. Trái G1. |
| Frontend | React, Vite | Không có sẵn routing, layout, cấu trúc thư mục. Phải tự ghép thêm thư viện. |
| Frontend | Vue 3, Nuxt | Nuxt có routing, layout tương đương Next.js, TanStack Query và Table có bản cho Vue. Loại vì người phát triển quen React, không vì lý do kỹ thuật. |
| Frontend | Svelte, SvelteKit | SvelteKit có routing, layout tương đương Next.js, TanStack Query và Table có bản cho Svelte. Loại vì người phát triển quen React, không vì lý do kỹ thuật. |

## ⚖️ Hệ quả

**✅ Đạt được:**

- Một CSDL quan hệ chứa toàn bộ liên kết chéo tài sản, finding, output thô (G3).
- Scope rule dạng CIDR so khớp trực tiếp trong PostgreSQL (G5).
- Thêm worker và dung lượng object storage để mở rộng ngang, không đổi kiến trúc.
- Redis dùng chung cho broker của Celery và sự kiện realtime.
- Cơ chế thử lại, timeout, lập lịch quét định kỳ, giám sát worker dùng sẵn của Celery.

**⚠️ Đánh đổi:**

- Celery không có sẵn: hàng đợi xem và thao tác được như màn hình S10, giới hạn theo program và mục tiêu, duyệt job, tạm dừng theo program. Dispatcher của ReconOS tự viết các phần này dựa trên trạng thái job ở PostgreSQL.
- Với Redis làm broker, task chạy lâu hơn `visibility_timeout` bị giao lại. Phải đặt timeout lớn hơn thời gian job dài nhất và chống chạy trùng job.
- Worker phải viết bằng Python.
- Vận hành thêm tiến trình dispatcher. Dispatcher dừng thì không job nào được giao. Đếm job đang chạy và chuyển trạng thái job phải nằm trong cùng một transaction PostgreSQL để không vượt giới hạn: [system.md](../architecture/system.md).
- Bản community của MinIO đã thu hẹp từ năm 2025: bỏ phần quản trị trên web console, ngừng phát hành binary và Docker image dựng sẵn. Cần kiểm tra cách cài đặt và giấy phép AGPLv3 khi triển khai. Mã chỉ gọi API S3, đổi sang object storage tương thích S3 khác không phải sửa mã.
- Vận hành thêm MinIO bên cạnh PostgreSQL và Redis. Sao lưu phải phối hợp CSDL với object storage.
- Redis là điểm lỗi đơn của hàng đợi và realtime. Cấu hình lưu bền và tính sẵn sàng: [deployment.md](../ops/deployment.md).
- Backend Python cần chú ý hiệu năng khi parse output thô lớn: [performance.md](../ops/performance.md).
- Next.js cần thêm runtime Node.js khi chạy server. Frontend gọi API và WebSocket của backend FastAPI, không đặt nghiệp vụ trong Next.js.

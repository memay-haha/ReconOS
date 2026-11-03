# Khả năng mở rộng

> Phiên bản: 1.0 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 19: Khả năng mở rộng
> Liên quan: [system.md](../architecture/system.md), [performance.md](performance.md), [external-services.md](../integrations/external-services.md), [database.md](../data/database.md)

## 📌 Đây là gì

- Cách mở rộng ngang từng tiến trình và kho dữ liệu của ReconOS, số bản chạy được của từng tiến trình.
- Điểm nghẽn dự kiến và thứ tự xử lý.

## 🎯 Dùng để làm gì

- Chưa ước tính được quy mô. Thêm worker, thêm dung lượng mà không đổi kiến trúc: [overview.md](../architecture/overview.md).

## ⏰ Dùng khi nào

- Thêm máy worker, thêm bản chạy, điều tra hệ thống quá tải. Viết cấu hình triển khai.
- Không dùng để tra tối ưu trong mã: xem [performance.md](performance.md).

## 📍 Ở đâu

- Tiến trình và kho dữ liệu: [system.md](../architecture/system.md). Lệnh chạy: [deployment.md](deployment.md).
- Theo dõi tải: S10, S15.

## ⚙️ Làm như thế nào

### Số bản của từng tiến trình

| Tiến trình | Số bản | Cách mở rộng |
|---|---|---|
| Backend API | Nhiều | Không giữ trạng thái. Thêm bản sau reverse proxy. Mỗi bản subscribe Redis pub/sub nên WebSocket ở bản nào cũng nhận đủ sự kiện |
| Dispatcher | Một bản hoạt động, các bản khác chờ | Không mở rộng ngang. Bản chờ chiếm advisory lock khi bản hoạt động dừng |
| Tiến trình nền | Nhiều | Thêm bản nghe queue `parse`. Queue `schedule` một bản là đủ |
| Celery Beat | Đúng một | Hai bản chạy cùng lúc gửi trùng task. Task `schedule` cập nhật `next_run_at` theo điều kiện nên không tạo job trùng |
| Worker | Nhiều | Thêm máy, khai báo tool module trong `RECONOS_WORKER_TOOL_MODULES`. Thêm máy cho tool module có queue dài |
| Engine server | Một bản cho mỗi engine | Tăng tài nguyên máy engine. Nhiều server cho một engine cần đổi schema `engine`, chưa hỗ trợ |
| Frontend | Nhiều | Không giữ trạng thái |

- Giới hạn job đồng thời theo tool module, program giữ ở dispatcher. Thêm worker cũng không làm số job đồng thời vượt giới hạn này.

### Kho dữ liệu

| Kho | Thứ tự mở rộng |
|---|---|
| PostgreSQL chính | 1. Tăng CPU (Central Processing Unit), RAM (Random Access Memory), đĩa, thêm connection pooler. 2. Phân vùng bảng lớn. 3. Read replica cho dashboard và xuất dữ liệu. ❌ Không sharding |
| PostgreSQL log | Phân vùng theo ngày từ đầu, xóa phân vùng quá hạn. Đặt trên máy riêng khi tải ghi log làm chậm CSDL chính |
| MinIO | Thêm ổ đĩa, chuyển sang chế độ phân tán của MinIO. Mã chỉ dùng API S3 nên đổi sang dịch vụ S3 khác không phải sửa mã |
| Redis | Một bản, bật lưu xuống đĩa. Chỉ giữ queue và pub/sub nên dữ liệu nhỏ |

### Phân vùng bảng

| Bảng | Khóa phân vùng | Khi nào |
|---|---|---|
| `app_log` | `logged_at` theo ngày | Từ phiên bản đầu tiên |
| `asset_event` | `created_at` theo tháng | Khi vacuum hoặc index của bảng làm chậm truy vấn S02, S05 |
| `audit_log` | `created_at` theo tháng | Khi vacuum hoặc index của bảng làm chậm truy vấn nhật ký |

- Bảng tài sản, finding, job không phân vùng theo thời gian vì truy vấn chính lọc theo program và trạng thái.
- Phân vùng là thay đổi schema, làm bằng migration: [database.md](../data/database.md).

### Điểm nghẽn dự kiến

| Điểm nghẽn | Dấu hiệu | Xử lý |
|---|---|---|
| Parse chậm hơn tốc độ upload | Queue `parse` dài, nhiều `raw_output` ở `pending` | Thêm bản tiến trình nền |
| Ghi CSDL của parser | Chờ row lock, transaction chậm khi nhiều parser cùng ghi một program | Giảm `parser_batch_size`, tăng tài nguyên CSDL |
| Worker thiếu | Job `queued` chờ lâu trên S10 | Thêm máy worker cho tool module có queue dài |
| Dispatcher | Độ trễ giao job tăng trên S15 | Tăng tài nguyên máy dispatcher. Dispatcher không chạy công cụ nên tải nhẹ |
| Dung lượng output thô | Ổ MinIO đầy | Thêm ổ hoặc chuyển MinIO phân tán. Output thô giữ vĩnh viễn |

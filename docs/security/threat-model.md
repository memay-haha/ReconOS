# Mô hình mối đe dọa

> Phiên bản: 1.0 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 17: Bảo mật
> Liên quan: [system.md](../architecture/system.md), [database.md](../data/database.md), [authorization.md](authorization.md), [authentication.md](authentication.md), [external-services.md](../integrations/external-services.md)

## 📌 Đây là gì

- Danh sách đối tượng cần bảo vệ, mối đe dọa theo STRIDE và biện pháp giảm thiểu của ReconOS.
- Gồm rủi ro tồn dư đã chấp nhận.

## 🎯 Dùng để làm gì

- Mọi biện pháp bảo mật trong mã truy ngược được về một mối đe dọa cụ thể (G7).
- Công cụ, nhất là công cụ khai thác, không chạy ngoài scope (G5).

## ⏰ Dùng khi nào

- Thêm thành phần, kênh giao tiếp, endpoint, tool module. Rà soát bảo mật.
- Không dùng để tra quy tắc viết mã an toàn: xem [security.md](../../.claude/rules/security.md).

## 📍 Ở đâu

- Vùng tin cậy và kênh giao tiếp: [system.md](../architecture/system.md). Quyền: [authorization.md](authorization.md).

## ⚙️ Làm như thế nào

### Đối tượng cần bảo vệ

| Đối tượng | Vì sao |
|---|---|
| Scope và quyết định tạo job | Quét ngoài scope gây hậu quả pháp lý cho người dùng và program (G5) |
| Finding, output thô | Chứa lỗ hổng chưa công bố của program, request và response có dữ liệu nhạy cảm |
| Thông tin xác thực | API key của engine, biến engine, proxy, token worker |
| Tài khoản, phiên | Chiếm phiên là chiếm quyền tạo job và duyệt job khai thác |
| Nhật ký thao tác | Bằng chứng ai làm gì, nhất là ai duyệt job khai thác |
| Máy worker, engine server | Chạy công cụ gửi payload tấn công tới mục tiêu |

### Ranh giới và nguồn đe dọa

| Nguồn | Vào từ | Ghi chú |
|---|---|---|
| Người ngoài | Internet tới reverse proxy | Chưa xác thực |
| Tài khoản hợp lệ vượt quyền | Trình duyệt | User truy cập program không được gán |
| Mục tiêu độc hại | Output thô do công cụ thu về | Tiêu đề trang, header, nội dung do mục tiêu kiểm soát |
| Worker hoặc engine server bị chiếm | Vùng worker tới Backend API, Redis | Tiếp xúc mục tiêu nên dễ bị tấn công hơn vùng lõi |

### Mối đe dọa và biện pháp

| STRIDE | Mối đe dọa | Biện pháp |
|---|---|---|
| Spoofing | Đoán, dò mật khẩu | Argon2id, chặn khi đăng nhập sai nhiều lần, chính sách mật khẩu: [authentication.md](authentication.md) |
| Spoofing | Lấy cắp cookie phiên | Cookie `__Host-`, `HttpOnly`, `Secure`. CSDL chỉ lưu giá trị băm session ID. Thu hồi phiên |
| Spoofing | Token worker bị lộ | Token riêng mỗi worker, chỉ gọi endpoint contract worker, thu hồi được, lưu giá trị băm |
| Spoofing | Trang khác gửi request thay người dùng | Kiểm tra `Origin`, `Sec-Fetch-Site`, cookie `SameSite=Lax`: [api/architecture.md](../api/architecture.md) |
| Tampering | Sửa output thô sau khi lưu | Chỉ Backend API ghi MinIO, lưu mã băm SHA-256, parser không sửa object |
| Tampering | Chèn lệnh qua mục tiêu hoặc tham số | Tham số theo allowlist, gọi công cụ bằng danh sách đối số, mục tiêu lấy từ job đã kiểm tra scope |
| Tampering | Gửi task giả vào Redis | Serializer JSON, model contract kiểm tra mọi task. Tài khoản Redis của worker chỉ dùng queue job |
| Repudiation | Chối đã duyệt job khai thác, đổi scope | `audit_log` chỉ cho thêm bản ghi, không sửa, không xóa, ghi người thực hiện và thời điểm |
| Information disclosure | User xem program không được gán | Lọc theo `program_user` ở backend, trả `404` |
| Information disclosure | Lộ thông tin xác thực | Mã hóa khi lưu, che trên UI, không trả qua API, không ghi log. Chỉ gửi cho worker qua HTTPS khi worker claim job |
| Information disclosure | Truy cập trực tiếp MinIO | MinIO chỉ trong vùng lõi, không mở bucket công khai. Tải file qua Backend API có kiểm tra quyền |
| Information disclosure | Lỗi lộ chi tiết hệ thống | Phản hồi lỗi theo RFC 9457, không có stack trace, câu SQL |
| Denial of service | File output thô vượt `upload_max_bytes`, gói nén nở lớn khi giải nén | Upload dạng stream, giới hạn kích thước. Parser đọc stream, giới hạn tổng dung lượng sau giải nén |
| Denial of service | Tạo job hàng loạt | Giới hạn số job đồng thời và tốc độ theo tool module, program |
| Elevation of privilege | Người tạo tự duyệt job khai thác | Backend so người duyệt với người tạo, từ chối kể cả Superadmin |
| Elevation of privilege | Nội dung từ mục tiêu chạy script trên UI | React escape mặc định. ❌ Không render HTML từ output thô. CSP (Content Security Policy) chặn script ngoài |
| Elevation of privilege | Công thức trong file CSV (Comma-Separated Values) xuất ra | Thêm `'` trước ô bắt đầu bằng `=`, `+`, `-`, `@` |
| Elevation of privilege | Đường dẫn trong gói nén thoát ra ngoài | Parser đọc gói nén trong bộ nhớ hoặc thư mục tạm, bỏ mục có `..` hoặc đường dẫn tuyệt đối |

### Kiểm soát công cụ khai thác

1. Job của tool module nhóm khai thác vào trạng thái `pending_approval`, cần người thứ hai duyệt: [authorization.md](authorization.md).
2. Backend kiểm tra scope khi tạo job, dispatcher kiểm tra lại khi giao job: [business-flow.md](../architecture/business-flow.md).
3. Tham số chỉ trong allowlist của schema, ❌ không có tham số tự do: [modules.md](../architecture/modules.md).
4. Backend ghi nhật ký thao tác ở mọi bước tạo, duyệt, từ chối, hủy.

### Rủi ro tồn dư

| Rủi ro | Lý do chấp nhận |
|---|---|
| Domain trong scope phân giải tới IP của bên thứ ba, như CDN dùng chung | ReconOS không phân giải DNS để kiểm tra scope. Người khai báo scope chịu trách nhiệm |
| Worker bị chiếm gửi output thô giả, tạo finding giả | Worker là nguồn dữ liệu duy nhất. Finding cần triage trước khi báo cáo |
| Worker bị chiếm nhận được thông tin xác thực của các job đã claim | Worker cần thông tin xác thực để chạy job. Thu hồi token và đổi thông tin xác thực khi phát hiện |
| Engine server tự giữ dữ liệu lượt chạy trong CSDL riêng | Engine nằm trong vùng worker. Dọn dữ liệu engine theo [deployment.md](../ops/deployment.md) |
| Chưa có MFA (Multi-Factor Authentication) | Ghi trong [tech-debt.md](../tech-debt.md) và [roadmap.md](../roadmap.md) |

- Quy tắc viết mã rút từ file này: [security.md](../../.claude/rules/security.md).

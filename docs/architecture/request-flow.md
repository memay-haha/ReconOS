# Luồng request

> Phiên bản: 1.2 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 6: Luồng request
> Liên quan: [authentication.md](../security/authentication.md), [authorization.md](../security/authorization.md), [api/architecture.md](../api/architecture.md), [system.md](system.md), [external-services.md](../integrations/external-services.md)

## 📌 Đây là gì

- Các bước trong Backend API mà request HTTP, kết nối WebSocket và request của worker lần lượt đi qua.
- Luồng tạo job từ request tới khi job vào hàng đợi.

## 🎯 Dùng để làm gì

- Mọi request qua đủ bước xác thực, chống CSRF (Cross-Site Request Forgery), phân quyền theo program trước khi chạm dữ liệu (G7).
- Job chỉ được tạo sau khi kiểm tra scope và tham số (G5).

## ⏰ Dùng khi nào

- Viết middleware, dependency, router mới. Điều tra request bị từ chối.
- Không dùng để tra luồng nghiệp vụ program đến báo cáo: xem [business-flow.md](business-flow.md).

## 📍 Ở đâu

- Middleware, dependency: `backend/app/core/`. Router, service: `backend/app/<module>/`.

## ⚙️ Làm như thế nào

### Request HTTP từ trình duyệt

```mermaid
sequenceDiagram
    participant BR as Trình duyệt
    participant RP as Reverse proxy
    participant MW as Middleware
    participant DEP as Dependency
    participant SV as Service
    participant PG as PostgreSQL
    BR->>RP: HTTPS, cookie phiên
    RP->>MW: Chuyển tiếp
    MW->>MW: Gán request ID, kiểm tra CSRF
    MW->>DEP: Gọi router
    DEP->>PG: Đọc phiên, tài khoản
    DEP->>DEP: Kiểm tra vai trò
    DEP->>SV: Gọi service với session CSDL
    SV->>PG: Truy vấn lọc theo program được gán
    SV-->>BR: Response hoặc lỗi RFC 9457
```

| Bước | Thành phần | Không đạt thì |
|---|---|---|
| 1. Giải mã TLS, giới hạn kích thước body | Reverse proxy | `413` |
| 2. Lấy `request_id` từ `X-Request-ID` hoặc sinh mới, gắn vào log | Middleware | |
| 3. Kiểm tra `Origin`, `Sec-Fetch-Site` với request đổi dữ liệu | Middleware | `403 forbidden` |
| 4. Đọc cookie, tra giá trị băm của session ID, kiểm tra hết hạn, tài khoản bị khóa | Dependency xác thực | `401 unauthenticated` |
| 5. Kiểm tra vai trò có quyền gọi endpoint | Dependency phân quyền | `403 forbidden` |
| 6. Kiểm tra dữ liệu request theo schema Pydantic | FastAPI | `422 validation_error` |
| 7. Kiểm tra tài nguyên thuộc program được gán | Service | `404 not_found` |
| 8. Chạy nghiệp vụ trong một transaction, ghi nhật ký thao tác | Service | Rollback, lỗi theo loại |
| 9. Commit, publish sự kiện realtime sau commit | Dependency session | |

- Lỗi ở bước nào cũng đi qua bộ xử lý lỗi chung: [error-handling.md](../../.claude/rules/error-handling.md).
- Request bị từ chối ở bước 3, 5, 7 được ghi nhật ký thao tác: [authorization.md](../security/authorization.md).
- Server component của Next.js gọi Backend API kèm cookie của trình duyệt, đi qua đúng các bước trên.

### Tạo job

1. Bước 1 đến 6 như trên.
2. Service của `job` kiểm tra program ở trạng thái `active`, tool module đang bật.
3. Kiểm tra tham số theo schema của tool module trong `contracts/`.
4. Kiểm tra từng mục tiêu với scope của program. Một mục tiêu không đạt thì từ chối cả job với `422 target_out_of_scope`.
5. Ghi job: nhóm khai thác vào `pending_approval`, nhóm khác vào `queued`. Gửi `NOTIFY` trong cùng transaction.
6. Trả job vừa tạo. Dispatcher nhận thông báo và giao: [system.md](system.md).

### WebSocket

```mermaid
sequenceDiagram
    participant BR as Trình duyệt
    participant API as Backend API
    participant RD as Redis
    BR->>API: Bắt tay tới /api/v1/ws, cookie phiên
    API->>API: Kiểm tra Origin, phiên
    API-->>BR: Kết nối mở
    RD-->>API: Sự kiện pub/sub
    API->>API: Lọc theo program tài khoản xem được
    API->>BR: Sự kiện
```

- `Origin` sai hoặc phiên không hợp lệ: đóng kết nối khi bắt tay.
- Phiên hết hạn hoặc bị thu hồi khi đang mở: server đóng kết nối, trình duyệt chuyển về S01.
- Vai trò hoặc program được gán thay đổi: áp dụng cho sự kiện tiếp theo, không cần kết nối lại.

### Request từ worker

| Bước | Thành phần | Không đạt thì |
|---|---|---|
| 1. Giải mã TLS, giới hạn kích thước body theo cấu hình upload | Reverse proxy | `413` |
| 2. Tra giá trị băm của token, kiểm tra chưa thu hồi | Dependency xác thực worker | `401 unauthenticated` |
| 3. Chỉ cho phép đường dẫn `/api/v1/worker/` | Dependency xác thực worker | `403 forbidden` |
| 4. Kiểm tra job thuộc worker và trạng thái phù hợp | Service | `409 conflict` |
| 5. Xử lý `claim`, `heartbeat`, upload, `finish`, ghi log | Service | Lỗi theo loại |

- Không kiểm tra CSRF với request của worker vì không dùng cookie.
- Chi tiết từng endpoint: [external-services.md](../integrations/external-services.md).

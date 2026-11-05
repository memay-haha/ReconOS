# Kiến trúc API

> Phiên bản: 1.11 · Ngày: 2026-11-05 · Trạng thái: 🔵 Chờ duyệt
> Mục 10: Kiến trúc API
> Liên quan: [openapi.yaml](openapi.yaml), [schema.md](../data/schema.md), [authorization.md](../security/authorization.md), [authentication.md](../security/authentication.md), [external-services.md](../integrations/external-services.md)

## 📌 Đây là gì

- Quy ước chung của REST API và WebSocket do Backend API cung cấp: URL, phân trang, lọc, lỗi, phiên bản, sự kiện realtime.
- Danh sách endpoint: [openapi.yaml](openapi.yaml).

## 🎯 Dùng để làm gì

- Mọi endpoint cùng một quy ước, frontend dùng chung một client trong `src/lib/`.
- Mọi request đi qua xác thực, phân quyền theo program, chống CSRF (Cross-Site Request Forgery). Không lộ dữ liệu của program không được gán (G7).

## ⏰ Dùng khi nào

- Thêm hoặc sửa endpoint, sự kiện WebSocket. Viết client API ở frontend.
- Không dùng để tra contract worker: xem [external-services.md](../integrations/external-services.md).

## 📍 Ở đâu

- Router: `backend/app/<module>/router.py`. Schema request, response: `backend/app/<module>/schemas.py`.
- Client frontend: `frontend/src/lib/`. Danh sách endpoint: [openapi.yaml](openapi.yaml).

## ⚙️ Làm như thế nào

### Quy ước chung

| Mục | Quy ước |
|---|---|
| Tiền tố | `/api/v1`. Contract worker: `/api/v1/worker` |
| Đường dẫn | Danh từ số nhiều, kebab-case: `/scope-rules`, `/raw-outputs` |
| Tài nguyên con | Lồng dưới cha khi luôn thuộc cha: `/programs/{program_id}/scope-rules`. Thao tác trên một bản ghi dùng đường dẫn phẳng: `/scope-rules/{scope_rule_id}` |
| Thao tác đổi trạng thái | `POST` tới động từ: `/jobs/{job_id}/approve`, `/programs/{program_id}/archive` |
| Tên trường | snake_case theo cột Tên trong mã của [glossary](../appendix/glossary.md) |
| ID | UUID dạng chuỗi |
| Thời gian | ISO 8601, UTC |
| Định dạng | JSON. Lỗi: `application/problem+json` |
| Sửa một phần | `PATCH`, chỉ gửi trường cần đổi |
| Request ID | Header `X-Request-ID` dạng UUID. Client gửi kèm thì backend dùng lại, thiếu hoặc sai dạng thì sinh mới. Mọi response trả header này: [logging.md](../../.claude/rules/logging.md) |

- `GET` không đổi dữ liệu.
- Trường tính từ bảng khác (số đếm, tổng hợp) chỉ có ở endpoint đọc nó, không thêm vào response ghi. Ví dụ: `active_user_session_count` có ở `GET /users` và `GET /users/{user_id}`, không có ở `POST /users`, `PATCH /users/{user_id}`, `GET /auth/me`. Định nghĩa: [glossary.md](../appendix/glossary.md).
- Response không bao giờ chứa cột thông tin xác thực, giá trị băm mật khẩu, giá trị băm token.
- Chỉ `POST /auth/login` và `GET /health` không cần xác thực.

### Xác thực và phân quyền

| Bên gọi | Cách xác thực |
|---|---|
| Trình duyệt | Cookie phiên `__Host-`: [authentication.md](../security/authentication.md) |
| Worker | Token worker, chỉ gọi được `/api/v1/worker/` |

- Mỗi endpoint khai báo quyền qua dependency, mặc định từ chối: [authorization.md](../security/authorization.md).
- Trường `x-roles` trong [openapi.yaml](openapi.yaml) ghi vai trò được gọi endpoint.

### Chống CSRF

- Request `POST`, `PUT`, `PATCH`, `DELETE` từ trình duyệt bị từ chối khi:
  - Header `Origin` khác origin của ReconOS.
  - Header `Sec-Fetch-Site` là `cross-site`.
- Thiếu cả hai header: từ chối với request dùng cookie phiên.
- Cookie phiên `SameSite=Lax` là lớp bảo vệ thứ hai.
- Kiểm tra khai báo một lần ở tầng ứng dụng nên endpoint thêm sau tự có, không phải tự gọi.
- Endpoint của worker không dùng cookie phiên nên luôn qua được kiểm tra này.

### Phân trang

Danh sách dùng phân trang cursor theo keyset.

| Tham số | Ý nghĩa |
|---|---|
| `limit` | Số dòng mỗi trang. Mặc định 50, tối đa 200 |
| `cursor` | Lấy từ `next_cursor` của trang trước. Bỏ trống: trang đầu |
| `sort` | Trường sắp xếp, chọn trong các trường endpoint cho phép. Tiền tố `-`: giảm dần |

```json
{
  "items": [],
  "next_cursor": "eyJsYXN0X3NlZW5fYXQiOi...",
  "total": 14892,
  "total_is_estimate": false
}
```

- `next_cursor` là `null`: hết dữ liệu. Cursor chứa giá trị sắp xếp và `id` của dòng cuối, frontend không đọc nội dung cursor.
- `total` đếm chính xác khi nhỏ, ước lượng khi lớn. Ngưỡng và cách ước lượng: [performance.md](../ops/performance.md).
- UI dùng nút Trước, Sau. ❌ Không nhảy tới trang số N.

### Lọc

- Tham số lọc trùng tên cột: `program_id`, `severity`, `triage_status`, `in_scope`, `status`. `GET /jobs` lọc theo `status`, `GET /findings` lọc theo `triage_status`. Giá trị hợp lệ: [schema.md](../data/schema.md).
- Nhiều giá trị: lặp tham số, `severity=critical&severity=high`.
- Khoảng thời gian: hậu tố `_from`, `_to`, ví dụ `last_seen_at_from`.
- Tìm theo chuỗi: `q`, chỉ trên cột endpoint khai báo. Hiện chưa endpoint nào khai báo `q`: nợ 32, nợ 39 trong [tech-debt.md](../tech-debt.md).
- Tham số lọc của từng endpoint: [openapi.yaml](openapi.yaml). Mọi danh sách thuộc program nhận `program_id`. Danh sách liên quan tới một domain nhận `domain_id`: `/asset-events`, `/screenshots`, `/findings`.
- User chỉ nhận dữ liệu của program được gán, kể cả khi không truyền `program_id`.

### Trường tính và số liệu tổng hợp

Trường tính không phải cột, API tính mỗi lần đọc và chỉ có ở endpoint ghi dưới đây.

| Endpoint | Trường |
|---|---|
| `GET /programs`, `GET /programs/{program_id}` | `in_scope_rule_count`, `out_of_scope_rule_count`, `domain_count`, `ip_count`, `url_count`, `service_count`, `finding_counts` |
| `GET /domains`, `GET /domains/{domain_id}` | `ips`: danh sách địa chỉ IP, `url_count`, `service_count`, `finding_counts`. Riêng `GET /domains/{domain_id}` có thêm `tags`: danh sách `id` của `asset_tag`, `tag_id`, `key`, `value` |
| `GET /asset-events` | `asset_type`, `asset_name`, `program_name` |
| `GET /urls/{url_id}` | `technologies`: danh sách `technology_id`, `name`, `category`, `version` lấy từ `url_technology` và `technology` |
| `GET /users` gọi bởi Admin | Chỉ `id`, `username`, `role` |

- `finding_counts` là object theo 5 mức severity, đếm finding có `triage_status` khác `false_positive`, `duplicate`, `resolved`.

Response tổng hợp:

| Endpoint | Trường |
|---|---|
| `GET /dashboard/summary` | `programs`: số program xem được. `assets`: số `domain`, `ip`, `url`, `service`. `findings_by_severity`: như `finding_counts`. `jobs_by_status`: đủ 7 trạng thái job |
| `GET /dispatcher/status` | `last_heartbeat_at` của dispatcher, `queued_by_tool_module`, `queued_by_program`: số job `queued` theo từng nhóm |
| `POST /engines/{engine_id}/test` | `version`: phiên bản engine trả về, `NULL` khi engine không báo. Engine không trả lời thì trả lỗi |
| `GET /system/health` | `components[]`: `name`, `status` (`ok`, `degraded`, `down`), `latency_ms`, `checked_at`. Thêm `queue_length`, `workers_online` |

- `components[].name` theo thành phần trong [system.md](../architecture/system.md): `api`, `dispatcher`, `background`, `beat`, `postgres`, `reconos_log`, `redis`, `minio`, `osmedeus`, `vigolium`.
- Backend tính `status` và `workers_online`. Frontend chỉ hiển thị. ❌ Không trả PID, đường dẫn, địa chỉ IP nội bộ.
- Số liệu chỉ tính trên program tài khoản xem được.

### Lỗi

Định dạng RFC 9457 Problem Details, thêm trường `code`.

```json
{
  "type": "https://reconos/errors/target-out-of-scope",
  "title": "Target out of scope",
  "status": 422,
  "code": "target_out_of_scope",
  "detail": "a.other.com does not match any in-scope rule",
  "errors": [{"field": "target[0]", "code": "target_out_of_scope"}]
}
```

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `bad_request` | Request sai cú pháp, cursor không hợp lệ |
| 401 | `unauthenticated` | Không có phiên, phiên hết hạn, token worker sai |
| 403 | `forbidden` | Vai trò không có quyền thao tác trên tài nguyên xem được. Request bị chặn do kiểm tra CSRF |
| 403 | `self_approval_forbidden` | Duyệt job do chính mình tạo |
| 404 | `not_found` | Không tồn tại, hoặc thuộc program User không được gán |
| 409 | `conflict` | Vi phạm ràng buộc duy nhất. Chuyển trạng thái không hợp lệ |
| 413 | `payload_too_large` | File upload vượt giới hạn dung lượng |
| 422 | `validation_error` | Dữ liệu sai schema, kèm `errors` từng trường |
| 422 | `target_out_of_scope` | Mục tiêu không khớp scope khi tạo job (G5) |
| 422 | `current_password_incorrect` | Đổi mật khẩu nhập sai mật khẩu hiện tại. Phiên vẫn hợp lệ nên không dùng 401. Kèm `errors` với `field` là `current_password` |
| 429 | `rate_limited` | Vượt giới hạn tần suất, kèm header `Retry-After` |
| 500 | `internal_error` | Lỗi không lường trước. `detail` không chứa stack trace |

- `detail` viết tiếng Anh, không chứa thông tin xác thực, đường dẫn hệ thống, câu lệnh SQL.
- Cách backend phát sinh lỗi và chuyển lỗi thành response: [error-handling.md](../../.claude/rules/error-handling.md).

### Thao tác hàng loạt, xuất dữ liệu, tải file

| Loại | Quy ước |
|---|---|
| Hàng loạt | `POST /<tài nguyên>/bulk-<thao tác>`, tối đa 500 ID. Tất cả thành công, hoặc không dòng nào thay đổi. Body gồm `ids` và trường của thao tác, ví dụ `POST /findings/bulk-triage` nhận `ids`, `triage_status` |
| Xuất dữ liệu | `GET /<tài nguyên>/export?format=csv\|jsonl\|md`, cùng tham số lọc như danh sách, trả dạng stream |
| Tải output thô | `GET /raw-outputs/{raw_output_id}/content`, luôn `Content-Disposition: attachment` |
| Ảnh screenshot | `GET /screenshots/{screenshot_id}/image`, kèm header `X-Content-Type-Options: nosniff` |

- Backend API đọc file từ MinIO rồi stream cho trình duyệt. ❌ Không trả URL trực tiếp tới MinIO.
- Xuất CSV: thêm dấu `'` trước ô bắt đầu bằng `=`, `+`, `-`, `@`.

### WebSocket

- Một endpoint `/api/v1/ws`. Xác thực bằng cookie phiên, kiểm tra `Origin` khi bắt tay.
- Server chỉ đẩy sự kiện. Thao tác của người dùng đi qua REST.
- Mỗi sự kiện chỉ gửi cho tài khoản xem được program của sự kiện.

```json
{"type": "job.status_changed", "program_id": "0190...", "data": {"job_id": "0190...", "status": "running"}, "at": "2026-11-01T08:00:00Z"}
```

| `type` | Khi nào |
|---|---|
| `job.status_changed` | Job đổi trạng thái |
| `finding.created` | Parser tạo finding mới |
| `asset.discovered` | Parser tạo tài sản mới, gom theo job |
| `alert.created` | Có cảnh báo mới |
| `worker.status_changed` | Worker bắt đầu gửi heartbeat hoặc mất heartbeat |

- Frontend nhận sự kiện thì làm mới query TanStack Query tương ứng. Mất kết nối thì kết nối lại và làm mới toàn bộ query đang mở.

### Phiên bản

- Thêm endpoint, thêm trường tùy chọn trong response: giữ `v1`.
- Đổi tên, xóa trường, đổi ý nghĩa: tạo `/api/v2` cho endpoint đó.

### OpenAPI

- Hiện tại: [openapi.yaml](openapi.yaml) viết tay, ghi đường dẫn, phương thức, vai trò và schema chính.
- Khi có mã: sinh `openapi.yaml` từ FastAPI. CI so file đã commit với file sinh ra, khác nhau thì báo lỗi.

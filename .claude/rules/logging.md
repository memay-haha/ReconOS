---
paths:
  - "backend/**"
  - "workers/**"
---
# Ghi log

> Phiên bản: 1.2 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 15: Ghi log

## ✅ Bắt buộc

**Định dạng:**

- Ghi log bằng structlog, mỗi bản ghi một dòng JSON.
- Đặt cấu hình chung trong `backend/app/core/logging.py` và `workers/worker/logging.py`.
- Đặt `event` là tên sự kiện tiếng Anh dạng snake_case: `job_claimed`, `parse_failed`.
- Ghi đủ trường bắt buộc: `logged_at` UTC, `level`, `service`, `event`.
- Ghi trường ngữ cảnh khi có: `request_id`, `user_id`, `program_id`, `job_id`, `worker_id`, `tool_module`, `duration_ms`.
- Gắn ngữ cảnh bằng `structlog.contextvars` ở đầu request, task, job. ❌ Không truyền ngữ cảnh thủ công qua tham số từng lời gọi.
- Lấy `request_id` từ header `X-Request-ID` của request nếu giá trị là UUID hợp lệ. Thiếu hoặc sai dạng thì sinh UUID mới. Trả `X-Request-ID` trong mọi response.

**Access log:**

- Middleware ghi một bản ghi `http_request_completed` cấp `info` cho mỗi request khi response ra: `method`, `path`, `status`, `duration_ms`, `request_id`, `user_id` nếu đã xác thực.
- Ghi `path` theo mẫu route, ví dụ `/api/v1/jobs/{job_id}`. ❌ Không ghi query string.

**Cấp độ:**

| Cấp | Dùng khi |
|---|---|
| `debug` | Chi tiết để gỡ lỗi khi phát triển. Chỉ ghi ra stdout khi bật, không lưu CSDL log |
| `info` | Sự kiện bình thường: request xong, job đổi trạng thái, parse xong |
| `warning` | Bất thường nhưng tự xử lý được: thử lại, heartbeat trễ, bị từ chối quyền |
| `error` | Thao tác thất bại: parse lỗi sau khi hết lượt thử, exception không lường trước |
| `critical` | Tiến trình không chạy tiếp được: mất kết nối CSDL sau khi hết lượt thử lại, thiếu cấu hình |

**Nơi ghi:**

- Ghi log ra stdout và CSDL log theo [database.md](../../docs/data/database.md).
- Chỉ ghi qua cấu hình chung, ❌ không tự mở kết nối tới CSDL log.
- Ghi CSDL log theo lô, không chặn request. Bản ghi chờ ghi nằm trong bộ đệm log của tiến trình.
- Bộ đệm log chứa tối đa 10.000 bản ghi. Đầy thì bỏ bản ghi cũ nhất, ghi `warning` ra stdout kèm số bản ghi đã bỏ.
- Khi CSDL log lỗi: vẫn ghi stdout, bỏ lô đó, ghi log cấp `warning` ra stdout.
- Gửi log của worker qua client trong `worker/client.py`, ❌ không gửi từng bản ghi một.
- Worker không gửi được log về Backend API: giữ bản ghi trong bộ đệm log, gửi lại ở lô sau. Bộ đệm đầy thì xử lý như trên.
- Stdout của container: giới hạn kích thước theo [deployment.md](../../docs/ops/deployment.md).

**Ẩn thông tin xác thực:**

- Chạy processor ẩn thông tin xác thực trước mọi đích ghi. Processor duyệt đệ quy object và mảng, so tên trường không phân biệt hoa thường, thay giá trị bằng `***` cho trường có tên chứa chuỗi: `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`, `_encrypted`.
- Với URL proxy, chỉ ghi phần host.

## ❌ Cấm

- Dùng `print()` để ghi log.
- Ghi thông tin xác thực: mật khẩu, token, API key, cookie, session ID, URL proxy có tài khoản, biến engine.
- Ghi nội dung output thô, body request, body response.
- Ghi chuỗi định dạng sẵn thay cho trường: `log.info(f"job {job_id} done")`.
- Ghi log trong vòng lặp theo từng dòng output thô hoặc từng tài sản.

## 💡 Ví dụ

✅ Đúng: tên sự kiện cố định, dữ liệu trong trường.

```python
log.info("parse_completed", raw_output_id=str(raw_output.id), assets=asset_count, duration_ms=elapsed)
```

❌ Sai: chuỗi định dạng sẵn, lộ token.

```python
logger.info(f"worker {worker.name} claimed job {job_id} with token {token}")
```

## 🔍 Cách kiểm tra

```bash
grep -rn "print(" backend/app workers/worker --include=*.py     # phải rỗng
grep -rnE "log(ger)?\.(debug|info|warning|error|critical)\(f\"" backend workers --include=*.py   # phải rỗng
```

- Test processor ẩn thông tin xác thực với từng tên trường trong danh sách, cả trường viết hoa và trường lồng trong object, mảng.
- Gửi request kèm `X-Request-ID`: response trả lại đúng giá trị, access log có cùng `request_id`.

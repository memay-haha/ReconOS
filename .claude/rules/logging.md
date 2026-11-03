---
paths:
  - "backend/**"
  - "workers/**"
---
# Ghi log

> Phiên bản: 1.1 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 15: Ghi log

## ✅ Bắt buộc

**Định dạng:**

- Ghi log bằng structlog, mỗi bản ghi một dòng JSON.
- Đặt cấu hình chung trong `backend/app/core/logging.py` và `workers/worker/logging.py`.
- Đặt `event` là tên sự kiện tiếng Anh dạng snake_case: `job_claimed`, `parse_failed`.
- Ghi đủ trường bắt buộc: `logged_at` UTC, `level`, `service`, `event`.
- Ghi trường ngữ cảnh khi có: `request_id`, `user_id`, `program_id`, `job_id`, `worker_id`, `tool_module`, `duration_ms`.
- Gắn ngữ cảnh bằng `structlog.contextvars` ở đầu request, task, job. ❌ Không truyền ngữ cảnh thủ công qua tham số từng lời gọi.

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
- Ghi CSDL log theo lô, không chặn request.
- Khi CSDL log lỗi: vẫn ghi stdout, bỏ lô đó, ghi log cấp `warning` ra stdout.
- Gửi log của worker qua client trong `worker/client.py`, ❌ không gửi từng bản ghi một.

**Che dữ liệu:**

- Chạy processor che dữ liệu trước khi ghi, thay giá trị bằng `***` cho trường có tên chứa chuỗi: `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`, `_encrypted`.
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

- Test processor che dữ liệu với từng tên trường trong danh sách.

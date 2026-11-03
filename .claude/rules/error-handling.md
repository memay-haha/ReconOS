---
paths:
  - "backend/**"
  - "workers/**"
---
# Xử lý lỗi

> Phiên bản: 1.1 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 16: Xử lý lỗi

## ✅ Bắt buộc

**Backend:**

- Cho lỗi nghiệp vụ kế thừa `AppError` trong `backend/app/core/errors.py`.
- Gán cho mỗi lớp lỗi `code` và HTTP status theo bảng lỗi của [api/architecture.md](../../docs/api/architecture.md).
- Ném `AppError` trong service.
- Chuyển `AppError` thành response RFC 9457 ở bộ xử lý lỗi chung.
- Với exception không phải `AppError`: ghi log cấp `error` kèm stack trace ở bộ xử lý chung, trả `500 internal_error` không có chi tiết.
- Trả `422 validation_error` cho lỗi kiểm tra dữ liệu của Pydantic, kèm `errors` cho từng trường.
- Đặt timeout cho mọi lời gọi ra ngoài tiến trình: PostgreSQL, Redis, MinIO, REST API của engine.

**Thử lại:**

- Lấy số lần thử, backoff, cách xử lý khi hết lượt từ tài liệu: task `parse` trong [system.md](../../docs/architecture/system.md), worker và runner trong [external-services.md](../../docs/integrations/external-services.md).
- Thử lại bằng backoff lũy thừa, giới hạn số lần.
- Chỉ thử lại thao tác idempotent: upload cùng tên file, upsert, chuyển trạng thái có điều kiện.
- Không thử lại lỗi `4xx`, trừ `429`: thử lại sau thời gian trong `Retry-After`.
- Không tự thử lại job `failed`. Người dùng thử lại thủ công bằng cách tạo job mới.

**Worker:**

- Khi công cụ thoát với mã khác 0: upload `stdout.txt`, `stderr.txt` và output đã có, gọi `finish` với trạng thái `failed`.
- Bắt lỗi của runner ở vòng chạy job, gọi `finish` với trạng thái `failed` kèm lý do ngắn.
- Cho worker tiếp tục nhận task khác sau lỗi runner.
- Viết lý do lỗi gửi về bằng câu tiếng Anh ngắn, không chứa thông tin xác thực, đường dẫn hệ thống.

## ❌ Cấm

- Dùng `except:` hoặc `except Exception:` rồi bỏ qua lỗi mà không ghi log.
- Ném `HTTPException` của FastAPI trong service.
- Bắt lỗi trong router để tự dựng response lỗi.
- Trả stack trace, câu SQL, đường dẫn file trong response.
- Ghi log cùng một lỗi ở nhiều tầng. Chỉ ghi ở nơi xử lý cuối cùng.
- Tự thử lại trong vòng lặp không giới hạn.
- Tự thử lại job khi công cụ lỗi hoặc worker mất kết nối.

## 💡 Ví dụ

✅ Đúng: service ném lỗi nghiệp vụ, bộ xử lý chung trả RFC 9457.

```python
class TargetOutOfScopeError(AppError):
    code = "target_out_of_scope"
    status = 422

async def create_job(session: AsyncSession, data: JobCreate) -> Job:
    if not await scope_service.allows(session, data.program_id, data.target):
        raise TargetOutOfScopeError(detail="target does not match in-scope rules")
```

❌ Sai: service dùng `HTTPException`, nuốt lỗi.

```python
try:
    await check_scope(data)
except Exception:
    raise HTTPException(400)
```

## 🔍 Cách kiểm tra

```bash
grep -rn "HTTPException" backend/app --include=service.py          # phải rỗng
grep -rnE "except( Exception)?:\s*$" -A1 backend workers --include=*.py | grep -B1 "pass$"   # phải rỗng
uv run ruff check --select BLE,TRY .
```

- Test: mỗi lớp `AppError` có test kiểm tra status, `code` và định dạng RFC 9457.

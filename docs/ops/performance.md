# Hiệu năng

> Phiên bản: 1.0 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 18: Hiệu năng
> Liên quan: [database.md](../data/database.md), [api/architecture.md](../api/architecture.md), [system.md](../architecture/system.md), [overview.md](../architecture/overview.md)

## 📌 Đây là gì

- Các điểm tối ưu bắt buộc của ReconOS: truy vấn, ghi dữ liệu của parser, upload và đọc output thô, cache, realtime, frontend.
- Cách đo hiệu năng. Không đặt chỉ tiêu định lượng: [overview.md](../architecture/overview.md).

## 🎯 Dùng để làm gì

- Giữ tốc độ khi dữ liệu tăng mà không đổi kiến trúc.
- Output thô lớn không làm cạn bộ nhớ Backend API, tiến trình nền (G8).

## ⏰ Dùng khi nào

- Viết truy vấn, endpoint danh sách, parser, màn hình bảng dữ liệu. Điều tra truy vấn, endpoint chậm.
- Không dùng để tra cách thêm bản chạy, thêm máy: xem [scalability.md](scalability.md).

## 📍 Ở đâu

- Index: [database.md](../data/database.md). Phân trang: [api/architecture.md](../api/architecture.md).
- Mã: `backend/app/<module>/service.py`, `backend/app/parser/`, `backend/app/dashboard/`, `frontend/src/lib/`.

## ⚙️ Làm như thế nào

### Truy vấn

- Danh sách dùng phân trang keyset theo cột sắp xếp và `id`. ❌ Không dùng `OFFSET`.
- Mỗi cột sắp xếp, cột lọc của endpoint danh sách có index tương ứng.
- Chỉ lấy cột cần cho response. Tải quan hệ bằng `selectinload`. ❌ Không truy vấn trong vòng lặp.
- `total` của danh sách:

| Điều kiện | Cách tính |
|---|---|
| Ước lượng của planner dưới 10.000 dòng | `COUNT` chính xác, `total_is_estimate = false` |
| Từ 10.000 dòng trở lên | Số dòng ước lượng từ `EXPLAIN`, `total_is_estimate = true` |

- Tìm kiếm chuỗi `q` trên cột văn bản dài: index trigram `pg_trgm`.

### Ghi dữ liệu của parser

- Upsert theo lô, mỗi câu `INSERT ... ON CONFLICT` ghi nhiều dòng. Kích thước lô: [configuration.md](configuration.md).
- Mỗi lô một transaction. Parse lại sau lỗi giữa chừng an toàn vì upsert idempotent.
- Đọc output thô dạng stream, từng dòng với JSONL (JSON Lines), từng mục với gói nén. ❌ Không nạp cả file vào bộ nhớ.
- Tính `in_scope` bằng scope rule nạp một lần cho mỗi lượt parse.

### Output thô

- Backend API stream body upload thẳng vào MinIO bằng multipart upload của aioboto3. ❌ Không ghi file tạm, không đọc cả file vào bộ nhớ.
- Tính SHA-256 trong lúc stream.
- Tải về: stream từ MinIO qua Backend API, không đệm toàn bộ.

### Cache

| Dữ liệu | Cache | Làm mới |
|---|---|---|
| Số liệu S02, S08: đếm tài sản, finding theo severity, job theo trạng thái | Redis, key cache theo program, thời hạn 30 giây | Hết hạn thì truy vấn lại |
| Scope rule của program | Không cache | Đọc trực tiếp, kết quả kiểm tra scope phải luôn mới (G5) |
| Quyền, program được gán | Không cache | Đọc trực tiếp |

- User xem nhiều program: backend cộng số liệu cache của từng program được gán.
- Số liệu trên S02 trễ tối đa một chu kỳ cache.

### Realtime và frontend

- Sự kiện WebSocket chỉ mang ID và trạng thái, frontend tự gọi REST khi cần chi tiết.
- Sự kiện `asset.discovered` gom theo job, không gửi từng tài sản.
- Frontend gom nhiều sự kiện liên tiếp thành một lần làm mới query.
- Bảng dài dùng virtual scroll. Mỗi trang tối đa 200 dòng theo `limit`.

### Dispatcher

- Dispatcher chờ `NOTIFY`, chỉ quét định kỳ để bù sự kiện bị lỡ. Chu kỳ: [configuration.md](configuration.md).
- Dispatcher chọn job bằng index một phần trên job `queued`.

### Cách đo

| Công cụ | Dùng để |
|---|---|
| `pg_stat_statements` | Tìm truy vấn tốn thời gian nhất |
| `EXPLAIN (ANALYZE, BUFFERS)` | Kiểm tra truy vấn mới dùng đúng index trước khi merge |
| Log thời gian xử lý request | Endpoint chậm: [logging.md](../../.claude/rules/logging.md) |
| S15 | Độ dài queue, số worker, độ trễ dispatcher |

- Truy vấn mới trên bảng tài sản, finding, job, `asset_event`: chạy `EXPLAIN` trên dữ liệu thử từ 10.000 dòng trở lên mỗi bảng. ❌ Kế hoạch truy vấn có `Seq Scan` trên các bảng này.

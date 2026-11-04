# Dùng Caveman

> Phiên bản: 1.0 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt

Caveman nén output công cụ trước khi vào context và trả handle `ccr_` để khôi phục. Hook cài sẵn ngoài repo. Rule này chỉ quy định khi nào dùng và khi nào cấm.

## ✅ Bắt buộc

- Lệnh dự kiến sinh trên 200 dòng: chạy qua `caveman tools shrink -- <lệnh>`.
- Giữ handle `ccr_` trong lượt trả lời. Cần bản gốc thì gọi `caveman_retrieve`, không chạy lại lệnh.
- Mảng JSON đồng dạng, trước khi trích vào context: mã hóa bằng `caveman_toon_encode`.
- Ghi rõ số token của Caveman là ước lượng cục bộ theo bộ đếm `o200k_base`, không dùng làm căn cứ báo cáo chi phí.
- Lưu quyết định và việc đã làm: chỉ dùng agentmemory theo [agentmemory.md](agentmemory.md).

## ❌ Cấm

- Nén output thô của job quét trước khi lưu. Lưu nguyên vẹn output thô trước, Caveman chỉ nén bản đưa vào context (G8).
- Đưa thông tin xác thực qua `caveman_compress`, `caveman tools compress`, `caveman tools shrink` hoặc `caveman mem`: API key, token, mật khẩu, nội dung `.env` (G7).
- Dùng `caveman mem` cho nội dung dự án.
- Chạy `caveman login`, bật routing, bật lại telemetry khi chưa có ADR. Lý do: routing đẩy lưu lượng của agent qua Caveman Cloud, mà output thô của job quét chứa thông tin xác thực thu được từ mục tiêu.

## 💡 Ví dụ

```bash
caveman tools shrink -- pytest backend -v   # đúng: output dài, giữ handle ccr_
cat .env | caveman tools compress           # sai: thông tin xác thực
```

Văn bản ngắn và đã cô đặc: Caveman trả `ratio` 0 và giữ nguyên nội dung. Đo thực tế: `docs/architecture/overview.md` 1.528 token, `frontend/package.json` 394 token, cả hai có `ratio` 0.

## 🔍 Cách kiểm tra

```bash
caveman telemetry status   # enabled: false
caveman status             # dòng routing không có "wired"
```

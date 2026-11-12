# Sổ quyết định đợt 9, Vigolium

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi dựng runner, parser `vigolium` và phần còn mock của S17. Engine thử nghiệm không trả lời khi dựng nên mọi lời gọi Vigolium lấy từ tài liệu REST trong `_reference/vigolium-docs/`. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu hoặc mâu thuẫn | Chọn | Tài liệu |
|---|---|---|---|
| V1 | Job nhiều mục tiêu chạy một hay nhiều lượt quét | Một lượt quét gồm mọi mục tiêu: `POST /api/scans/run` nhận mảng `targets`, Vigolium chỉ chạy một lượt quét mỗi lúc | `external-services.md` |
| V2 | Lượt quét chạm host nào | Runner đặt `scope_origin` là `strict`, chỉ host đúng mục tiêu (G5). Người dùng không đổi được | `external-services.md`, `contracts/tool_modules/vigolium.py` |
| V3 | Tham số tool module `vigolium` | `strategy`, `threads` thành `concurrency`, `rate` thành `rate_limit`. Không cho `headers`, `modules`, `only`, `skip`, `scanning_profile` | `external-services.md` |
| V4 | `max_concurrency`, thời hạn | 1 slot, 480 phút, migration `0010` | `external-services.md` |
| V5 | Engine trả `409` vì đang chạy lượt quét khác | Job `failed`, không thử lại: nợ 75 | `tech-debt.md` |
| V6 | Engine bỏ qua bộ lọc `scan_id` thì finding của program khác lọt vào job | Runner bỏ object có `scan_uuid` khác lượt quét của job, chỉ đọc trường này, không đọc nội dung finding (G8) | `external-services.md` |
| V7 | Body của `GET /api/scans/{scan_uuid}` không có mẫu trong tài liệu | Đọc `status` ở gốc hoặc trong `data`. Trạng thái lạ kết thúc lượt hỏi và cho job `failed` | `external-services.md`, nợ 12 |
| V8 | Giới hạn file output thô | 100.000 finding hoặc 2 GiB, khớp giới hạn của parser | `external-services.md` |
| V9 | `dedup_key` khi thiếu `finding_hash` | `module_id`, `severity`, `matched_at` đầu tiên, các trường Vigolium dùng để gộp finding trùng | `external-services.md` |
| V10 | Bật, tắt native module qua REST | Ghi khóa `dynamic-assessment.enabled_modules.*` bằng `POST /api/config`. Tắt hết module của một loại: `422 module_required`, vì danh sách rỗng có thể bị engine hiểu là mặc định | `external-services.md`, `api/architecture.md`, `openapi.yaml` |
| V11 | Kiểm tra cấu hình | `GET /api/diagnostics`. Chỉ `database` lỗi là `critical`, vì lượt quét native không cần agent, trình duyệt | `external-services.md` |
| V12 | Kiểm tra model LLM | Ghi cấu hình LLM vào engine bằng `POST /api/config` rồi đọc kiểm tra `agent`. Engine giữ cấu hình đã ghi: nợ 76 | `external-services.md`, `tech-debt.md` |
| V13 | Runner Osmedeus và Vigolium lặp mã thử lại REST | Tách `workers/worker/runners/engine_client.py`, hai runner kế thừa | `directory-structure.md` |
| V14 | Output thô mẫu không lấy được từ lần chạy thật | Dựng theo object finding trong tài liệu: nợ 77 | `tech-debt.md` |
| V15 | Lỗi bật, tắt module trên S17 | Mã `module_required` hiện câu riêng, lỗi khác giữ câu thử lại | Sổ này |

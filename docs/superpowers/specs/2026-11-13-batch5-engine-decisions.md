# Sổ quyết định đợt 5, phần engine

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Quyết định agent tự chọn khi dựng module `engine`, runner Osmedeus, S16. Tài liệu đã đồng bộ ghi ở cột Tài liệu.

| # | Chỗ chưa có trong tài liệu hoặc mâu thuẫn | Chọn | Tài liệu |
|---|---|---|---|
| E1 | Cô lập workspace Osmedeus theo job, nợ 12 | `params.space_name` là `reconos-<job_id>-<n>`, mã nguồn Osmedeus v5.1.2 dùng giá trị này làm tên workspace | `external-services.md`, `tech-debt.md` |
| E2 | `GET /osm/api/artifacts/{workspace}` chỉ trả một file theo `artifact_path`, không trả zip cả workspace | Tải zip bằng `GET /osm/api/snapshot-download/{workspace}` | `external-services.md` |
| E3 | Job nhiều mục tiêu dùng chung `space_name` thì ghi đè file của nhau | Mỗi mục tiêu một lượt chạy, chạy lần lượt, một gói `osmedeus.zip` có `manifest.json` và thư mục `<n>/` | `external-services.md`, `contracts/tool_modules/osmedeus.py` |
| E4 | Tên tham số Scan Tactics, nợ 8 | `scan_preset` thành `tactic`: `quick` `aggressive`, `balanced` `default`, `deep` `gently`. `EngineSpec` thêm `settings` | `external-services.md`, `schema.md` |
| E5 | Dòng `engine` tạo thế nào khi API không có `POST /engines` | Migration `0005` tạo một dòng mỗi engine trong mã, tắt, chưa có địa chỉ. Bật cần `base_url` và API key | `schema.md`, `api/architecture.md` |
| E6 | Lỗi khi engine không trả lời | `502 engine_unavailable`. Kiểm tra thất bại vẫn ghi `last_test_ok` qua session độc lập | `api/architecture.md`, `openapi.yaml` |
| E7 | S16, S17 không có ô bật engine trong mockup, engine tắt thì job engine luôn `failed` | Quy tắc M6: thêm ô Engine enabled vào phần kết nối chung của S16, S17 | Sổ này |
| E8 | Ba tool module Osmedeus trong `external-services.md`, đợt 5 chỉ ghi một | Dựng cả ba bằng một lớp chung, thời hạn 240, 720, 1.200 phút, dưới `visibility_timeout` 24 giờ | `external-services.md` |
| E9 | Workspace còn trên engine server sau khi tải | Chưa có REST xóa workspace: nợ 51 | `tech-debt.md` |

Kiểm chứng trên Osmedeus v5.1.2 thật ngày 2026-11-13: E1, E2 đúng. E9 có thêm bước xóa bản zip snapshot. Chi tiết: [sổ kiểm chứng engine thật](2026-11-13-real-engines-decisions.md).

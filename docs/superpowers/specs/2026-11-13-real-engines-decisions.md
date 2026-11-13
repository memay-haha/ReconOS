# Sổ quyết định kiểm chứng engine thật

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Kết quả chạy job ReconOS đầu-cuối trên Osmedeus v5.1.2 và Vigolium v0.5.6 của máy công cụ, mục tiêu là container lab cố ý có lỗ hổng. Quyết định agent tự chọn khi sửa chỗ lệch, tài liệu đã đồng bộ ghi ở cột Tài liệu.

## Chỗ lệch đã sửa

| # | Lệch so với engine thật | Chọn | Tài liệu |
|---|---|---|---|
| R1 | Subdomain nằm ở `subdomain/subdomain-<workspace>.txt`, IP ở `ipspace/<workspace>-ip.txt`, không phải `final-`, `ip-`. Parser không đọc được hai file này | Sửa đường dẫn trong `WORKSPACE_FILES` của parser, đổi tên file trong output thô mẫu | `external-services.md` |
| R2 | Gốc workspace có `run-state.json`, `run-completed.json`, `run-execution.log`, `run-console.log`, `run-workflow.yaml`. Các file chép lại `params` của lượt chạy, gồm biến engine, và `global_vars` của engine server | Runner bỏ mọi file ở gốc workspace khỏi gói (G7). Output công cụ luôn nằm trong thư mục con | `external-services.md`, `contracts/tool_modules/osmedeus.py` |
| R3 | Mỗi lần `snapshot-download`, Osmedeus giữ lại một bản zip trong thư mục snapshot | Runner xóa bản zip bằng `DELETE /osm/api/snapshots/{name}`, tên lấy từ `Content-Disposition`, chỉ khi mở đầu bằng `<workspace>_` | `external-services.md`, `deployment.md`, nợ 51 |
| R4 | Tài liệu REST có `DELETE /osm/api/workspaces/{name}`, mã nguồn v5.1.2 không có | Dọn workspace `reconos-*` bằng cron trên máy engine | `deployment.md`, nợ 51 |
| R5 | `GET /api/config` in danh sách module theo dạng Go `[all]`, `[a, b]` | Giữ bộ đọc hiện có, đã đọc đúng hai dạng. Server mock của test đổi sang dạng thật | `external-services.md` |
| R6 | `POST /api/config` ghi lại toàn bộ `vigolium-configs.yaml`, comment mất | Ghi cảnh báo sao lưu trong `deployment.md`. Không đẩy cấu hình tự động khi lưu S17, nợ 76 | `deployment.md`, `external-services.md` |
| R7 | Kiểm tra `agent` của `GET /api/diagnostics` chỉ đọc cấu hình, không gọi model: base URL sai vẫn `ok` | Verify Model trả `ok` kèm dòng `advisory` báo engine không gọi thử model | `external-services.md` |
| R8 | Lượt quét mở ngoài ReconOS giữ engine Vigolium, job ReconOS `failed` ngay | Runner chờ engine rảnh, gửi heartbeat, gửi lại mỗi `heartbeat_seconds` tới hết thời hạn job | `external-services.md`, nợ 75 |
| R9 | Object finding của `GET /api/findings` không có `request`, `response` | Parser giữ hai trường trống. Output thô mẫu thay bằng file của job thật | nợ 77 |

## Đã xác nhận đúng như tài liệu

| Mục | Kết quả |
|---|---|
| `params.space_name` | Osmedeus dùng làm tên workspace, thư mục `~/workspaces-osmedeus/reconos-<job_id>-1` |
| `GET /osm/api/runs/{run_uuid}` | `data.status` `running` rồi `completed` |
| `GET /osm/api/snapshot-download/{workspace}` | Zip cả workspace, `404` khi không có workspace |
| `GET /osm/api/workflows`, chi tiết `?json=true` | Đúng như adapter đọc. Body chi tiết không có `tags` |
| `POST /api/scans/run` | `202` với `scan_uuid`. Nhận `strategy`, `concurrency`, `rate_limit`, `scope_origin` `strict`, `scanning_max_duration` |
| `GET /api/scans/{scan_uuid}` | Object lượt quét, `status` ở gốc |
| `GET /api/modules`, `GET /api/diagnostics` | Đúng như adapter đọc |
| `POST /api/config` | Có hiệu lực ngay, kể cả mục `agent`, không cần khởi động lại |

# Sổ quyết định vòng 2: kiểm chứng công cụ thật trong worker

> Phiên bản: 1.0 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Kiểm chứng nuclei, gowitness, sqlmap, dalfox chạy thật từ image worker trên lab cố ý có lỗ hổng, để đóng nợ 42, 65, 66, 67, 71 trong [tech-debt.md](../../tech-debt.md) và các dòng "chưa chạy thật" của [sổ đợt 7](2026-11-13-batch7-decisions.md), [sổ đợt 8](2026-11-13-batch8-decisions.md). Quyết định agent tự chọn khi brief vòng 2 cho phép.

## Môi trường kiểm chứng

| Thành phần | Giá trị |
|---|---|
| Image worker | `reconos-worker:wt`, build từ `infras/docker/worker.Dockerfile` |
| nuclei | v3.11.1, templates 10.5.2 |
| gowitness | 3.2.2, Chromium 156 từ kho Debian |
| sqlmap | 1.10.8 |
| dalfox | 3.2.4 |
| Lab Juice Shop | container `reconos-lab-juice`, `bkimminich/juice-shop:v18.0.0`, cổng 3001 |
| Lab app tự viết | container `reconos-lab-testapp`, Python stdlib, cổng 8081, SQLi ở `/item?id=`, reflected XSS ở `/search?q=` |

## Quyết định

| # | Vấn đề | Chọn | Lý do |
|---|---|---|---|
| R1 | Pipeline đầy đủ job → worker → MinIO → parse cần backend cô lập, mà backend cần mật khẩu role `reconos_app` dùng chung | Kiểm chứng ở mức binary công cụ và parser ngoại tuyến, không dựng backend cô lập | Lấy mật khẩu role dùng chung trái G7. Khâu nối worker ↔ backend đã có test tích hợp dùng mock. Ghi nợ 97 |
| R2 | Lab mục tiêu để sqlmap, dalfox sinh finding tất định | Thêm app tự viết `reconos-lab-testapp` bên cạnh Juice Shop | SQLi của Juice Shop không được sqlmap xác nhận ở mức mặc định `level 1 risk 1`. App tự viết cho SQLi, XSS tất định. Ghi nợ 99 |
| R3 | Thay toàn bộ fixture bằng một lần chạy thật | Giữ fixture, thêm trường thật còn thiếu | Fixture hiện khớp output thật từng trường, lại giữ dòng ca biên mà một lần chạy không có, theo [testing.md](../../../.claude/rules/testing.md). Chỉ thêm `target_summary` của meta dalfox 3.2.4 |
| R4 | Proxy có tài khoản chưa chạy thật | Để sau | Lab riêng không có proxy có tài khoản. Ghi nợ 98 |

## Kết quả chạy thật

- nuclei: trên Juice Shop sinh 11 finding, thoát mã 0. Key dòng JSONL khớp parser, có thêm `curl-command`, `template-url` mà parser không cần.
- gowitness: trên Juice Shop chụp được screenshot PNG, ghi một dòng JSONL. Trên URL chết (cổng đóng) không ghi dòng JSONL, chỉ ghi `failed to witness target` ra `stderr.txt`, xác nhận nợ 65. Dòng JSONL có `network[].time`, cookie không có `same_site`, khớp cách bù của đợt 7.
- sqlmap: trên `reconos-lab-testapp` tìm injection tham số `id`, kỹ thuật BETU, ghi `results.csv` đúng định dạng runner đóng gói.
- dalfox: trên `reconos-lab-testapp` tìm reflected XSS tham số `q`, thoát mã 1 nằm trong `success_exit_codes`, ghi `dalfox.jsonl` đúng định dạng. Meta thật có thêm `target_summary`.
- Mọi cờ dòng lệnh của 4 runner đều có trong `--help` của công cụ tương ứng trong image.
- Tên file ảnh gowitness `http---<host>-<port>.png` khớp allowlist `RAW_OUTPUT_FILENAME_PATTERN`.

Không tìm thấy lỗi cờ, định dạng output hay mã thoát so với runner và parser hiện có.

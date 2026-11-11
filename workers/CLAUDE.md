# Workers

Worker nhận task job, chạy công cụ hoặc gọi engine qua runner, gửi output thô về Backend API. Quy tắc chung: [CLAUDE.md](../CLAUDE.md), [.claude/rules/](../.claude/rules/).

## 🚫 Cấm

- Parse output thô (G8).
- Đọc, ghi CSDL, truy cập MinIO (G1, G8).
- Import `backend/`. Chỉ dùng chung model trong `contracts/`.
- Lấy mục tiêu, tham số từ nguồn khác ngoài đặc tả job nhận khi claim (G5).
- Dùng tham số ngoài allowlist của schema tool module.
- Dùng `shell=True`, ghép chuỗi lệnh.
- Ghi proxy, API key, biến engine, token worker ra log, file output.
- Tự thử lại job khi công cụ lỗi.

## 📐 Quy ước

**Contract:**

- Nhận task `worker.run_job` chỉ có tham số `job_id`, từ queue `job.<tool module>`.
- Gọi endpoint claim, heartbeat, upload, finish, gửi log theo [external-services.md](../docs/integrations/external-services.md).
- Gọi Backend API qua `worker/client.py`, thử lại theo [error-handling.md](../.claude/rules/error-handling.md).
- Gửi heartbeat job theo `job_heartbeat_seconds`.
- Gửi heartbeat worker kèm `tool_modules`, `tools` gồm `name`, `version` của công cụ đã cài, `cpu_percent`. Gọi `finish` kèm `tool_version` của công cụ đã chạy job.
- Khi nhận `cancel`: dừng công cụ, upload phần đã có, gọi `finish`.

**Runner:**

- Viết một file cho mỗi tool module trong `worker/runners/`.
- Cho runner kế thừa lớp cơ sở trong `base.py`, đăng ký theo tên tool module.
- Kiểm tra lại tham số bằng schema trong `contracts/` trước khi dựng lệnh.
- Tạo một thư mục làm việc cho mỗi job trong `RECONOS_WORKER_WORKDIR`.
- Ghi mục tiêu ra file, truyền đường dẫn file cho công cụ.
- Upload `stdout.txt`, `stderr.txt` và file output.
- Nén thư mục output thành một gói.
- Với engine: gọi REST API bằng `engine.base_url` và API key nhận khi claim.

**Log:**

- Ghi log structlog JSON ra stdout, gửi theo lô về Backend API: [logging.md](../.claude/rules/logging.md).

## 🛠️ Build và test

| Lệnh | Việc |
|---|---|
| `uv run pytest workers/tests` | Test runner, client. Mock tiến trình con và API engine |
| `uv run --directory workers celery -A worker.celery_app worker -Q job.nuclei` | Chạy worker khi phát triển, đổi queue theo tool module |
| `docker build -f infras/docker/worker.Dockerfile .` | Build image worker có công cụ |

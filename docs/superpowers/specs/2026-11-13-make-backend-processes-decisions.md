# Sổ quyết định: tiến trình của `make backend`, nợ 58

> Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Người dùng đã duyệt: `make backend` chạy thêm dispatcher, tiến trình nền và Celery Beat. Bảng dưới ghi chỗ tài liệu chưa nói và lựa chọn của agent.

| # | Chỗ chưa có trong tài liệu | Chọn | Tài liệu |
|---|---|---|---|
| P1 | Cách dừng cả nhóm khi một tiến trình thoát | Mỗi tiến trình chạy trong nhóm tiến trình riêng bằng `setsid`. `wait -n` chờ tiến trình đầu tiên thoát, rồi gửi `SIGTERM` cho mọi nhóm, chờ tối đa 10 giây, sau đó `SIGKILL`. Lý do: `kill 0` cũ gửi tín hiệu cho cả `make`, còn `kill <pid>` không tới tiến trình con của `uvicorn --reload`, `next dev` | `CLAUDE.md`, `Makefile` |
| P2 | Mã thoát | Tiến trình thoát trước trả mã khác 0 thì `make backend` trả mã đó. Thoát với mã 0 vẫn tính là lỗi, trả 1, vì tiến trình dài hạn không được tự dừng. Ctrl-C trả 0 | `Makefile` |
| P3 | Phân biệt log | Mỗi dòng mang tiền tố `[api]`, `[dispatcher]`, `[background]`, `[beat]`, `[frontend]` qua `sed -u`. Đặt `PYTHONUNBUFFERED=1` để log Python không bị giữ trong bộ đệm khi stdout là pipe | `CLAUDE.md` |
| P4 | File lịch của Celery Beat | Ghi vào `data/celerybeat-schedule`, thư mục đã gitignore, để không sinh file lạ trong `backend/` | `configuration.md` |
| P5 | Frontend gọi sai Backend API khi đổi `API_PORT` | `Makefile` đặt `RECONOS_API_URL ?= http://API_HOST:API_PORT`. Đổi cổng bằng `API_PORT`, `WEB_PORT` trên dòng lệnh hoặc trong `.env` | `configuration.md` |
| P6 | Bộ E2E thiếu luồng tạo job qua giao diện | Thêm `frontend/e2e/job-create.spec.ts`: Run Scan trên S11, mục tiêu ngoài scope bị từ chối và không tạo job (G5), mục tiêu trong scope tạo job nuclei, S10 hiện job | `frontend/CLAUDE.md` |
| P7 | `finding-triage.spec.ts` còn chuyển sang `reported` bằng menu dòng, trái quy tắc chỉ nộp báo cáo mới chuyển sang `reported` của đợt 11 | Sửa spec: menu dòng không có Reported, đi `confirmed` sang `resolved` | Sổ này |

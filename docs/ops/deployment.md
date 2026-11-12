# Triển khai

> Phiên bản: 1.6 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt
> Mục 20: Triển khai
> Liên quan: [system.md](../architecture/system.md), [configuration.md](configuration.md), [scalability.md](scalability.md), [security.md](../../.claude/rules/security.md)

## 📌 Đây là gì

- Cách đóng gói, cấu hình mạng, triển khai bản mới, rollback và sao lưu ReconOS ở môi trường phát triển và production.

## 🎯 Dùng để làm gì

- Tái tạo được mọi môi trường từ mã trong repo, không cài tay.
- Chỉ mở ra ngoài đúng các cổng cần thiết theo vùng tin cậy (G7). Dữ liệu và output thô khôi phục được (G8).

## ⏰ Dùng khi nào

- Dựng môi trường, triển khai bản mới, thêm máy worker, rollback, khôi phục dữ liệu.
- Không dùng để tra ý nghĩa biến môi trường: xem [configuration.md](configuration.md).

## 📍 Ở đâu

- Cấu hình hạ tầng: `infras/`. Lệnh rút gọn: `Makefile` ở gốc repo.

## ⚙️ Làm như thế nào

### Môi trường

| Môi trường | Chạy ở | Khác biệt |
|---|---|---|
| Phát triển | Máy cá nhân, Docker Compose | Mã mount vào container, tự nạp lại khi sửa. Cấu hình từ `.env`. Có thêm CSDL test |
| Production | Máy chủ vùng lõi, máy worker, máy engine | Image đóng gói sẵn, thông tin xác thực qua Docker secrets |

### Thư mục `infras/`

| Đường dẫn | Chứa |
|---|---|
| `infras/docker/` | Dockerfile của `backend`, `frontend`, `worker` |
| `infras/compose/compose.dev.yaml` | Toàn bộ vùng lõi cho phát triển |
| `infras/compose/compose.core.yaml` | Vùng lõi production |
| `infras/compose/compose.worker.yaml` | Một máy worker production |
| `infras/nginx/` | Cấu hình Nginx |
| `infras/postgres/` | Script tạo CSDL `reconos`, `reconos_log`, hai CSDL test và tài khoản `reconos_app`, `reconos_log_app` |
| `infras/minio/` | Script tạo bucket output thô và bucket test |
| `infras/redis/` | `acl.conf`: quyền tài khoản `default` của lõi và `worker`, không chứa mật khẩu. `render-acl.sh`: entrypoint của container Redis, ghi aclfile chứa SHA-256 của mật khẩu rồi chạy `redis-server` |

### Container vùng lõi

| Service | Image | Lệnh | Số bản |
|---|---|---|---|
| `nginx` | Nginx chính thức | | 1 |
| `frontend` | `reconos-frontend` | Server Next.js chế độ standalone | 1 trở lên |
| `api` | `reconos-backend` | `uvicorn app.main:app` | 1 trở lên |
| `dispatcher` | `reconos-backend` | `python -m app.dispatcher` | 1 hoạt động, có thể thêm bản chờ |
| `background` | `reconos-backend` | `celery -A app.background.celery_app worker -Q parse,schedule` | 1 trở lên |
| `beat` | `reconos-backend` | `celery -A app.background.celery_app beat` | Đúng 1 |
| `migrate` | `reconos-backend` | `alembic upgrade head`, chạy xong thì thoát | Chỉ khi triển khai |
| `bootstrap` | `reconos-backend` | `python -m app.bootstrap`, chạy xong thì thoát | Chỉ lần triển khai đầu |
| `postgres` | PostgreSQL 18 chính thức | Chứa `reconos` và `reconos_log` | 1 |
| `redis` | Redis 8 chính thức | Bật lưu xuống đĩa, bật ACL (Access Control List) | 1 |
| `minio` | `minio/minio` ghim theo digest, nạp từ file tar | | 1 |

- Mỗi container Uvicorn chạy một tiến trình. Thêm bản bằng `docker compose up --scale api=N`: [scalability.md](scalability.md).
- `api` có healthcheck `GET /api/v1/health`, không cần đăng nhập, chỉ trả trạng thái tiến trình còn chạy.
- Mọi service trong cả ba file compose dùng logging driver `json-file` với `max-size: 50m`, `max-file: 5`, để log stdout không làm đầy đĩa.

### Mạng

| Cổng mở | Cho ai | Ghi chú |
|---|---|---|
| 443 Nginx | Trình duyệt, worker | HTTPS, chuyển hướng cổng 80 sang 443 |
| Redis qua TLS | Máy worker | Tài khoản `worker` chỉ dùng key của queue job và key nội bộ Celery |
| REST API engine | Máy worker | Chỉ mở trong vùng worker, bật API key |

- PostgreSQL, MinIO, cổng của `api`, `frontend` chỉ nằm trong mạng nội bộ của Compose. ❌ Không mở ra ngoài.

#### Image MinIO

MinIO không còn phát hành image công khai và repo đã archived: nợ 19 trong [tech-debt.md](../tech-debt.md).

- Dùng bản `RELEASE.2025-09-07T16-13-09Z`, ghim trong compose bằng digest, đặt `pull_policy: never` để không gọi registry.
- Mang image sang máy khác bằng file tar: `docker save -o minio-<release>.tar minio/minio:latest` rồi `docker load -i` trên máy đích.
- Lưu file tar cùng nơi với bản sao lưu, kiểm tra `sha256sum` trước khi nạp.

#### Nginx

- Định tuyến `/api/` tới `api`, `/` tới `frontend`. `/api/v1/ws` bật nâng cấp WebSocket.
- `client_max_body_size` bằng `upload_max_bytes` cho `/api/v1/worker/`. Đường dẫn khác giữ giới hạn mặc định của Nginx là 1 MB.
- Tắt đệm request body cho upload output thô để stream thẳng tới `api`.
- Đặt header phản hồi theo [security.md](../../.claude/rules/security.md). Cấp chứng chỉ TLS bằng certbot.

### Máy worker và engine

- Image `reconos-worker` cài sẵn runner và công cụ: nuclei, gowitness, sqlmap, dalfox. Phiên bản công cụ cố định trong Dockerfile.
- Dockerfile tải công cụ và bộ template bằng `ADD --checksum`, sai SHA-256 thì build dừng. Hiện có nuclei 3.11.1 và nuclei-templates 10.5.2 trong `/home/reconos/nuclei-templates`. Job không tải template mới. gowitness 3.2.2 tải cùng cách. Chromium cho gowitness cài bằng `apt-get` từ kho Debian có chữ ký, ở `/usr/bin/chromium`.
- Mỗi máy worker chạy `compose.worker.yaml`, khai báo `RECONOS_WORKER_TOOL_MODULES` theo công cụ dùng trên máy đó.
- Worker kết nối Redis bằng tài khoản `worker`, ghi trong `RECONOS_REDIS_URL`, mật khẩu trong `RECONOS_REDIS_PASSWORD` của máy worker. Container Redis nhận cùng mật khẩu qua `RECONOS_REDIS_WORKER_PASSWORD`: [configuration.md](configuration.md).
- Cập nhật công cụ: đổi phiên bản trong Dockerfile, build image mới, triển khai lại máy worker. Worker báo phiên bản công cụ qua heartbeat, S15 hiển thị. ❌ Không cập nhật công cụ từ UI.
- Cài engine server Osmedeus, Vigolium trên máy riêng trong vùng worker theo hướng dẫn chính thức. Engine server chạy ở chế độ server có API key.
- Dọn thư mục làm việc và dữ liệu lượt chạy cũ trên engine server bằng lịch chạy định kỳ trên máy engine. ReconOS đã giữ bản gốc trong output thô.

### Triển khai bản mới

1. Build image `reconos-backend`, `reconos-frontend`, `reconos-worker`, gắn tag theo phiên bản. Image `reconos-frontend` build với `RECONOS_NODE_NAME` của môi trường đích: [configuration.md](configuration.md).
2. Trên máy vùng lõi, kéo image mới.
3. Chạy `migrate`. Nếu `migrate` lỗi, dừng triển khai, không khởi động lại service.
4. Khởi động lại `api`, `frontend`, `background`, `beat`, `dispatcher` với image mới.
5. Kiểm tra healthcheck và trang S15.
6. Triển khai lại máy worker với image mới.

- Lần triển khai đầu tiên: chạy `bootstrap` sau `migrate` để tạo tài khoản Superadmin đầu tiên: [authentication.md](../security/authentication.md).
- Contract worker thay đổi tương thích ngược trong một phiên bản: backend mới phải phục vụ được worker cũ trong lúc triển khai lần lượt.
- Migration tương thích ngược với mã của phiên bản trước: thêm cột cho phép `NULL` trước, xóa cột cũ ở phiên bản sau.

### Rollback

1. Chạy lại image của phiên bản trước cho các service. Không chạy migration downgrade.
2. Chỉ khôi phục bản sao lưu khi dữ liệu hỏng.

- Schema mới vẫn chạy được với mã cũ nhờ migration tương thích ngược.

### Sao lưu

| Dữ liệu | Cách sao lưu | Giữ |
|---|---|---|
| CSDL chính `reconos` | `pg_dump` hằng ngày, lưu ngoài máy vùng lõi | 14 bản gần nhất |
| CSDL log `reconos_log` | ❌ Không sao lưu | Theo `log_retention_days` |
| Output thô trong MinIO | `mc mirror` sang nơi lưu khác | Như bản gốc, vĩnh viễn |
| Image MinIO | File tar từ `docker save`, giữ cùng bản sao lưu | Cho tới khi đổi object storage |
| Khóa mã hóa `RECONOS_ENCRYPTION_KEYS` | Lưu riêng, tách khỏi bản sao lưu CSDL | Mọi khóa còn trong danh sách |

- Khôi phục: tạo lại CSDL từ bản `pg_dump`, đồng bộ output thô từ nơi sao lưu về MinIO, nạp đúng khóa mã hóa.
- Bản sao lưu CSDL chứa metadata output thô, finding và thông tin xác thực đã mã hóa: lưu ở nơi có kiểm soát truy cập.

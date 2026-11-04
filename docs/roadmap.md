# 🗺️ Lộ trình sản phẩm

> Phiên bản: 2.4 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 26: Đề xuất cải tiến
> Liên quan: [overview.md](architecture/overview.md), [tech-debt.md](tech-debt.md), [thiết kế thứ tự viết mã](superpowers/specs/2026-11-02-implementation-roadmap-design.md)

Phiên bản đầu chia thành 13 đợt. Mỗi đợt là một lát cắt chạy được từ giao diện xuống worker.

| Giai đoạn | Tính năng | Phụ thuộc | Trạng thái |
|---|---|---|---|
| Đợt 1. Nền tảng dự án | uv workspace, frontend Next.js, Docker Compose phát triển, `Makefile` | [tech-stack.md](architecture/tech-stack.md), [directory-structure.md](architecture/directory-structure.md) | 🟢 Xong |
| Đợt 1. Nền tảng dự án | `core`: cấu hình, kết nối CSDL, ghi log, lớp lỗi, khởi tạo Alembic | [configuration.md](ops/configuration.md), [logging.md](../.claude/rules/logging.md), [error-handling.md](../.claude/rules/error-handling.md) | 🟢 Xong |
| Đợt 2. Tài khoản và phân quyền | Đăng nhập, phiên phía server, 3 vai trò, nhật ký thao tác (G7), bảng ngưỡng vận hành. Màn hình S01, S12 | Đợt 1, [authentication.md](security/authentication.md), [authorization.md](security/authorization.md) | 🔵 Chờ duyệt |
| Đợt 3. Program và scope | Program, gán User, proxy, mã hóa thông tin xác thực. Màn hình S08, S09, S11 | Đợt 2, [schema.md](data/schema.md) | 🔴 Chưa làm |
| Đợt 3. Program và scope | So khớp scope rule 4 dạng, từ chối mục tiêu ngoài scope khi tạo job (G5) | Đợt 2, [business-flow.md](architecture/business-flow.md) | 🔴 Chưa làm |
| Đợt 4. Xương sống job và output thô | Contract worker ↔ backend, tool module, job, dispatcher, worker chạy `nuclei` (G4) | Đợt 3, [system.md](architecture/system.md), [external-services.md](integrations/external-services.md) | 🔴 Chưa làm |
| Đợt 4. Xương sống job và output thô | Lưu output thô nguyên vẹn vào MinIO và tải về (G8), sự kiện realtime của job. Màn hình S10, S18, S15 phần job | Đợt 3, [system.md](architecture/system.md), [api/architecture.md](api/architecture.md) | 🔴 Chưa làm |
| Đợt 5. Engine, tài sản và parser | Engine Osmedeus, biến engine, runner workflow. Màn hình S16 | Đợt 4, [external-services.md](integrations/external-services.md) | 🔴 Chưa làm |
| Đợt 5. Engine, tài sản và parser | Parser đầu tiên, tài sản domain, IP, URL, service, công nghệ, tag, sự kiện tài sản (G3). Màn hình S03, S04, S05 | Đợt 4, [modules.md](architecture/modules.md), [database.md](data/database.md) | 🔴 Chưa làm |
| Đợt 6. Finding và triage | Parser `nuclei`, khử trùng lặp finding, 6 trạng thái triage (G6). Màn hình S20 | Đợt 5, [business-flow.md](architecture/business-flow.md) | 🔴 Chưa làm |
| Đợt 7. Screenshot | Tool module `gowitness`, screenshot đi theo đường output thô. Màn hình S06, S07 | Đợt 5, [modules.md](architecture/modules.md) | 🔴 Chưa làm |
| Đợt 8. Nhóm khai thác và duyệt job | Tool module `sqlmap`, `dalfox`, luồng duyệt job, người tạo job không tự duyệt (G5). Màn hình S10 phần duyệt | Đợt 6, [authorization.md](security/authorization.md) | 🔴 Chưa làm |
| Đợt 9. Vigolium | Engine Vigolium, runner và parser sinh finding. Màn hình S17 | Đợt 6, [external-services.md](integrations/external-services.md) | 🔴 Chưa làm |
| Đợt 10. Cảnh báo và dashboard | Cảnh báo theo program, số liệu tổng hợp, sửa ngưỡng vận hành trên giao diện. Màn hình S02, S15 đầy đủ | Đợt 6, [modules.md](architecture/modules.md), [configuration.md](ops/configuration.md) | 🔴 Chưa làm |
| Đợt 11. Báo cáo | Báo cáo từ finding `confirmed`, truy vết về output thô làm bằng chứng (G6) | Đợt 6, [business-flow.md](architecture/business-flow.md) | 🔴 Chưa làm |
| Đợt 12. Lịch quét định kỳ | Lịch quét của program, Celery Beat sinh job đến hạn | Đợt 4, [system.md](architecture/system.md) | 🔴 Chưa làm |
| Đợt 13. Triển khai production | Reverse proxy TLS, compose production, sao lưu và khôi phục, chạy đủ 4 luồng E2E (end-to-end) | Đợt 12, [deployment.md](ops/deployment.md), [testing.md](../.claude/rules/testing.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | MFA (Multi-Factor Authentication) bằng TOTP (Time-based One-Time Password) cho mọi tài khoản, đạt ASVS (Application Security Verification Standard) L2 phần xác thực | [authentication.md](security/authentication.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | API key cá nhân cho tài khoản, mang quyền của vai trò | [authentication.md](security/authentication.md), [authorization.md](security/authorization.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | Tính năng tự sinh job nhóm recon khi có tài sản mới trong scope, cấu hình theo program, giới hạn độ sâu | [business-flow.md](architecture/business-flow.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | Nhiều engine server cho một engine, chia tải lượt chạy | [scalability.md](ops/scalability.md), [schema.md](data/schema.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | Hệ thống gom lỗi ngoại lệ, gửi thông báo bằng Sentry hoặc GlitchTip tự cài, lọc dữ liệu nhạy cảm trước khi gửi | [error-handling.md](../.claude/rules/error-handling.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | Quét bảo mật trong CI: pip-audit, pnpm audit, gitleaks, Semgrep | [security.md](../.claude/rules/security.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | Môi trường staging để thử migration và phiên bản mới trước khi đưa lên production | [deployment.md](ops/deployment.md) | 🔴 Chưa làm |
| Sau phiên bản đầu | Sao lưu WAL (Write-Ahead Logging), khôi phục CSDL theo thời điểm | [deployment.md](ops/deployment.md) | 🔴 Chưa làm |

- Bước chi tiết, bảng CSDL và test bắt buộc của từng đợt: [thiết kế thứ tự viết mã](superpowers/specs/2026-11-02-implementation-roadmap-design.md).
- Mỗi đợt sửa mockup lệch tài liệu trước khi dựng màn hình của đợt đó: [tech-debt.md](tech-debt.md).
- Danh sách màn hình: [index.json](design/screens/index.json).

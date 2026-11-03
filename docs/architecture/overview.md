# ReconOS: Tổng quan dự án

> Phiên bản: 1.10 · Ngày: 2026-10-30 · Trạng thái: 🟢 Xong
> Mục 1: Tổng quan dự án
> Liên quan: [tech-stack.md](tech-stack.md), [directory-structure.md](directory-structure.md), [glossary](../appendix/glossary.md), [ADR tự xây CSDL riêng](../decisions/adr-own-database.md)

---

## 1. 🔭 Tầm nhìn

Xây dựng nền tảng **điều phối công cụ bảo mật và lưu output tập trung** cho bug bounty. Hệ thống quản lý toàn bộ vòng đời: **scope → phát hiện tài sản → quét lỗ hổng → kiểm chứng và khai thác bằng công cụ → lưu output thô → triage finding → báo cáo**, trên một giao diện duy nhất, với dữ liệu do người dùng làm chủ hoàn toàn.

## 2. 🧩 Vấn đề cần giải quyết

- Dữ liệu và output phân tán ở nhiều công cụ, mỗi công cụ một định dạng, khó tra cứu chéo: Osmedeus, gowitness, nuclei, Vigolium, sqlmap, dalfox, reconftw.
- Output của công cụ quét và khai thác không được lưu tập trung, khó truy vết lại bằng chứng khi viết báo cáo.
- BBRF thiếu trường dữ liệu cần thiết, tag khó tùy biến, không có giao diện trực quan.
- Chạy công cụ thủ công, dễ chạy nhầm trên mục tiêu ngoài scope, vi phạm điều khoản program.
- Không có nơi lưu trạng thái triage của finding, phải ghi chép bên ngoài.

## 3. 🏁 Mục tiêu

| #  | Mục tiêu | Mô tả |
| -- | -------- | ----- |
| G1 | **Làm chủ dữ liệu** | Tự thiết kế CSDL riêng. **Loại bỏ hoàn toàn BBRF**: không cài đặt, không đồng bộ, không gọi API. BBRF chỉ là tài liệu tham khảo kiến trúc và tính năng: program, domain, URL, IP, service. Không phụ thuộc CSDL của Osmedeus hay Vigolium. |
| G2 | **Kế thừa và mở rộng tính năng** | Giữ đủ các tính năng tương đương BBRF, bổ sung trường dữ liệu và hệ thống tag tùy biến phục vụ dashboard. |
| G3 | **Hợp nhất tài sản** | ReconOS là nguồn sự thật duy nhất cho mọi tài sản, liên kết chéo domain ↔ IP ↔ URL ↔ service ↔ screenshot ↔ finding ↔ output thô. |
| G4 | **Điều phối mọi công cụ có kiểm soát** | Chạy mọi nhóm công cụ qua hàng đợi và worker phân tán. Thêm công cụ mới không cần sửa lõi hệ thống. |
| G5 | **Tuân thủ scope** | Mọi job chỉ được tạo cho mục tiêu khớp In-Scope và không khớp Out-of-Scope của program. Áp dụng cho mọi nhóm công cụ, đặc biệt là công cụ khai thác. |
| G6 | **Hỗ trợ báo cáo** | Phân loại finding theo severity và trạng thái triage, truy vết từ finding về output thô làm bằng chứng. |
| G7 | **Vận hành an toàn** | Xác thực, RBAC (Role-Based Access Control), quản lý thông tin xác thực, nhật ký thao tác, quản trị công cụ và engine tập trung. |
| G8 | **Lưu output tập trung** | Worker gửi output thô, backend **lưu nguyên vẹn** rồi mới parse. Output thô tra cứu và tải về được kể cả khi công cụ chưa có parser. |

## 4. 👥 Đối tượng sử dụng

| Vai trò | Mô tả |
| ------- | ----- |
| Superadmin | Quản trị toàn hệ thống: tài khoản, vai trò, công cụ, engine, cấu hình. |
| Admin | Vận hành nghiệp vụ trên toàn hệ thống: program, scope, job, duyệt job, triage, báo cáo. Không quản trị tài khoản, công cụ, engine. |
| User | Làm việc trên program được gán: xem dữ liệu, tạo job, triage, tạo báo cáo. |

Ma trận quyền chi tiết: [authorization.md](../security/authorization.md).

## 5. 📈 Quy mô

- Chưa ước tính được số program, tài sản, dung lượng output thô.
- Hệ thống phải thiết kế để **mở rộng ngang** mà không thay đổi kiến trúc: thêm worker, thêm dung lượng lưu trữ.

## 6. 📊 Mục tiêu cụ thể

| Nhóm | Chỉ tiêu |
| ---- | -------- |
| Dữ liệu | Tự động lưu output thô và nạp kết quả của mọi công cụ sau mỗi job. Khử trùng lặp finding theo chuỗi khử trùng lặp: `template-id`, `matched-at`. |
| Hiệu năng | Không đặt chỉ tiêu định lượng. Các điểm tối ưu bắt buộc: [performance.md](../ops/performance.md). |
| Scope | Bộ lọc scope có test tự động bắt buộc trong CI. |
| Trải nghiệm | Từ một domain xem đủ DNS, IP, URL, service, screenshot, finding, output thô, lịch sử job trong tối đa 2 lần nhấp. Sự kiện realtime qua WebSocket. |
| Bảo mật | Đạt ASVS (Application Security Verification Standard) mức L2 của OWASP (Open Worldwide Application Security Project) cho xác thực, quản lý phiên, kiểm soát truy cập. Thông tin xác thực luôn được che trên UI và mã hóa khi lưu: API key, token. |
| Giao diện | WCAG (Web Content Accessibility Guidelines) 2.1 mức AA, hai giao diện sáng và tối, hiển thị đúng trên màn hình rộng từ 390 px. |

## 7. 🎛️ Kiểm soát công cụ

- Cách dùng, tham số cho phép và tham số bị cấm của từng công cụ được định nghĩa **theo từng tool module**, xem [modules.md](modules.md).

## 8. ⛔ Ngoài phạm vi

- Tự động gửi báo cáo lên nền tảng bug bounty: HackerOne, Bugcrowd, Intigriti.
- Multi-tenant: nhiều tổ chức dùng chung một bản cài đặt với dữ liệu tách riêng.

## 9. 🏆 Tiêu chí thành công

- Thay thế hoàn toàn quy trình script thủ công hiện tại.
- Mọi công cụ trong quy trình đều chạy qua ReconOS, không còn output nằm rải rác ngoài hệ thống.
- Thời gian từ khi thêm scope tới khi có danh sách tài sản và finding đầu tiên ngắn hơn quy trình cũ. Đo thời gian này trên cùng một program ở cả hai quy trình.
- Toàn bộ màn hình liệt kê trong [docs/design/screens/index.json](../design/screens/index.json) hoạt động với dữ liệu thật.

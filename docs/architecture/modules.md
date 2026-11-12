# Module

> Phiên bản: 1.10 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt
> Mục 5: Phân rã module
> Liên quan: [system.md](system.md), [directory-structure.md](directory-structure.md), [dependency-graph.md](dependency-graph.md)

## 📌 Đây là gì

- Danh sách 17 module nghiệp vụ của backend và trách nhiệm từng module.
- Cấu tạo của tool module và quy định dùng công cụ theo từng tool module.

## 🎯 Dùng để làm gì

- Mỗi nghiệp vụ có đúng một module chịu trách nhiệm, tránh mã trùng và phụ thuộc chéo.
- Thêm công cụ chỉ bằng cách thêm tool module, không sửa lõi (G4). Mọi công cụ dùng tham số được kiểm soát (G5).

## ⏰ Dùng khi nào

- Thêm tính năng: xác định module nhận mã. Thêm công cụ mới. Cấu hình công cụ trên S18.
- Không dùng để tra chiều phụ thuộc giữa module: xem [dependency-graph.md](dependency-graph.md).

## 📍 Ở đâu

- Module backend: `backend/app/<module>/`. Tool module: `contracts/`, `workers/worker/runners/`, `backend/app/parser/`.
- Màn hình cấu hình tool module: S18. Màn hình cấu hình engine: S16 Osmedeus, S17 Vigolium.

## ⚙️ Làm như thế nào

### Module backend

| Module | Trách nhiệm | Màn hình |
|---|---|---|
| `program` | Program, điều khoản, tạm dừng, tiếp tục, lưu trữ program, gán User vào program, proxy của program | S08, S09, S11 |
| `scope` | Scope rule In-Scope, Out-of-Scope. So khớp mục tiêu với scope (G5) | S09, S11 |
| `asset` | Domain, IP, URL, service, công nghệ của URL, sự kiện tài sản và liên kết chéo giữa chúng (G3). Upsert tài sản cho parser, task tính lại `in_scope` khi scope rule đổi. Xóa mềm domain, xuất danh sách | S03, S04, S05 |
| `screenshot` | Screenshot do parser của gowitness tạo. Xóa mềm screenshot | S06, S07 |
| `tag` | Tag tùy biến gắn vào tài sản, finding (G2) | |
| `tool_module` | Danh mục tool module, cấu hình trong CSDL. Danh sách công cụ và phiên bản worker báo | S15, S18 |
| `engine` | Cấu hình kết nối, biến engine, `settings` của Osmedeus, Vigolium. Đọc workflow, native module qua REST của engine | S16, S17 |
| `job` | Tạo job đơn lẻ và hàng loạt, kiểm tra scope trước khi tạo, trạng thái, duyệt, ưu tiên, dọn hàng đợi. Tạo job từ lịch qua `create_scheduled_job` | S09, S10 |
| `schedule` | Lịch quét định kỳ của program, chạy ngay một lịch, chọn lịch đến hạn cho task `schedule`. Mọi job do lịch sinh đi qua service của `job` (G5) | S09, S16 |
| `dispatcher` | Giao job cho worker: [system.md](system.md) | S10, S15 |
| `raw_output` | Nhận, lưu, tra cứu, tải về output thô (G8) | |
| `parser` | Chọn parser theo tool module, chạy parser trong tiến trình nền. Không sở hữu bảng: ghi tài sản qua service của `asset`, trạng thái parse qua service của `raw_output` | |
| `finding` | Finding, severity, triage (G6) | S20 |
| `report` | Báo cáo từ finding, truy vết về output thô (G6) | |
| `dashboard` | Số liệu tổng hợp, tình trạng hệ thống, tìm toàn cục. Bảng `diagnostic_run` của lần chẩn đoán | S02, S15, header |
| `user` | Nghiệp vụ tài khoản: đăng nhập, vai trò, khóa, xóa mềm tài khoản, thu hồi phiên, ma trận quyền, chặn đăng nhập sai nhiều lần, token worker. Bảng `saved_filter` của bộ lọc đã lưu | S12, S04 |
| `audit_log` | Đọc nhật ký thao tác (G7). Bảng và hai hàm ghi nằm ở `core` | S12 |
| `alert` | Cảnh báo theo program, trạng thái đã đọc theo tài khoản | Chuông trên header |

- `core/` không phải module nghiệp vụ: cấu hình, kết nối CSDL, bảo mật, client object storage, realtime.
- `core` giữ bảng danh tính `user`, `user_session` và phần kiểm tra đăng nhập, vai trò. Lý do: [dependency-graph.md](dependency-graph.md).
- `core` cũng giữ bảng `audit_log` và hai hàm ghi nhật ký, vì phần kiểm tra vai trò ghi lại yêu cầu bị từ chối.
- `core` giữ bảng `system_setting` và endpoint `/system-settings`, vì mọi tầng đọc ngưỡng vận hành. `dashboard` chỉ đọc nên không sửa ngưỡng.
- `alert` nhận cảnh báo từ `job` khi job chuyển sang `failed`, `pending_approval` và từ `parser` khi có finding `critical`, `high` mới hoặc tài sản mới.
- Module chỉ gọi module khác qua `service.py`. Chiều phụ thuộc cho phép: [dependency-graph.md](dependency-graph.md).
- Cơ chế xác thực của `user`: [authentication.md](../security/authentication.md). Quyền: [authorization.md](../security/authorization.md).

### Tool module

Tool module bọc **một công cụ** hoặc **một workflow của engine**. Mỗi job chạy đúng một tool module.

| Thành phần | Nơi khai báo | Nội dung |
|---|---|---|
| Schema tham số | `contracts/tool_modules/<tool module>.py` | Tham số cho phép, kiểu, miền giá trị. Dùng chung cho backend kiểm tra và runner dựng lệnh. `param_schema` của `GET /tool-modules` sinh từ model này |
| Nhóm | `contracts/tool_modules/<tool module>.py` | Recon, quét hoặc khai thác. Cùng file khai báo tiêu đề, mô tả, `runs_on`, công cụ, `output_types` |
| Runner | `workers/worker/runners/<tool module>.py` | Dựng lệnh từ tham số đã kiểm tra, chạy công cụ, thu output thô |
| Parser | `backend/app/parser/<tool module>.py` | Đọc output thô, tạo tài sản và finding. Không bắt buộc: thiếu parser thì output thô vẫn lưu và tải về được (G8). Một lớp parser phục vụ được nhiều tool module cùng định dạng output thô, ví dụ `OsmedeusParser` cho 3 workflow Osmedeus |
| Cấu hình | CSDL, Superadmin sửa trên S18 | Bật, tắt. Tham số mặc định trong miền của schema. Giới hạn số job đồng thời và tốc độ |

- Mã quyết định tool module **có thể làm gì**. CSDL chỉ chọn trong phạm vi mã cho phép.
- ❌ Không tạo tool module mới từ UI. Thêm tool module là thêm mã và triển khai lại.
- Tool module bọc workflow engine: output thô là toàn bộ kết quả của workflow. Cách worker gọi engine: [external-services.md](../integrations/external-services.md).

### Quy định tham số

- Mỗi tool module khai báo **allowlist** tham số trong schema: tên, kiểu, miền giá trị.
- ❌ Không có ô nhập tham số tự do, không nhận chuỗi dòng lệnh từ người dùng.
- Backend kiểm tra tham số theo schema khi tạo job. Runner kiểm tra lại trước khi dựng lệnh.
- Mục tiêu của job lấy từ job đã kiểm tra scope, không lấy từ tham số (G5).
- Danh sách tham số cho phép và bị cấm của từng công cụ nằm trong schema của tool module đó, kèm test. Tham số bị cấm chỉ ghi để giải thích, không dùng để lọc.

💡 Ví dụ: schema của `sqlmap` cho phép `level`, `risk`, `technique` với miền giá trị cố định. `--os-shell`, `--file-write`, `--dump-all` không có trong schema nên không thể truyền vào.

### Nhóm công cụ và duyệt job

| Nhóm | Mô tả | Duyệt trước khi chạy |
|---|---|---|
| Recon | Thu thập tài sản: domain, IP, URL, service, screenshot | Không |
| Quét | Phát hiện lỗ hổng bằng request kiểm tra | Không |
| Khai thác | Gửi payload để xác nhận hoặc khai thác lỗ hổng | ✅ Bắt buộc |

- Tool module bọc workflow engine nhận nhóm cao nhất của các công cụ bên trong, theo thứ tự recon, quét, khai thác.
- Dispatcher không giao job đang chờ duyệt: [system.md](system.md). Ai có quyền duyệt job: [authorization.md](../security/authorization.md).

### Tool module ban đầu

| Tool module | Loại | Nhóm |
|---|---|---|
| `osmedeus-<workflow>` | Workflow của engine Osmedeus, mỗi workflow một tool module | Theo công cụ trong workflow |
| `gowitness` | Công cụ | Recon |
| `nuclei` | Công cụ | Quét |
| `vigolium` | Engine | Quét |
| `sqlmap` | Công cụ | Khai thác |
| `dalfox` | Công cụ | Khai thác |

- Danh sách workflow Osmedeus dùng làm tool module: [external-services.md](../integrations/external-services.md).

### Thêm tool module

1. Khai báo schema tham số và nhóm trong `contracts/tool_modules/`, thêm một dòng vào `TOOL_MODULES`.
2. Viết runner trong `workers/worker/runners/`, thêm một dòng import vào `runners/__init__.py`.
3. Nếu công cụ cần parse, viết parser trong `backend/app/parser/`.
4. Đăng ký parser trong `registry.py`.
5. Viết test cho schema, runner, parser.
6. Triển khai lại backend và workers.
7. Superadmin bật tool module trên S18.

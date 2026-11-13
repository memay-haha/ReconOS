# Sổ quyết định: mục tiêu job dạng wildcard

> Phiên bản: 1.0 · Ngày: 2026-11-13 · Trạng thái: 🔵 Chờ duyệt

Program chỉ khai báo scope wildcard, ví dụ `*.carlevana.md` của Open Bug Bounty, không tạo được job dò subdomain: scope rule `*.example.com` không khớp domain gốc `example.com`, và trước đây mục tiêu job không được có `*`. Người dùng chọn cho phép mục tiêu job dạng wildcard `*.example.com`. Quy tắc chính thức: mục Kiểm tra scope của [business-flow.md](../../architecture/business-flow.md).

## Quyết định

| # | Quyết định | Lý do | Phương án đã loại |
|---|---|---|---|
| 1 | Mục tiêu thứ năm `*.<domain>`, lớp `WildcardTarget` trong `app/scope/matching.py`. Phần sau `*.` đọc bằng chính hàm đọc scope rule wildcard, dạng chuẩn hóa `*.<domain chuẩn hóa>` | `*.x` là mục tiêu và là scope rule thì chỉ cùng một tập host | Cho In-Scope wildcard `*.a` khớp domain gốc `a`: đổi nghĩa scope rule đã chốt, mở rộng scope ngầm cho mọi tool module |
| 2 | In-Scope: chỉ scope rule wildcard `*.a` với `b` bằng `a` hoặc nằm dưới `a` khớp `*.b`. Domain, URL, CIDR không khớp | Rule domain, URL chỉ nêu một host, không phủ được tập subdomain chưa biết | Coi rule domain `b` khớp `*.b` |
| 3 | Out-of-Scope đọc như mục tiêu CIDR: chạm là từ chối. Wildcard `*.c` với `c` bằng `b`, dưới `b` hoặc chứa `b`. Domain hoặc host URL bằng `b` hoặc dưới `b`. Dùng chung `_relates(whole=...)` | httpx trong flow gửi request tới host tìm được. Host Out-of-Scope nằm trong tập thì job vi phạm G5 | Lọc host Out-of-Scope sau khi chạy: request đã gửi |
| 4 | Domain gốc `b` bị Out-of-Scope chạm cũng từ chối `*.b` | Runner gửi `b` cho engine, flow chạy từ `b` | |
| 5 | Cờ `accepts_wildcard: bool = False` trên `ToolModuleSpec`. Bật cho `osmedeus-domain-lite`, `osmedeus-general`, `osmedeus-domain-extensive` qua tham số của `osmedeus_spec` | Cả 3 flow mở đầu bằng subfinder trên domain gốc. Cờ trong mã, không trong CSDL, theo quy tắc mã quyết định tool module làm được gì | Rẽ nhánh theo tên tool module. Cột CSDL Superadmin sửa được |
| 6 | Kiểm tra cờ trong `require_in_scope(..., accepts_wildcard=...)` của `scope`, tham số bắt buộc. Lỗi `422 validation_error`, `errors[].code` là `target_type_not_supported`, `field` là `target[<i>]`. Kiểm sau scope: mục tiêu ngoài scope vẫn báo `target_out_of_scope` | Một chỗ kiểm cho tạo job, thử lại, tạo và sửa lịch, dispatcher. Tham số bắt buộc nên nơi gọi mới không quên được | Lớp lỗi cấp cao mới: lỗi này là dữ liệu sai cho tool module đã chọn, cùng loại `tool_module_disabled` |
| 7 | `bulk-create` dùng một danh sách mục tiêu cho mọi tool module: wildcard chỉ qua khi mọi tool module trong lô có cờ | Tất cả hoặc không, như các kiểm tra khác | |
| 8 | Dispatcher bắt cả `ValidationFailedError`, hủy job với lý do ra khỏi scope | Chỉ xảy ra khi dữ liệu cũ hoặc mã đổi cờ. Hủy an toàn hơn giao | Lý do hủy riêng: cần giá trị mới, không đáng cho trường hợp không xảy ra khi dùng bình thường |
| 9 | Đổi mục tiêu ở một chỗ: `base_domain` trong `contracts/tool_modules/base.py`, runner Osmedeus gọi khi dựng body lượt chạy. `manifest.json` giữ `*.b` | Worker không import backend. Parser không đọc `runs[].target` | Đổi trong từng runner |
| 10 | `worker/tasks.py` kết thúc job `failed` khi runner không có cờ mà nhận mục tiêu wildcard | Công cụ nhận `*.b` nguyên văn sẽ lỗi theo cách khó hiểu hơn | |
| 11 | `GET /tool-modules` trả `accepts_wildcard`. S08 Run Scan với mục tiêu wildcard chọn sẵn tool module đầu tiên có cờ. Không kiểm tra ở frontend | Frontend không chứa nghiệp vụ scope | |
| 12 | Không cần migration: `job.target`, `schedule.target` là mảng `text` | | |
| 13 | Tài sản không bị ảnh hưởng: `canonical_domain` trong `app/asset/ingest.py` bỏ `*.` của tên domain từ output thô trước khi so khớp | Parser không sinh tài sản `*.b` | |

## Còn để sau

- Nợ 100 trong [tech-debt.md](../../tech-debt.md): flow có thể gửi request tới domain gốc `b` dù scope chỉ có `*.b`.

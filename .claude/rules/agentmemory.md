# Quy trình agentmemory

Lưu quyết định và việc đã làm của ReconOS để dùng lại ở các phiên Claude Code sau. Ba nguyên tắc: nhớ lại trước khi làm, lưu sau khi chốt, xóa memory cũ hoặc mâu thuẫn.

## Nhớ lại trước khi làm

- Gọi `memory_smart_search` trước khi sửa phần đã có quyết định: tài liệu, schema, hạ tầng, worker, parser, phân quyền. Ưu tiên dùng nhãn ở mục Bộ nhãn làm từ khóa.
- Với câu hỏi kiến thức chung hoặc việc chưa từng có quyết định liên quan: không gọi `memory_smart_search`.
- Khi giao việc cho subagent: yêu cầu subagent tự gọi `codegraph_explore` và `memory_smart_search` trước khi sửa, hoặc đưa sẵn kết quả vào prompt.

## Lưu sau khi chốt

- Tín hiệu lưu: "chốt", "xong", "duyệt", "lưu memory", "cập nhật memory". Gặp tín hiệu: chỉ lưu, không làm tiếp việc còn dở.
- Chỉ lưu nội dung đã xác minh và tôi đã xác nhận.
- Trước khi gọi `memory_save`, tìm memory liên quan:
  - Mâu thuẫn hoặc đã bị thay thế: xóa bằng `memory_governance_delete`, ghi lý do.
  - Không mâu thuẫn: giữ nguyên, lưu bản mới bên cạnh.
  - Có nhãn `pending` mà việc đã xong: xóa.
- Sau khi lưu: báo số memory đã lưu và đã xóa.

## Quan hệ với tài liệu dự án

- Quyết định kiến trúc: nguồn chính là ADR trong `docs/decisions/`. Trong memory chỉ ghi tóm tắt một câu kèm tên file ADR.
- Quy tắc đã có trong `docs/` hoặc `.claude/rules/`: không chép vào memory, chỉ ghi tên file.
- Trạng thái tài liệu: nguồn chính là `docs/documentation-roadmap.md`, không lưu vào memory.

## Nội dung cần lưu

Phép thử: nội dung đã có trong mã hoặc `docs/` thì không lưu.

| ✅ Lưu | ❌ Không lưu |
|---|---|
| Quyết định và lý do, kể cả phương án đã loại | Cách viết mã: thuật toán, cấu hình thư viện, cú pháp, cách viết test |
| Quy tắc nghiệp vụ phải tuân theo khi làm tiếp | Chi tiết bên trong thư viện, framework |
| Việc để sau, kèm điều kiện hoặc quyết định đang chờ | Danh sách file đã sửa, số dòng, commit hash, ID |
| Bài học: lỗi đã gặp và nguyên nhân gốc | Thông tin xác thực, đường dẫn tuyệt đối |
| Tên hàm, file, mã lỗi làm mốc tìm lại | Đoạn mã dài |

## Phân loại `type`

| type | Dùng cho |
|---|---|
| `architecture` | Cấu trúc: module, định dạng API, luồng worker ↔ backend, hạ tầng |
| `pattern` | Quy tắc nghiệp vụ, quy ước phải tuân theo |
| `workflow` | Đã làm gì, việc bàn giao, việc để sau |
| `bug` | Lỗi đã gặp, nguyên nhân gốc, cách xử lý |
| `fact` | Môi trường: máy phát triển, WSL, Docker, công cụ |

## Bộ nhãn `concepts`

Gắn cho mỗi memory nhãn của đủ 4 nhóm, mỗi nhóm một hoặc nhiều nhãn. Nhãn tính năng phải khớp thuật ngữ trong `docs/appendix/glossary.md`.

| Nhóm | Nhãn |
|---|---|
| Khu vực | `backend`, `frontend`, `workers`, `infra`, `docs` |
| Tính năng | `program`, `scope`, `asset`, `job`, `tool-module`, `raw-output`, `parser`, `finding`, `triage`, `report`, `dashboard`, `user-role`, `cross-cutting` |
| Kỹ thuật | `database`, `api-contract`, `queue`, `websocket`, `auth`, `validation`, `error-handling`, `logging`, `security`, `testing`, `dev-environment` |
| Loại nội dung | `decision`, `business-rule`, `change`, `pending`, `lesson` |

## Cách viết một memory

- Dòng đầu: `[khu vực/chủ đề] tóm tắt một câu`. Ví dụ: `[backend/parser] Parser chỉ chạy sau khi output thô đã lưu`.
- Mở đầu các dòng sau bằng: `Đã làm:`, `Quy tắc:`, `Quyết định:`, `Lý do:`, `Còn để sau:`, `Bài học:`.
- Viết mỗi memory một chủ đề.
- Tách việc để sau thành memory riêng có nhãn `pending`.
- Viết bằng tiếng Việt. Giữ tiếng Anh cho thuật ngữ kỹ thuật, tên công cụ.

## Cập nhật quy tắc này

- Khi cần nhãn, loại hoặc quy tắc mới:
  1. Đề xuất trong chat kèm lý do.
  2. Chờ tôi đồng ý.
  3. Cập nhật file này.
  4. Dùng nhãn, loại hoặc quy tắc mới.
- Đổi tên nhãn: ghi kèm tên cũ để vẫn tìm được memory cũ, ví dụ: `error-handling`, trước là `errors`.
- Nhãn đã đổi: `raw-output`, trước là `output`. `user-role`, trước là `user-access`.
- Không tự viết lại memory cũ theo quy tắc mới, trừ khi tôi yêu cầu.

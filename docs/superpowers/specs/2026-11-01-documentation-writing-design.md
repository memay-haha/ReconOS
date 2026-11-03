# Thiết kế: Viết toàn bộ tài liệu theo documentation-roadmap

> Ngày: 2026-11-01 · Trạng thái: 🔵 Chờ duyệt
> Liên quan: [documentation-roadmap.md](../../documentation-roadmap.md), [documentation.md](../../../.claude/rules/documentation.md)

## 🎯 Mục tiêu

- Viết 29 tài liệu chưa 🟢 Xong trong roadmap: #6 đến #31, #33 đến #35.
- Mỗi tài liệu viết xong ở trạng thái 🔵 Chờ duyệt. Chỉ người dùng chuyển sang 🟢 Xong.
- Ngoại lệ đã được người dùng cho phép: bỏ cổng "mọi tài liệu ở cột Phụ thuộc phải 🟢 Xong". Thay bằng: tài liệu phụ thuộc phải ở 🔵 Chờ duyệt trở lên.

## 🔄 Thứ tự theo đợt

Đợt tính từ cột Phụ thuộc. Tài liệu trong một đợt chỉ phụ thuộc tài liệu ở đợt trước.

| Đợt | Tài liệu |
|---|---|
| 1 | #6 `architecture/tech-stack.md` |
| 2 | #7 `architecture/directory-structure.md`, #8 `architecture/system.md` |
| 3 | #9 `architecture/modules.md`, #14 `security/authentication.md`, #19 `.claude/rules/coding-convention.md` |
| 4 | #10 `architecture/dependency-graph.md`, #11 `architecture/business-flow.md`, #15 `security/authorization.md`, #20 `.claude/rules/design-patterns.md` |
| 5 | #12 `data/database.md` |
| 6 | #13 `integrations/external-services.md`, #16 `security/threat-model.md`, #17 `api/architecture.md` kèm `openapi.yaml`, #27 `ops/performance.md` |
| 7 | #18 `architecture/request-flow.md`, #21 `error-handling.md`, #22 `logging.md`, #23 `testing.md`, #24 `security.md`, #25 `ops/configuration.md`, #28 `ops/scalability.md` |
| 8 | #26 `ops/deployment.md`, #29 `CLAUDE.md`, #33 `backend/CLAUDE.md`, #34 `frontend/CLAUDE.md`, #35 `workers/CLAUDE.md`, #30 `tech-debt.md`, #31 `roadmap.md` |

- #15 xong thì cập nhật lại #12 theo ghi chú roadmap. #12 viết sau #15 nên xử lý luôn trong đợt 5.

## Xử lý điểm chưa quyết: hỏi theo đợt

1. Đầu mỗi đợt: đọc khung, glossary, tài liệu phụ thuộc, ADR, mockup liên quan, memory nhãn `pending`.
2. Gom câu hỏi mở của cả đợt. Hỏi bằng `AskUserQuestion`, tối đa 4 câu mỗi lần, phương án khuyến nghị đặt đầu, câu hỏi dựa trên dữ kiện thật.
3. Lặp bước 2 đến khi đợt không còn câu hỏi chặn việc viết.
4. Điểm thuộc tài liệu đợt sau: không hỏi trước, chỉ liên kết tới tài liệu đó.
5. Không viết điều chưa quyết. Câu trả lời mới ảnh hưởng tài liệu đã viết: sửa tài liệu đó cùng lúc, tăng phiên bản.

## ✍️ Cách viết

- Claude viết tuần tự, không chia subagent song song. Lý do: giữ thuật ngữ và quyết định nhất quán giữa các tài liệu.
- Mỗi tài liệu theo skill `writing-document`: đúng mẫu mô tả, ADR hoặc rule trong `documentation.md`.
- Thuật ngữ mới: đề xuất thêm vào glossary trong câu hỏi đầu đợt, chờ đồng ý.
- Quyết định kiến trúc mới phát sinh: viết ADR mới ở 🔵 Proposed.

## 🔍 Review từng tài liệu

- Chạy skill `review-document`.
- Đối chiếu phạm vi: G1 đến G8 trong overview, mục 🚫 Cấm trong `CLAUDE.md`.
- Đối chiếu mockup liên quan trong `docs/design/screens/`. Ví dụ: S12 cho authorization, S15 đến S18 cho external-services và configuration, S10 cho luồng staging.
- Kiểm tra máy theo mục 7 của `documentation.md`: không có dấu gạch dài, đủ mục `##` đúng icon, mục 1 đến 4 không quá 5 dòng.
- Cập nhật roadmap: Trạng thái, Cập nhật, Tiến độ.

## 📋 Bàn giao

- Cuối mỗi đợt: báo nội dung chính, điểm cố ý chưa quyết, điểm cần xác nhận. Sang đợt sau khi người dùng trả lời.
- Lưu memory theo `.claude/rules/agentmemory.md` khi người dùng ra tín hiệu "chốt", "duyệt", "lưu memory".
- Repo chưa là git: không commit.

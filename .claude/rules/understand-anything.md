# Dùng Understand Anything

> Phiên bản: 1.0 · Ngày: 2026-11-04 · Trạng thái: 🟢 Xong

Understand Anything dùng subagent LLM phân tích repo thành đồ thị gồm tầng kiến trúc, miền nghiệp vụ và luồng nghiệp vụ, lưu ở `.ua/`. Chi phí token tăng theo số file. Tra quan hệ gọi hàm: [codegraph.md](codegraph.md).

## ✅ Bắt buộc

- Chỉ chạy skill `understand-anything:*` khi người dùng gọi.
- Trước khi đọc `.ua/knowledge-graph.json`: so sánh `gitCommitHash` trong `.ua/meta.json` với `git rev-parse HEAD`. Nếu khác nhau, báo đồ thị đã cũ. Hỏi người dùng có chạy lại `/understand` không.
- Giữ `"outputLanguage": "vi"` trong `.ua/config.json`.
- Đồ thị mâu thuẫn với `docs/`: làm theo `docs/`. Báo điểm mâu thuẫn cho người dùng.

## ❌ Cấm

- Bật `autoUpdate` trong `.ua/config.json`. Khi bật, hook `SessionStart` tự chạy lại phân tích mà không hỏi.
- Làm theo thông báo `Knowledge graph is stale` của hook khi người dùng chưa gọi `/understand`.
- Dùng đồ thị làm nguồn cho tài liệu trong `docs/` hoặc cho quyết định mới.
- Commit `.ua/`.

## 💡 Ví dụ

| Câu hỏi | Công cụ |
|---|---|
| Sửa `AppError` ảnh hưởng tới đâu? | `codegraph impact AppError` |
| Luồng tạo job đi qua module nào? | Đọc `docs/architecture/business-flow.md`. Cần đồ thị: hỏi người dùng gọi `/understand-domain` |

## 🔍 Cách kiểm tra

```bash
grep -c autoUpdate .ua/config.json   # 0
```

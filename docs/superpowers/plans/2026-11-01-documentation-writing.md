# Kế hoạch: Viết toàn bộ tài liệu theo documentation-roadmap

> **Cho agent thực hiện:** dùng superpowers:executing-plans, thực hiện tuần tự trong phiên chính. Spec đã chốt không chia subagent song song. Bước dùng checkbox `- [ ]`.

**Mục tiêu:** Đưa 29 tài liệu chưa 🟢 Xong trong roadmap lên 🔵 Chờ duyệt.

**Cách làm:** 8 đợt theo phụ thuộc. Mỗi đợt: thu thập ngữ cảnh, hỏi điểm chưa quyết, viết, tự review, cập nhật roadmap, bàn giao.

**Spec:** [2026-11-01-documentation-writing-design.md](../specs/2026-11-01-documentation-writing-design.md)

## Ràng buộc chung

- Quy tắc viết: `.claude/rules/documentation.md`. Cách viết: skill `writing-document`. Review: skill `review-document`.
- Tài liệu phụ thuộc chỉ cần 🔵 Chờ duyệt trở lên. Ngoại lệ đã được người dùng cho phép.
- Không viết điều chưa quyết. Không tự chuyển trạng thái sang 🟢 Xong.
- Tuân thủ mục 🚫 Cấm trong `CLAUDE.md`: không BBRF, không đọc `_reference/` để sửa, không ghi bí mật.
- Repo chưa là git: không commit.

## Quy trình chuẩn cho một đợt

Mỗi task bên dưới chạy đúng các bước này:

- [ ] **B1. Ngữ cảnh:** đọc khung tài liệu, ghi chú roadmap, glossary, tài liệu ở cột Phụ thuộc, ADR liên quan, mockup liên quan. Gọi `memory_smart_search` với nhãn khu vực và `pending`.
- [ ] **B2. Hỏi:** liệt kê điểm chưa quyết của cả đợt. Hỏi bằng `AskUserQuestion`, tối đa 4 câu mỗi lần, khuyến nghị đặt đầu. Lặp đến khi không còn điểm chặn. Thuật ngữ mới đề xuất ở đây.
- [ ] **B3. Viết:** từng tài liệu theo mẫu tương ứng, xóa chú thích `<!-- -->`, khối đầu file trạng thái 🔵 Chờ duyệt.
- [ ] **B4. Review:** chạy `review-document`. Đối chiếu G1 đến G8, mục 🚫 Cấm, mockup. Chạy kiểm tra máy:

```bash
grep -n "—" <file>          # phải rỗng
grep -n "<!--" <file>       # phải rỗng
grep -n "^## " <file>       # đúng mục, đúng icon
```

- [ ] **B5. Roadmap:** cập nhật cột Trạng thái, Cập nhật, dòng Tiến độ. Sửa tài liệu đã viết nếu quyết định mới ảnh hưởng, tăng phiên bản.
- [ ] **B6. Bàn giao:** báo nội dung chính, điểm cố ý chưa quyết, điểm cần xác nhận.

---

### Task 1: Đợt 1

**Files:** Create `docs/architecture/tech-stack.md` (#6). Mockup chính: S15 system health tools. Nguồn: `adr-tech-stack.md`.

### Task 2: Đợt 2

**Files:** Create `docs/architecture/directory-structure.md` (#7), Modify `docs/architecture/system.md` (#8). Nguồn: `adr-repo-structure.md`, `reconos-architecture.mermaid` trên ổ D nếu đọc được.

### Task 3: Đợt 3

**Files:** Modify `docs/architecture/modules.md` (#9), `docs/security/authentication.md` (#14), `.claude/rules/coding-convention.md` (#19). Mockup chính: S01 login, S18 modules.

### Task 4: Đợt 4

**Files:** Modify `docs/architecture/dependency-graph.md` (#10), `docs/architecture/business-flow.md` (#11), `docs/security/authorization.md` (#15), `.claude/rules/design-patterns.md` (#20). Mockup chính: S10 staging queue, S11, S12.

### Task 5: Đợt 5

**Files:** Modify `docs/data/database.md` (#12), gồm lưu output thô G8 và phân quyền từ #15. Nguồn: `reconos-erd.mermaid` trên ổ D nếu đọc được.

### Task 6: Đợt 6

**Files:** Modify `docs/integrations/external-services.md` (#13), `docs/security/threat-model.md` (#16), `docs/api/architecture.md` (#17), `docs/ops/performance.md` (#27). Create `docs/api/openapi.yaml`. Mockup chính: S15 đến S18, S20.

### Task 7: Đợt 7

**Files:** Modify `docs/architecture/request-flow.md` (#18), `.claude/rules/error-handling.md` (#21), `.claude/rules/logging.md` (#22), `.claude/rules/testing.md` (#23), `.claude/rules/security.md` (#24), `docs/ops/configuration.md` (#25), `docs/ops/scalability.md` (#28).

### Task 8: Đợt 8

**Files:** Modify `docs/ops/deployment.md` (#26), `CLAUDE.md` (#29), `backend/CLAUDE.md` (#33), `frontend/CLAUDE.md` (#34), `workers/CLAUDE.md` (#35), `docs/tech-debt.md` (#30), `docs/roadmap.md` (#31).

- Kiểm tra cuối: mọi dòng roadmap #6 đến #35 ở 🔵 Chờ duyệt hoặc 🟢 Xong, dòng Tiến độ khớp số đếm.

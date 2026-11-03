# Frontend

Next.js chỉ hiển thị và gọi API, WebSocket của Backend API. Quy tắc chung: [CLAUDE.md](../CLAUDE.md), [.claude/rules/](../.claude/rules/).

## 🚫 Cấm

- Đặt nghiệp vụ trong frontend: kiểm tra scope, kiểm tra quyền, tính trạng thái. Ẩn nút theo vai trò chỉ để tiện dùng, không thay cho kiểm tra quyền ở backend.
- Gọi `fetch` trực tiếp trong component, gọi API trong `useEffect`: [design-patterns.md](../.claude/rules/design-patterns.md).
- Dùng `dangerouslySetInnerHTML`, render HTML từ output thô, tài sản, finding: [security.md](../.claude/rules/security.md).
- Dùng kiểu `any`.
- Dựng các phần mockup đã ghi trong [tech-debt.md](../docs/tech-debt.md): BBRF, gowitness DB, New Module, FIDO2, SSO, Push to Jira, tự sinh job.

## 📐 Quy ước

**Màn hình:**

- Dựng màn hình theo thiết kế trong [docs/design/screens/](../docs/design/screens/), danh sách trong `index.json`.
- Đặt route trong `src/app/` theo màn hình.
- Sinh khối `@theme` của `src/styles/globals.css` từ [design-system.md](../docs/design/design-system.md). ❌ Không sửa tay khối này: sửa design system rồi sinh lại.
- Đặt test unit cạnh file mã, test E2E trong `frontend/e2e/`: [testing.md](../.claude/rules/testing.md).
- Hỗ trợ hai theme tối, sáng.
- Hiển thị đúng từ chiều rộng 390 px.
- Đạt WCAG 2.1 AA.
- Hiển thị nhãn, trạng thái theo [glossary](../docs/appendix/glossary.md) và giá trị liệt kê trong [schema.md](../docs/data/schema.md), không theo chữ trên mockup khi hai bên khác nhau.

**Dữ liệu:**

- Đặt client gọi API và hook TanStack Query theo tài nguyên trong `src/lib/`.
- Cho component trong `src/components/` chỉ nhận dữ liệu qua props.
- Phân trang danh sách bằng cursor với nút **Trước**, **Sau**: [api/architecture.md](../docs/api/architecture.md).
- Dùng virtual scroll cho bảng dài.
- Làm mới query tương ứng khi có sự kiện WebSocket.
- Gom sự kiện WebSocket liên tiếp thành một lần làm mới.
- Với lỗi API dạng RFC 9457: hiển thị `title`, lỗi từng trường theo `errors`.
- Chỉ dùng server component cho layout và kiểm tra phiên để chuyển hướng tới S01.

## 🛠️ Build và test

| Lệnh | Việc |
|---|---|
| `pnpm --dir frontend dev` | Chạy server phát triển |
| `pnpm --dir frontend lint` | ESLint |
| `pnpm --dir frontend exec tsc --noEmit` | Kiểm tra kiểu |
| `pnpm --dir frontend test` | Vitest |
| `pnpm --dir frontend exec playwright test` | E2E, cần `make dev-up` |
| `pnpm --dir frontend build` | Build chế độ standalone |

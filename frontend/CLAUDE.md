# Frontend

Next.js chỉ hiển thị và gọi API, WebSocket của Backend API. Quy tắc chung: [CLAUDE.md](../CLAUDE.md), [.claude/rules/](../.claude/rules/).

## 🚫 Cấm

- Đặt nghiệp vụ trong frontend: kiểm tra scope, kiểm tra quyền, tính trạng thái. Ẩn nút theo vai trò chỉ để tiện dùng, không thay cho kiểm tra quyền ở backend.
- Gọi `fetch` trực tiếp trong component, gọi API trong `useEffect`: [design-patterns.md](../.claude/rules/design-patterns.md).
- Dùng `dangerouslySetInnerHTML`, render HTML từ output thô, tài sản, finding: [security.md](../.claude/rules/security.md).
- Dùng kiểu `any`.
- Dựng các phần mockup đã ghi trong [tech-debt.md](../docs/tech-debt.md): BBRF, gowitness DB, New Module, Push to Jira, tự sinh job.
- Dựng MFA, FIDO2, WebAuthn, SSO SAML, đồng bộ Active Directory, mTLS, API Tokens trên S12, hoặc vai trò ngoài Superadmin, Admin, User.
- Dựng phân trang theo số trang. Dùng nút **Trước**, **Sau**.

## 📐 Quy ước

**Màn hình:**

- Dựng màn hình theo thiết kế trong [docs/design/screens/](../docs/design/screens/), danh sách trong `index.json`.
- Đặt route trong `src/app/` theo màn hình.
- Sinh `src/styles/globals.css` từ bảng Token Table trong [design-system.md](../docs/design/design-system.md) bằng `scripts/generate-tokens.mjs`, chạy bằng `pnpm --dir frontend tokens`. ❌ Không sửa tay file này: sửa bảng token rồi chạy lại script. Test chạy lại script và so với file đã commit.
- Một bộ tên token cho cả hai theme: `@theme` giữ giá trị theme tối vì mockup là theme tối, khối `[data-theme="light"]` ghi đè. ❌ Không rẽ nhánh theo theme trong component.
- ❌ Không viết màu bằng hex trong `src/`. Màu mockup chưa có token thì thêm vào bảng Token Table rồi sinh lại.
- Đặt test unit cạnh file mã, test E2E trong `frontend/e2e/`: [testing.md](../.claude/rules/testing.md).
- Hỗ trợ hai theme tối, sáng.
- Hiển thị đúng từ chiều rộng 390 px.
- Đạt WCAG 2.1 AA.
- Hiển thị nhãn, trạng thái theo [glossary](../docs/appendix/glossary.md) và giá trị liệt kê trong [schema.md](../docs/data/schema.md), không theo chữ trên mockup khi hai bên khác nhau.
- Viết mọi chữ hiển thị cho người dùng bằng tiếng Anh: nhãn nút, nhãn ô nhập, tiêu đề, chữ trạng thái, thông báo lỗi, chữ khi danh sách rỗng. Đặt `lang="en"` trên `<html>`. Tài liệu vẫn viết tiếng Việt theo [vietnamese-writing.md](../.claude/rules/vietnamese-writing.md).
- Số hàng nghìn viết theo kiểu tiếng Anh, `1,234`, cho khớp giao diện tiếng Anh. Ngày giờ vẫn `dd/mm/yyyy` và đồng hồ 24 giờ, múi giờ ghim `Asia/Ho_Chi_Minh` vì người vận hành ở Việt Nam.
- Giữ chiều rộng sidebar bằng token `spacing-sidebar` (244px), nội dung chính lệch theo token này, ❌ không viết `244px` thẳng.
- Trang `/components` (Component Library) hiển thị bảng Token Table sinh từ `src/styles/token-table.generated.ts`, thang chữ xám và cặp tương phản lấy từ `PAIRS`. Dùng để soát design system bằng mắt, ❌ không chép giá trị token vào trang.
- Test `src/styles/rendered-contrast.test.ts` đọc cặp màu chữ trên nền thẳng từ component bằng `scripts/scan-contrast-pairs.ts`, rồi bắt mọi cặp đạt 4,5 ở cả hai theme. Cặp không đạt thì sửa giá trị token trong bảng Token Table rồi chạy lại `pnpm --dir frontend tokens`, hoặc thêm dòng kèm lý do vào `CONTRAST_EXCEPTIONS`.
- Script chỉ đi ngược cây JSX trong một file, nên không thấy nền do component ở file khác vẽ, cũng không thấy màu đặt bằng thuộc tính `style`. Hai trường hợp này ghi vào `PAIRS` trong `src/styles/contrast-pairs.ts`, cũng là danh sách trang `/components` hiển thị. Màu chữ không rơi vào cặp nào thì test báo ngay.
- Script không đoán `className` nó không hiểu: biểu thức không đánh giá được (prop, gọi hàm lạ, `props.x`) làm test `understands every className expression it reads` đỏ, kèm `file:dòng`. Viết class bằng chuỗi, template literal, ternary, hằng số hoặc bảng tra, hoặc truyền chuỗi literal vào `cn`, `clsx`, `classnames`, `twMerge`, `twJoin`. Hằng số import từ file `./` hoặc `@/` được đọc theo. ❌ Không dùng `cva` hay `className` truyền qua prop cho tới khi script hỗ trợ.
- Test bố cục màn hình bằng cách so khung DOM: `src/test/dom-shape.ts` rút khung từ mockup và từ cây đã render, so thứ tự vùng, số cột bảng, vai trò ARIA. ❌ Không so class hay màu. Màn hình có mockup thì có test `*-shape.test.tsx`.
- Dựng sidebar theo mockup: bốn nhóm Recon, Operations, Admin, System, kèm icon Material Symbols và badge số đếm. Thẻ tài khoản và nút đăng xuất nằm ở đáy sidebar, không ở topbar. Màn hình chi tiết S05, S07, S09 mở từ màn hình danh sách, ❌ không lên sidebar.

**Dữ liệu:**

- Đặt client gọi API và hook TanStack Query theo tài nguyên trong `src/lib/`.
- Endpoint backend chưa làm thì trả dữ liệu mẫu bằng MSW trong `src/mocks/`, chỉ bật ở chế độ phát triển. Màn hình gọi đúng endpoint trong [openapi.yaml](../docs/api/openapi.yaml), ❌ không rẽ nhánh theo cờ thật hay giả. Backend làm xong endpoint nào thì xóa handler của endpoint đó.
- ❌ Không đọc file ngoài `frontend/` lúc chạy. Image chỉ copy `frontend/`, và `.dockerignore` loại `docs/`, nên đường dẫn kiểu `../docs/...` chạy được khi phát triển nhưng trả lỗi 500 trong container. Cần dữ liệu từ tài liệu thì sinh ra một module trong `frontend/src/` bằng `pnpm --dir frontend tokens`, giống cách `globals.css` được sinh từ bảng Token Table.
- Cho component trong `src/components/` chỉ nhận dữ liệu qua props.
- Phân trang danh sách bằng cursor với nút **Trước**, **Sau**: [api/architecture.md](../docs/api/architecture.md).
- Dùng virtual scroll cho bảng dài.
- Làm mới query tương ứng khi có sự kiện WebSocket.
- Gom sự kiện WebSocket liên tiếp thành một lần làm mới.
- Với lỗi API dạng RFC 9457: `errors` là mảng `[{field, code}]` chứa mã máy. Dịch mã sang câu tiếng Anh bằng `fieldErrorText` trong `src/lib/field-error-text.ts`. Lỗi không gắn trường nào thì hiển thị câu của màn hình, ❌ không hiển thị `title` thô của backend.
- Chỉ dùng server component cho layout và kiểm tra phiên để chuyển hướng tới S01.
- Xử lý lỗi `401` ở một chỗ duy nhất trong provider của TanStack Query: xóa cache rồi chuyển về S01. ❌ Không để từng màn hình tự xử lý `401`, vì người dùng sẽ thấy nhiều hộp lỗi rời rạc mà không biết phiên đã hết.
- Cho S01 hiển thị được cả khi Backend API không trả lời. Màn hình kiểm tra phiên của S01 coi mọi lỗi không phải `401`, `403` là chưa biết, và vẫn dựng form. Layout của nhóm route cần đăng nhập thì ngược lại: chỉ `401`, `403` mới là chưa đăng nhập, lỗi khác phải lộ ra, không được giả vờ là đã đăng xuất.

## 🛠️ Build và test

| Lệnh | Việc |
|---|---|
| `pnpm --dir frontend dev` | Chạy server phát triển |
| `pnpm --dir frontend lint` | ESLint |
| `pnpm --dir frontend exec tsc --noEmit` | Kiểm tra kiểu |
| `pnpm --dir frontend tokens` | Sinh lại `src/styles/globals.css` từ bảng token |
| `pnpm --dir frontend test` | Vitest |
| `pnpm --dir frontend exec playwright test` | E2E, cần `make init` và Backend API đang chạy. Tài khoản đăng nhập lấy từ `RECONOS_BOOTSTRAP_ADMIN_*`: [configuration.md](../docs/ops/configuration.md) |
| `pnpm --dir frontend build` | Build chế độ standalone |

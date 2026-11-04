# Thiết kế: lớp vỏ frontend phần A, nền tảng và sửa sai

> Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Liên quan: [roadmap.md](../../roadmap.md), [spec 2b](2026-11-04-batch2b-frontend-design.md), [design-system.md](../../design/design-system.md), [index.json](../../design/screens/index.json), [openapi.yaml](../../api/openapi.yaml), [authorization.md](../../security/authorization.md), [frontend/CLAUDE.md](../../../frontend/CLAUDE.md)

## 🎯 Mục tiêu

- Dựng lớp vỏ frontend chạy bằng dữ liệu mẫu cho toàn bộ màn hình, để theo dõi giao diện trước khi backend làm xong.
- Phần A sửa ba lỗi của đợt 2b và dựng hạ tầng mà bốn phần sau dùng lại: màu, bố cục, ngôn ngữ.
- Xong phần A: mở `/login` và `/users` thấy đúng mockup, phần còn lại của sidebar đã có chỗ đứng.

## 🧭 Quan hệ với roadmap

- Lớp vỏ frontend là một nhánh công việc riêng, ❌ không đổi thứ tự đợt trong [roadmap.md](../../roadmap.md).
- Đợt 3 đến đợt 13 vẫn làm backend theo thứ tự cũ. Mỗi đợt làm xong endpoint nào thì xóa handler dữ liệu mẫu của endpoint đó.
- Toàn bộ 17 màn hình chia năm phần. Phần A là phần này.

| Phần | Màn hình |
|---|---|
| A. Nền tảng và sửa sai | Shell, S01, S12 |
| B. Program và job | S08, S09, S10, S11 |
| C. Tài sản | S03, S04, S05 |
| D. Tổng quan và ảnh chụp | S02, S06, S07 |
| E. Cấu hình, hệ thống, finding | S15, S16, S17, S18, S20 |

## 📐 Quyết định chốt

| Quyết định | Lý do | Phương án đã loại |
|---|---|---|
| Theme tối là mặc định, `@theme` giữ bảng tối, khối ghi đè chuyển thành sáng | Mockup là `<html class="dark">`. Đợt 2b đặt bảng sáng làm mặc định nên mở app lên không giống mockup | Chỉ làm theme tối. Giữ sáng làm mặc định |
| Đo từng hex theo đúng vai trò rồi chia đôi: chênh dưới ΔE 5 với token cùng vai trò thì dùng token đó, còn lại mới thêm token mới | Mockup dùng 52 hex viết thẳng, 973 lần. Đo theo vai trò cho thấy chỉ 26 hex thật sự là màu mới. Giá trị tối lấy đúng hex của mockup nên theme tối khớp, vẫn giữ được theme sáng và test tương phản | Thêm token cho cả 41 hex. Cho viết hex thẳng. Ánh xạ sang token gần nhất bất kể vai trò |
| Chữ giao diện viết tiếng Anh: nhãn nút, thông báo lỗi, chữ trạng thái | Mockup là `lang="en"`. Người dùng chốt ngày 2026-11-04 | Giữ tiếng Việt. Chỉ tên mục điều hướng tiếng Anh |
| MSW chặn ở tầng mạng, chỉ cho endpoint backend chưa làm | Màn hình gọi đúng endpoint thật trong `openapi.yaml`, không biết mình đang dùng dữ liệu giả. Backend xong thì xóa một file handler | Backend trả dữ liệu mẫu. Hook rẽ nhánh theo cờ |
| Sidebar theo mockup: hai nhóm, 14 mục, cộng S13 và S14 thành 16. Ba màn hình chi tiết không lên sidebar | Đúng mockup. S05, S07, S09 mở từ màn hình danh sách | Danh sách phẳng 16 mục như đợt 2b |
| Thêm S13 output thô và S14 nhật ký thao tác | S14: `authorization.md` cho Admin xem nhật ký, nhưng mọi endpoint khác của S12 chỉ Superadmin, nên Admin mở S12 chỉ thấy lỗi. S13: lưu output thô là mục tiêu G8 mà không mockup nào có chỗ xem | Giữ nhật ký làm panel trong S12. Bỏ qua output thô |
| Đổi mật khẩu là hộp thoại trong topbar | `POST /auth/password` đã làm xong ở đợt 2a nhưng giao diện không có chỗ gọi, tức một tính năng chết | Màn hình riêng |
| Dựng Component Library | Có trong sidebar mockup. Dùng để soát lại design system bằng mắt, phục vụ đúng việc theo dõi frontend | Bỏ qua như đợt 2b đã làm |

## 🔄 Token và theme

Đo trên 17 file trong `docs/design/screens/`:

| Nhóm | Số hex | Lần dùng |
|---|---|---|
| Trùng y hệt token đã có | 11 | 246 |
| Ánh xạ được sang token cùng vai trò, ΔE ≤ 5 | 15 | 427 |
| Cần token mới, ΔE > 5 | 26 | 300 |
| **Tổng** | **52** | **973** |

- Dựng `frontend/scripts/colour-map.json` làm nguồn sự thật: mỗi hex của mockup ứng với đúng một token.
- Đo khoảng cách màu bằng ΔE trên CIELAB, và chỉ so với token **cùng vai trò**: hex dùng cho chữ chỉ so với token chữ, dùng cho nền chỉ so với token nền. So bất kể vai trò sẽ khớp một màu chữ với một token viền.
- Hex trùng y hệt một token, hoặc chênh dưới ΔE 5 với token cùng vai trò: dùng token đó, ❌ không thêm token mới. Dưới ΔE 2,3 là mắt thường không phân biệt được, dưới 5 là chỉ thấy khác khi đặt cạnh nhau.
- Hex chênh trên ΔE 5: thêm token mới vào bảng Token Table của [design-system.md](../../design/design-system.md), đặt tên theo vai trò chứ không theo giá trị, gom các hex cùng vai trò và gần nhau thành một token.
- Gộp cặp lệch một chữ số, ví dụ `#161d2b` và `#161d2a`, thành một token.
- 11 màu trùng token sẵn có thì dùng tên token, ❌ không thêm token mới.
- Giá trị tối lấy đúng hex của mockup. Giá trị sáng suy từ cùng màu gốc, như đã làm với 78 token của đợt 2b.
- Đảo `generate-tokens.mjs`: `@theme` nhận cột `dark`, khối `@media (prefers-color-scheme: light)` và `:root[data-theme="light"]` nhận cột `light`.
- Mọi cặp chữ trên nền vẫn phải đạt WCAG 2.1 AA ở cả hai theme.
- ❌ Sau phần A không còn chỗ nào trong `frontend/src` viết màu bằng hex.

## 🔄 Ngôn ngữ giao diện

- Chữ hiển thị cho người dùng viết tiếng Anh: nhãn nút, nhãn ô nhập, tiêu đề, chữ trạng thái, thông báo lỗi, chữ rỗng.
- Comment, docstring, commit message vẫn tiếng Anh như cũ.
- Tài liệu trong `docs/` và `.claude/rules/` vẫn tiếng Việt theo [vietnamese-writing.md](../../../.claude/rules/vietnamese-writing.md).
- Viết lại toàn bộ chuỗi của S01, S12, shell, error boundary, `field-error-text.ts`.
- `<html lang>` đổi thành `en`.

## 🔄 Dữ liệu mẫu

- Dùng MSW, chỉ bật ở chế độ phát triển. ❌ Không bao giờ nằm trong bản build production.
- Đặt handler trong `frontend/src/mocks/`, một file một nhóm tài nguyên theo `openapi.yaml`.
- Một file duy nhất khai báo endpoint nào backend đã làm. Endpoint đã làm thì đi thẳng tới backend thật, không qua handler.
- Dữ liệu mẫu phải hợp lệ theo schema trong `openapi.yaml`: đúng tên trường, đúng kiểu, đúng phân trang cursor.
- Dùng domain `example.com`, `example.org`, `*.test` và dải IP `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` theo [testing.md](../../../.claude/rules/testing.md).
- ❌ Không đặt thông tin xác thực thật trong dữ liệu mẫu.

## 🔄 Shell

Dựng lại theo cấu trúc mockup.

| Thành phần | Mockup |
|---|---|
| Sidebar | `aside` cố định trái, rộng 244 px, có nhóm điều hướng, badge số đếm, thẻ tài khoản ở đáy |
| Topbar | `header` cố định trên, cao 14, bắt đầu từ mép phải sidebar |
| Nội dung | `pl-[244px]`, `main` có `pt-14 px-gutter py-gutter-dense` |

- Nhóm trên: Dashboard, Monitor, Domains, Screenshots, Programs, Findings, Staging Queue, Manage, Users, Raw Outputs, Audit Log, Component Library.
- Nhóm System: Health & Tools, Osmedeus, Vigolium, Modules.
- S05, S07, S09 là màn hình chi tiết, ❌ không lên sidebar.
- Icon dùng Material Symbols Outlined như mockup.
- Badge số đếm lấy từ endpoint tương ứng, chưa có thì MSW trả.
- Thẻ tài khoản ở đáy có tên, vai trò, nút đăng xuất, và mở hộp thoại đổi mật khẩu.
- Mục chưa có màn hình vẫn làm mờ, không bấm được, kèm tên phần sẽ dựng.

## 🔄 S01 và S12

- Dựng lại bám cấu trúc HTML của mockup, ❌ không dựng theo mô tả.
- Giữ nguyên hành vi đã có: một câu cho mọi lần đăng nhập bị từ chối, `method="post"`, ô mật khẩu không kiểm soát, xử lý 401 tập trung, S01 dựng được khi backend sập.
- Nhật ký thao tác rời khỏi S12 thành màn hình riêng S14, dùng lại panel đã dựng ở đợt 2b sau khi dịch chuỗi. S14 mở được cho cả Superadmin và Admin theo [authorization.md](../../security/authorization.md).
- S12 giữ thẻ số liệu, danh sách tài khoản, tạo, sửa, khóa, mở khóa, phiên đăng nhập, thu hồi phiên.

## ✍️ Test bắt buộc

- So khung DOM của mỗi màn hình với khung rút từ mockup: thứ tự vùng, số cột của bảng, vai trò ARIA. Sai bố cục phải hỏng test.
- Sinh lại token khớp file đã commit.
- Tương phản đạt AA ở cả hai theme, gồm các token mới.
- ❌ Không còn chuỗi tiếng Việt trong `frontend/src`, trừ comment.
- ❌ Không còn màu viết bằng hex trong `frontend/src`.
- MSW không nằm trong bản build production.
- Dữ liệu mẫu khớp schema của `openapi.yaml`.
- Giữ nguyên bộ test hành vi của đợt 2b sau khi dịch chuỗi.

## 🔍 Tiêu chí hoàn thành

- `make lint`, `make test` đạt. Playwright đạt.
- Mở `/login` và `/users` ở theme tối, so với mockup không thấy khác biệt về màu và bố cục.
- Sidebar đủ 16 mục hai nhóm, chỉ mục đã dựng bấm được.
- Đổi sang theme sáng, mọi màn hình vẫn đọc được và đạt AA.

## ⛔ Ngoài phạm vi

| Việc | Thuộc về |
|---|---|
| 14 màn hình còn lại | Phần B đến E |
| Nội dung của S13 output thô | Phần tương ứng khi có màn hình job. Phần A chỉ dựng mục sidebar làm mờ |
| Backend cho 91 endpoint | Đợt 3 đến 13 của roadmap |
| Ô tìm kiếm toàn hệ thống, chuông cảnh báo | Khi có nguồn dữ liệu |

## 📋 Đồng bộ tài liệu khi làm

`design-system.md` cho token và thứ tự theme. `index.json` cho S13, S14. `frontend/CLAUDE.md` cho ngôn ngữ giao diện, theme mặc định, quy ước MSW và sidebar. `directory-structure.md` cho `src/mocks/`. `authorization.md` cho quyền xem S14. `tech-debt.md` cho nợ phát sinh. `roadmap.md` ghi nhánh lớp vỏ frontend. `documentation-roadmap.md` cho mọi file đã sửa.

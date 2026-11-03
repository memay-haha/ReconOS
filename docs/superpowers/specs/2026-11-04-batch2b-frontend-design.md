# Thiết kế: Giao diện tài khoản và phân quyền, đợt 2b

> Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Liên quan: [roadmap.md](../../roadmap.md), [spec 2a](2026-11-03-batch2a-backend-auth-design.md), [thiết kế thứ tự viết mã](2026-11-02-implementation-roadmap-design.md), [api/architecture.md](../../api/architecture.md), [authorization.md](../../security/authorization.md), [design-system.md](../../design/design-system.md), [tech-debt.md](../../tech-debt.md)

## 🎯 Mục tiêu

- Lát cắt: đăng nhập bằng tài khoản thật trên S01, quản lý tài khoản và xem nhật ký thao tác trên S12.
- Đóng đợt 2. Spec 2a đã dựng 13 endpoint backend, spec này dựng phần người dùng nhìn thấy.
- Đóng nợ 4, nợ 11, nợ 17 trong [tech-debt.md](../../tech-debt.md).
- `make e2e` chạy được lần đầu, vì trước đó chưa có luồng đăng nhập.

## 📐 Quyết định chốt cho đợt này

| Quyết định | Lý do | Phương án đã loại |
|---|---|---|
| Dựng đủ 16 mục sidebar, chỉ Users bấm được, 15 mục còn lại làm mờ kèm tên đợt sẽ có | Thấy được hình hài sản phẩm, và mỗi đợt sau chỉ cần bật mục của mình | Khung tối thiểu chỉ có Users. Chưa dựng khung, để đợt sau |
| Một bộ tên token, `@theme` giữ bảng sáng, `[data-theme="dark"]` ghi đè | Component không bao giờ rẽ nhánh theo theme. Ép theme cho một vùng vẫn làm được | Hàm CSS `light-dark()`. Chỉ làm theme tối ở đợt này |
| Thêm `GET /user-sessions` thay vì bỏ thẻ Active Sessions | Trùng mẫu danh sách đã có, dùng lại `UserSessionResponse`, nằm cạnh `DELETE /user-sessions/{id}`, về sau dùng cho màn hình xem toàn bộ phiên | Bỏ thẻ. Thêm một endpoint chỉ đếm |
| Viết script sinh token kèm test chống lệch | `frontend/CLAUDE.md` đang nói khối token là sinh ra và cấm sửa tay, nhưng không có script. Quy tắc phải đúng sự thật | Làm tay rồi sửa quy tắc cho khớp |
| Next chuyển tiếp `/api/*` sang backend | Trình duyệt chỉ gọi một origin nên `Origin` khớp `RECONOS_PUBLIC_ORIGIN` và cookie `SameSite=Lax` gửi kèm. Giống production, nơi Nginx định tuyến `/api/` | Gọi thẳng backend ở cổng khác kèm CORS. Trái thiết kế chống CSRF và cookie của 2a |

## 🔄 Phần backend

Phần duy nhất của đợt này chạm vào backend.

| Việc | Chi tiết |
|---|---|
| `GET /user-sessions` | Chỉ Superadmin. Phân trang cursor, mới nhất trước, trả `UserSessionResponse`. Chỉ liệt kê phiên chưa hết hạn |
| Lọc phiên hết hạn | `GET /users/{user_id}/sessions` cũng chỉ trả phiên chưa hết hạn. Hiện đang trả cả phiên đã hết hạn |

- Hết hạn tính theo cả hai mốc như `core/security.py`: quá `expires_at`, hoặc `last_seen_at` cộng `session_idle_timeout_minutes`.
- Test: 4 trạng thái người gọi cho endpoint mới, phiên hết hạn không xuất hiện, cursor sai trả `400`.
- Đồng bộ `api/architecture.md`, `openapi.yaml`, `authorization.md`.

## 🔄 Design system và token

- Thêm vào [design-system.md](../../design/design-system.md) một bảng token đọc được bằng máy, mỗi dòng một token kèm giá trị cho cả hai theme. Phần văn xuôi mô tả ý đồ giữ nguyên.
- 78 token màu cần giá trị cho theme sáng. Token bán kính, khoảng cách, chữ không đổi theo theme.
- Suy bảng sáng từ cùng màu gốc của bảng tối, không chọn màu mới.
- Mọi cặp màu chữ trên nền phải đạt WCAG 2.1 AA ở cả hai theme: [frontend/CLAUDE.md](../../../frontend/CLAUDE.md).
- Script sinh `frontend/src/styles/globals.css` từ bảng token. Test chạy lại script rồi so với file đã commit, khác nhau thì báo lỗi.
- ❌ Không sửa tay khối `@theme`.

## 🔄 Khung ứng dụng

- Route nhóm cần đăng nhập dùng một layout chung. Server component trong layout gọi `GET /auth/me` kèm cookie của trình duyệt, không có phiên thì chuyển về S01.
- Sidebar liệt kê 16 màn hình theo [index.json](../../design/screens/index.json), trừ S01. Chỉ S12 bấm được. 15 mục còn lại làm mờ, không bấm được, kèm chú thích đợt sẽ có.
- Topbar giữ nút đổi theme và menu đăng xuất. Menu hiển thị tên và vai trò lấy từ `GET /auth/me`.
- ❌ Chưa dựng ô tìm kiếm toàn hệ thống, chuông cảnh báo, trạng thái dispatcher. Ba thứ này thuộc đợt 4 và đợt 10, chưa có nguồn dữ liệu.
- ❌ Không dựng mục Component Library trên mockup: không có trong `index.json`.

## 🔄 Màn hình S01

- Nhập tên đăng nhập và mật khẩu, gọi `POST /auth/login`.
- Sai tên đăng nhập, sai mật khẩu, tài khoản khóa đều nhận cùng một thông báo, vì backend trả cùng một lỗi.
- Vượt ngưỡng đăng nhập sai nhận `429`, hiển thị thời gian chờ lấy từ header `Retry-After`.
- Đăng nhập xong chuyển tới S12.
- Đã đăng nhập mà mở S01 thì chuyển thẳng vào trong.

## 🔄 Màn hình S12

Ba khu vực, dùng 10 endpoint.

| Khu vực | Nội dung | Endpoint |
|---|---|---|
| Thẻ số liệu | Tổng tài khoản, tổng phiên đang hoạt động | `total` của `GET /users` và `GET /user-sessions` |
| Tài khoản | Danh sách phân trang, tạo, sửa tên hiển thị và vai trò, khóa, mở khóa | `GET /users`, `POST /users`, `GET /users/{id}`, `PATCH /users/{id}`, `POST …/lock`, `POST …/unlock` |
| Phiên và nhật ký | Phiên của một tài khoản kèm thu hồi, nhật ký thao tác có lọc | `GET /users/{id}/sessions`, `DELETE /user-sessions/{id}`, `GET /audit-logs` |

- Phân trang bằng cursor với nút Trước và Sau, hiển thị tổng theo `total` và `total_is_estimate`. ❌ Không nhảy tới trang số N. Đóng nợ 11.
- Vai trò chỉ có Superadmin, Admin, User theo [glossary](../../appendix/glossary.md).
- Nút không dùng được ẩn theo vai trò chỉ để tiện dùng. Quyền thật do backend quyết.
- Lỗi RFC 9457: hiển thị `title`, lỗi từng trường theo `errors`. Mật khẩu yếu trả `new_password` nên form ánh xạ đúng ô.
- ❌ Không dựng MFA, FIDO2, WebAuthn, SSO SAML, Active Directory, mTLS, API Tokens, và ba vai trò ngoài glossary. Đóng nợ 4.
- ❌ Không dựng thẻ API Tokens: token worker thuộc đợt 4.

## 🔄 Gọi API và trạng thái

- Đặt client và hook TanStack Query theo tài nguyên trong `frontend/src/lib/`.
- Component trong `src/components/` chỉ nhận dữ liệu qua props, không gọi API.
- Next chuyển tiếp `/api/*` sang backend. Địa chỉ backend lấy từ một biến môi trường mới, ghi vào [configuration.md](../../ops/configuration.md).
- ❌ Không gọi `fetch` trực tiếp trong component, không gọi API trong `useEffect`.

## ✍️ Test bắt buộc

- Script sinh token: chạy lại rồi so với file đã commit.
- Tương phản màu đạt WCAG 2.1 AA cho mọi cặp chữ trên nền, cả hai theme.
- Hook gọi API: trạng thái đang tải, lỗi, có dữ liệu.
- Component nhận props: hiển thị đúng nhãn và trạng thái theo glossary.
- Phân trang: nút Trước mờ ở trang đầu, nút Sau mờ khi `next_cursor` rỗng.
- Lỗi API: `title` hiện ra, lỗi từng trường gắn đúng ô nhập.
- Backend: 4 trạng thái người gọi cho `GET /user-sessions`, phiên hết hạn không xuất hiện ở cả hai endpoint danh sách phiên.
- E2E luồng đăng nhập: sai mật khẩu nhận thông báo chung, đúng thì vào S12, đăng xuất quay về S01, mở S12 khi chưa đăng nhập thì bị chuyển về S01.

## 🔍 Tiêu chí hoàn thành

- `make lint`, `make test`, `make e2e` chạy đạt.
- Hiển thị đúng từ chiều rộng 390 px, ở cả hai theme.
- Đăng nhập bằng tài khoản `bootstrap` tạo ra, quản lý được tài khoản khác trên giao diện.
- Nợ 4, nợ 11, nợ 17 chuyển sang 🟢 Xong trong `tech-debt.md`.

## ⛔ Ngoài phạm vi

| Việc | Thuộc về |
|---|---|
| 15 màn hình còn lại trong sidebar | Đợt 3 đến đợt 13 |
| Ô tìm kiếm toàn hệ thống, chuông cảnh báo | Đợt 10 |
| Trạng thái dispatcher, token worker | Đợt 4 |
| Sự kiện WebSocket làm mới query | Đợt 4, khi có sự kiện đầu tiên |
| Virtual scroll cho bảng dài | Khi có bảng đủ dài, sớm nhất là đợt 5 |
| MFA | Sau phiên bản đầu, nợ 3 |

## 📋 Đồng bộ tài liệu khi làm

`api/architecture.md`, `openapi.yaml`, `authorization.md` cho endpoint mới. `design-system.md` cho bảng token. `configuration.md` cho biến môi trường của frontend. `frontend/CLAUDE.md` cho script sinh token. `directory-structure.md` nếu thêm thư mục. `tech-debt.md` đóng nợ 4, 11, 17. `documentation-roadmap.md` cho mọi file đã sửa.

---
name: drawing-documentation-map
description: Use when the user wants to see how project documents relate to each other, asks to draw, update or redraw a documentation map, sơ đồ tài liệu, bản đồ tài liệu, quan hệ giữa các tài liệu, or after documents are added, removed or their dependencies change in a project that already has documentation-map.html.
---

# Vẽ bản đồ tài liệu

Bản đồ là một file HTML hai tab: **Bản đồ** (thẻ nhóm, chọn một file để thấy quan hệ) và **Mục đích** (mô tả từng file). Phần vẽ cố định nằm trong `.claude/skills/drawing-documentation-map/template.html`. Mỗi lần vẽ chỉ điền dữ liệu, nên mọi project có cùng giao diện và quy ước. Dùng cho project khác: chép cả thư mục skill này vào `.claude/skills/` của project đó.

## Quy trình

Chạy mọi lệnh từ gốc repo.

1. **Tìm quy ước riêng của project.** Project đã có quy tắc vẽ, ví dụ mục "Quy ước vẽ sơ đồ tài liệu" trong quy tắc viết tài liệu: làm theo quy tắc đó. Đã có `docs/documentation-map.html`: chỉ sửa khối dữ liệu của file đó.
2. **Liệt kê file:** tài liệu trong `docs/`, ADR, file quy tắc cho Claude, các `CLAUDE.md`, file dữ liệu máy đọc như OpenAPI, ERD. Không đưa vào: bảng theo dõi tài liệu, chính bản đồ, README chỉ làm mục lục.
3. **Lấy quan hệ từ nguồn ghi rõ trong project**, không tự suy từ nội dung:
   - `deps` (tiền đề): cột phụ thuộc của bảng theo dõi, dòng "Liên quan" đầu file. Cột ghi số thứ tự thì đổi sang `id`.
   - `sync` (phạm vi ảnh hưởng): ghi ở file nguồn. "Đổi A thì sửa B, C" nghĩa là A có `sync: ["b", "c"]`. Project không ghi thì để `[]`.
   - `change`: cao = 3, vừa = 2, thấp = 1. Project không ghi thì hỏi người dùng.
4. **Chia nhóm:** từ 3 đến 8 nhóm theo vai trò, xếp theo thứ tự đọc. `id` nhóm là slug ASCII viết thường. Chưa rõ cách chia: hỏi người dùng.
5. **Viết mục đích** bằng ngôn ngữ của tài liệu, lấy từ phần mở đầu của từng file. `purpose` tối đa 8 từ, `about` một đến hai câu. File không có phần mở đầu: tóm tắt tiêu đề và đoạn đầu, không thêm ý mới.
6. **Tạo file:**
   ```bash
   mkdir -p docs && cp .claude/skills/drawing-documentation-map/template.html docs/documentation-map.html
   ```
   Sửa `<title>` và `CONFIG.title` cùng một giá trị: `Bản đồ tài liệu <tên dự án>`. Tên dự án lấy từ README hoặc `CLAUDE.md`, không có thì hỏi. Thay `GROUPS`, `DOCS` mẫu. Giữ các dòng comment đầu khối dữ liệu. Không sửa phần sau `// ---- Drawing code`.
7. **Kiểm tra dữ liệu**, lệnh in `OK` hoặc danh sách lỗi:
   ```bash
   node -e '
   const s=require("fs").readFileSync("docs/documentation-map.html","utf8");
   const js=s.slice(s.indexOf("<script>")+8,s.lastIndexOf("</script>"));new Function(js);
   const {GROUPS,DOCS}=new Function(js.slice(js.indexOf("// Data block"),js.indexOf("// ---- Drawing code"))+";return {GROUPS,DOCS}")();
   const ids=new Set(DOCS.map(d=>d.id)),gs=new Set(GROUPS.map(g=>g.id)),e=[];
   DOCS.forEach(d=>{if(!gs.has(d.group))e.push(d.id+": nhóm sai");[...d.deps,...d.sync].forEach(x=>ids.has(x)||e.push(d.id+": thiếu "+x));if(!d.purpose||!d.about)e.push(d.id+": thiếu mục đích")});
   const st={},by=Object.fromEntries(DOCS.map(d=>[d.id,d])),v=i=>{if(st[i]==1)e.push("vòng tại "+i);if(st[i])return;st[i]=1;(by[i]?.deps||[]).forEach(v);st[i]=2};DOCS.forEach(d=>v(d.id));
   console.log(e.length?e.join("\n"):"OK")'
   ```
8. **Xuất bản** bằng Artifact tool nếu có. Project có file quy tắc viết tài liệu: ghi bảng mã hóa dưới đây vào đó nếu chưa có. Không có: báo người dùng, không tự tạo file quy tắc.

## Trường của DOCS

| Trường | Giá trị |
|---|---|
| `id` | Slug ASCII ngắn, duy nhất trong `DOCS` |
| `path` | Đường dẫn từ gốc repo |
| `label` | Tên file bỏ `.md`. File khác giữ đuôi: `openapi.yaml`. `CLAUDE.md` con ghi kèm thư mục: `backend/CLAUDE.md` |
| `group` | `id` trong `GROUPS` |
| `kind` | `adr`: quyết định kiến trúc. `rule`: quy tắc, hướng dẫn cho AI. `data`: file máy đọc như YAML, JSON, Mermaid. `doc`: còn lại |
| `change` | 1, 2, 3 |
| `deps`, `sync` | Danh sách `id` |
| `status` | Trạng thái lấy từ bảng theo dõi, giữ nguyên chữ |
| `purpose`, `about` | Mục đích ngắn, mục đích đầy đủ |

## Mã hóa cố định

| Thành phần | Ý nghĩa |
|---|---|
| Thẻ nhóm đánh số 01, 02... | Nhóm, theo thứ tự đọc |
| Thứ tự file trong thẻ | Tầng phụ thuộc, tiền đề đứng trên |
| Nhãn `ADR`, `RULE`, `DATA` | Loại file. Tài liệu mô tả không có nhãn |
| 1 đến 3 vạch | Mức thay đổi |
| Xanh dương, nét liền | Tiền đề: tài liệu mà file đang chọn dựa trên |
| Xanh lá, nét liền | Kế thừa: tài liệu dựa trên file đang chọn |
| Cam, nét đứt | Phạm vi ảnh hưởng: tài liệu phải cập nhật khi file đang chọn đổi |
| Ô chi tiết, mục Nguồn ảnh hưởng | File mà khi đổi thì file đang chọn phải cập nhật |

Chỉ vẽ đường nối cho file đang chọn. Không thêm màu, nhãn, kiểu nét ngoài bảng.

## Lỗi thường gặp

| Lỗi | Cách tránh |
|---|---|
| Vẽ mọi quan hệ cùng lúc, sơ đồ rối | Giữ cơ chế chọn file của template |
| Tự suy quan hệ từ nội dung | Chỉ lấy từ nguồn ở bước 3, thiếu nguồn thì hỏi |
| Đặt `sync` ở file bị sửa thay vì file nguồn | `sync` luôn nằm ở file thay đổi trước |
| Mục đích dài trên thẻ | `purpose` tối đa 8 từ, chi tiết để ở `about` |
| Hai tab cùng hiện | Template có `[hidden] { display: none !important; }`, không xóa |
| Trang Artifact trống, không chạy script | Giữ hàm bọc `(() => { ... })()` quanh script, không khai báo biến toàn cục |
| Sửa phần vẽ cho riêng một project | Đổi giao diện thì sửa template trong skill |
| Dùng "đọc trước", "phải sửa theo" | Dùng tiền đề, kế thừa, phạm vi ảnh hưởng, nguồn ảnh hưởng |

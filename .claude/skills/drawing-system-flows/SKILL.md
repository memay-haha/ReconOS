---
name: drawing-system-flows
description: Use when the user asks to draw or update a system architecture diagram, request flow, sequence diagram, sơ đồ kiến trúc, luồng request, luồng tính năng, sơ đồ tuần tự, or when a component, channel or flow step changes in a project that already has system-flows.html.
---

# Vẽ sơ đồ kiến trúc và luồng

Trang HTML 3 tab: **Kiến trúc** (thành phần theo vùng tin cậy, đường nối đánh số kèm bảng kênh), **Luồng request** và **Tính năng** (sơ đồ tuần tự có phát từng bước, dòng chảy). Phần vẽ cố định nằm trong `.claude/skills/drawing-system-flows/template.html`. Mỗi lần vẽ chỉ điền dữ liệu. Dùng cho project khác: chép cả thư mục skill này vào `.claude/skills/` của project đó.

## Quy trình

Chạy mọi lệnh từ gốc repo.

1. **Tìm quy ước riêng của project**, ví dụ mục "Quy ước vẽ sơ đồ kiến trúc và luồng" trong quy tắc viết tài liệu: làm theo quy ước đó. Đã có `docs/system-flows.html`: chỉ sửa khối dữ liệu của file đó.
2. **Đọc tài liệu nguồn:** kiến trúc hệ thống (tiến trình, kho dữ liệu, kênh giao tiếp, ranh giới tin cậy), luồng request, luồng nghiệp vụ, contract với thành phần ngoài, xác thực, danh sách endpoint.
3. **Lấy dữ liệu chỉ từ tài liệu đã duyệt.** Bước, kênh, mã lỗi không có trong tài liệu thì không vẽ. Tài liệu thiếu: hỏi người dùng. Không hỏi được: chọn cách ít suy diễn nhất, ghi lựa chọn vào câu trả lời cuối.
4. **Tạo file:**
   ```bash
   mkdir -p docs && cp .claude/skills/drawing-system-flows/template.html docs/system-flows.html
   ```
   Sửa `<title>` và `CONFIG.title` cùng giá trị `Luồng hệ thống <tên dự án>`. Thay `COMPONENTS`, `LINKS`, `ZONES`, `FLOWS` mẫu. Không sửa phần sau `// ---- Drawing code`.
5. **Kiến trúc:**
   - Khối rộng 140, cao 46. Đặt trên lưới: cột cách nhau từ 190 trở lên, hàng cách nhau từ 130 trở lên.
   - Kho dữ liệu dùng chung đặt ở giữa, tiến trình gọi kho đặt hai bên.
   - Khối đầu tiên trong vùng có `y` lớn hơn `y` của vùng ít nhất 50, chừa chỗ cho tên vùng.
   - Hai thành phần ngoài hệ thống ở hai phía: tạo hai vùng cùng `cls`, khác `id`.
   - Đường nối gấp khúc dùng `via`, đi qua hành lang trống. Điểm `via` đầu và cuối thẳng hàng với cạnh khối để đầu mũi tên vuông góc. Số trên đường nối trùng nhau: đặt `badge`.
6. **Luồng:**
   - Tab Luồng request: đường đi chung mà mọi request cùng loại đều qua, ví dụ request từ trình duyệt, kết nối realtime, request của worker. Tab Tính năng: từng nghiệp vụ. Mỗi tab có ít nhất một luồng. Tài liệu không mô tả đường đi chung: lấy luồng nghiệp vụ đi qua nhiều tầng nhất làm luồng request.
   - Mỗi luồng có `title`, `summary` một câu, tối đa 3 `notes`, `sources` là mọi file đã lấy bước.
   - Thành phần trung gian như reverse proxy: luồng nào tài liệu không nhắc thì không vẽ, ghi rõ trong `notes` nếu các luồng khác có.
   - `fail` đặt ở bước thực hiện kiểm tra đó. Bước gộp nhiều thao tác trong một transaction: giữ một bước, khối `tx` bao bước đó.
7. **Kiểm tra dữ liệu**, lệnh in `OK` hoặc danh sách lỗi:
   ```bash
   node -e '
   const s=require("fs").readFileSync("docs/system-flows.html","utf8");
   const js=s.slice(s.indexOf("<script>")+8,s.lastIndexOf("</script>"));new Function(js);
   const {COMPONENTS:C,LINKS:L,ZONES:Z,FLOWS:F}=new Function(js.slice(js.indexOf("// Data block"),js.indexOf("// ---- Drawing code"))+";return {COMPONENTS,LINKS,ZONES,FLOWS}")();
   const c=new Set(C.map(x=>x.id)),z=new Set(Z.map(x=>x.id)),e=[];
   C.forEach(x=>{z.has(x.zone)||e.push(x.id+": zone sai");x.shape!=="part"&&x.x===undefined&&e.push(x.id+": thiếu x, y")});
   L.forEach((l,i)=>c.has(l.from)&&c.has(l.to)||e.push("LINKS["+i+"] sai"));
   F.forEach(f=>{f.steps.forEach((s,i)=>{f.parts.includes(s.from)&&f.parts.includes(s.to)||e.push(f.id+" bước "+(i+1)+": ngoài parts");(s.type==="self")===(s.from===s.to)||e.push(f.id+" bước "+(i+1)+": self sai");s.text.split(" ").length>5&&e.push(f.id+" bước "+(i+1)+": nhãn quá 5 từ")});f.notes.length>3&&e.push(f.id+": quá 3 ghi chú")});
   ["luong-request","tinh-nang"].forEach(t=>F.some(f=>f.tab===t)||e.push("tab "+t+" trống"));
   C.forEach(x=>L.some(l=>l.from===x.id||l.to===x.id)||F.some(f=>f.parts.includes(x.id))||e.push(x.id+": không dùng"));
   console.log(e.length?e.join("\n"):"OK")'
   ```
8. **Xem giao diện:** chụp cả 3 tab bằng trình duyệt headless nếu có, sửa chỗ đè chữ, mũi tên lệch, cột bị cắt. `OUT` là thư mục tạm của phiên, `CHROME` là đường dẫn Chrome trên máy. WSL dùng Chrome của Windows, thường ở `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`:
   ```bash
   for t in kien-truc luong-request tinh-nang; do "$CHROME" --headless=new --hide-scrollbars --window-size=1440,1000 --virtual-time-budget=3000 --screenshot="$(wslpath -w "$OUT")\\$t.png" "file:///$(wslpath -w docs/system-flows.html | tr '\\' '/')#$t"; done
   ```
   Muốn chụp một luồng khác luồng đầu tiên: chép trang ra thư mục tạm, thêm cuối file một `<script>` bấm nút luồng đó, chụp bản chép.
9. **Xuất bản** bằng Artifact tool nếu có. Project có file quy tắc viết tài liệu: ghi bảng mã hóa dưới đây vào đó nếu chưa có. Không có: báo người dùng, không tự tạo file quy tắc.

## Dữ liệu

| Mảng | Trường chính |
|---|---|
| `COMPONENTS` | `id`, `name`, `shape`: `proc` tiến trình, `store` kho dữ liệu, `ext` bên ngoài, `part` lớp trong một tiến trình (không có x, y). `zone`, `x`, `y`, `code`, `role` |
| `ZONES` | `id`, `name`, `sub` mức tin cậy, `cls`: `z-out` không tin cậy, `z-core` tin cậy, `z-partial` tin cậy một phần, ví dụ máy tiếp xúc trực tiếp hệ thống ngoài. `x`, `y`, `w`, `h` |
| `LINKS` | `from`, `to`, `ch`, `kind`: `sync`, `async`. `label` tên kênh thật như AMQP, SMTP, `detail` nội dung, `via`, `badge` |
| `FLOWS` | `id`, `tab`: `luong-request` hoặc `tinh-nang`. `group`, `title`, `summary`, `parts`, `steps`, `blocks`, `notes`, `sources` |
| `steps` | `from`, `to`, `type`: `call`, `return`, `async`, `self`. `text`, `fail` |
| `blocks` | `type`: `tx` transaction, `loop` lặp. `label`, `from`, `to` là số bước từ 1 |

## Mã hóa cố định

| Thành phần | Ý nghĩa |
|---|---|
| Hình chữ nhật, hình trụ, viền đứt bo tròn, nền xám | Tiến trình, kho dữ liệu, bên ngoài hệ thống, lớp trong tiến trình |
| Vùng nền | Ranh giới tin cậy |
| Xanh dương, xanh lá, cam | Kênh HTTP, SQL, S3 |
| Tím nét đứt | Queue, NOTIFY, pub/sub |
| Đỏ | Tiến trình con, lưu lượng ra hệ thống ngoài |
| Màu chữ chính | Gọi trong cùng tiến trình |
| Xám nét đứt, đầu rỗng | Trả về |
| Nét đứt dọc dưới mỗi thành phần | Trục thời gian |
| Khối nền xanh, xanh lá | Transaction, lặp |
| Chữ đỏ ở cột Không đạt thì | Kết quả khi kiểm tra không đạt |
| Chấm chạy dọc mũi tên | Dòng chảy dữ liệu, bật mặc định |

Chọn `ch` theo bản chất kênh, giữ tên giao thức thật ở `label`:

| `ch` | Dùng cho |
|---|---|
| `http` | HTTP, gRPC giữa các thành phần trong hệ thống |
| `sql` | Truy vấn CSDL |
| `s3` | Kho object |
| `queue` | Message queue, broker, pub/sub, thông báo của CSDL: AMQP, Kafka, Redis, PostgreSQL NOTIFY |
| `run` | Tiến trình con, lưu lượng ra hệ thống ngoài: SMTP, API bên thứ ba, cổng thanh toán |

Màu của bước trong sơ đồ tuần tự tự suy từ thành phần mà mũi tên chạm tới, không khai báo riêng.

## Mẫu đặt tên

| Loại | Mẫu | Ví dụ |
|---|---|---|
| Tên luồng | Động từ cộng đối tượng, 2 đến 3 từ | Đặt hàng, Hủy đơn |
| Request HTTP | `METHOD /đường dẫn`, rút gọn tiền tố chung bằng `…` | `POST /orders`, `PUT …/attachments` |
| Gọi, tự xử lý | Động từ cộng đối tượng, tối đa 5 từ | Kiểm tra tồn kho, Ghi đơn hàng |
| Chuyển trạng thái | Chuyển sang `<trạng thái>` | Chuyển sang paid |
| Trả về | Cụm danh từ | Đơn vừa tạo |
| Bất đồng bộ | Tên task, sự kiện | Task send_email, Sự kiện đơn mới |
| Không đạt thì | Mã lỗi có trong tài liệu, nếu không thì cụm ngắn | 409 out_of_stock, Từ chối |

## Lỗi thường gặp

| Lỗi | Cách tránh |
|---|---|
| Thêm bước, mã lỗi không có trong tài liệu | Chỉ vẽ điều tài liệu ghi, ghi `sources` |
| Nhãn chữ đè nhau trên sơ đồ kiến trúc | Dùng số trên đường nối, nội dung để ở bảng kênh |
| Đầu mũi tên chéo | Điểm `via` cuối thẳng hàng với cạnh khối đích |
| Đường nối cắt qua khối | Đi qua hành lang trống bằng `via` |
| Tên luồng, nhãn mỗi chỗ một kiểu | Theo bảng Mẫu đặt tên |
| Trang Artifact trống | Giữ hàm bọc `(() => { ... })()`, không khai báo biến toàn cục |
| Mở trực tiếp lỗi tiếng Việt | Giữ `<meta charset="utf-8">` ở dòng đầu |
| Hai tab cùng hiện | Giữ `[hidden] { display: none !important; }` |

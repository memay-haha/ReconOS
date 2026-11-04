---
name: log-architecture
description: Dùng khi dựng mới, thiết kế lại hoặc review hệ thống ghi log cho backend, API, worker, microservice ở bất kỳ ngôn ngữ nào. Dấu hiệu: log là print() hoặc câu tự do khó tìm, không truy được một request qua nhiều dịch vụ, log lộ mật khẩu hoặc token, đĩa đầy vì file log, ghi log làm chậm request, lỗi production không ai biết.
---

# Kiến trúc log

## Tổng quan

Log là dữ liệu cho máy đọc trước, người đọc sau. Mỗi bản ghi là một sự kiện có cấu trúc, mang đủ ngữ cảnh để lọc, đếm và nối với sự kiện khác mà không cần regex. Ghi quá nhiều thì tốn đĩa, băng thông và lộ dữ liệu. Ghi quá ít thì không đủ dữ liệu để gỡ lỗi.

Nếu dự án đã có quy tắc log, làm theo quy tắc đó. Skill này dùng để lấp chỗ còn thiếu.

## Các bước dựng hệ thống log

1. Trả lời 6 câu chính sách.
2. Chốt bảng cấp log.
3. Chốt các loại log.
4. Định nghĩa schema bản ghi.
5. Gắn ngữ cảnh và truy vết.
6. Chọn đích ghi, ghi bất đồng bộ.
7. Đặt xoay vòng và thời gian giữ.
8. Che dữ liệu, phân quyền kho log.
9. Kiểm tra.

### 1. Chính sách log: 6 câu

| Câu | Hỏi |
|---|---|
| Why | Log để làm gì: gỡ lỗi, giám sát sức khỏe, kiểm toán, phân tích hành vi? |
| Who | Thành phần nào sinh log: API, app, worker, hạ tầng, công cụ ngoài? |
| When | Thời điểm nào: bắt đầu, kết thúc, lỗi, đổi trạng thái? |
| Where | Ghi đi đâu: stdout, file, kho log tập trung, Slack, SMS, BigQuery? |
| What | Ghi gì: ai, làm gì, trên đối tượng nào, kết quả? |
| How | Push (đẩy tới người ngay) hay pull (lưu để tra khi cần)? |

Trả lời cho từng loại log ở bước 3. Không trả lời được Why thì không thêm log.

### 2. Cấp log

| Cấp | Khi nào | Xử lý | Ví dụ |
|---|---|---|---|
| FATAL/CRITICAL | Hệ thống không vận hành tiếp được | Sửa ngay, push cảnh báo | Mất kết nối CSDL |
| ERROR | Lỗi ngoài dự tính, thao tác thất bại | Sửa trong giờ vận hành, push | Không gửi được mail |
| WARN | Không phải lỗi nhưng bất thường: đầu vào lạ, thử lại | Xem định kỳ, pull | Gọi API ngoài phải thử lại |
| INFO | Bắt đầu, kết thúc một xử lý, transaction, batch | Không cần sửa, pull | Request xong, batch xong |
| DEBUG | Trạng thái bên trong để gỡ lỗi | Không bật ở production | Giá trị trung gian trong hàm |
| TRACE | Chi tiết hơn DEBUG | Không bật ở production | Từng bước vòng lặp |

Cấp mặc định đọc từ biến môi trường, đổi được mà không sửa code.

### 3. Loại log

| Loại | Why | What | Where, How |
|---|---|---|---|
| System | Gỡ lỗi khi hệ thống lỗi | ERROR trở lên: stack trace. Cấp thấp hơn: nội dung cần báo | ERROR trở lên push tới kênh dev. WARN, INFO pull. DEBUG chỉ ở môi trường dev, staging |
| Access | Theo dõi request vào, response ra | Ai, cách nào, khi nào: IP, method, path, status, thời gian xử lý | INFO, pull. Khối lượng lớn nhất nên cần chỉ mục cho tìm kiếm |
| Auth | Theo dõi xác thực | Ai, bằng phương thức nào, khi nào, kết quả | INFO, WARN khi thất bại, pull |
| Action | Phân tích hành vi người dùng để cải thiện dịch vụ | Tên hành động, ID đối tượng, theo mục tiêu phân tích | Công cụ phân tích: BigQuery, BI |

Tách logger theo loại, ví dụ `system`, `access`, `auth`, để lọc và định tuyến riêng từng loại.

Trường theo tầng:

- Tầng API: thời gian phản hồi, mã trạng thái, ID người gọi.
- Tầng truy cập CSDL: truy vấn chậm kèm thời gian chạy.

### 4. Schema bản ghi

Ghi JSON, mỗi bản ghi một dòng. Tên sự kiện cố định, dữ liệu biến đổi nằm trong trường riêng.

```json
{"timestamp": "2021-07-29T14:52:55.162Z", "level": "info", "service": "order-api",
 "event": "order_created", "request_id": "9f1c...", "user_id": "4253",
 "order_id": "4567", "duration_ms": 38}
```

- Trường luôn có: `timestamp` UTC ISO 8601, `level`, `service`, `event`.
- Trường ngữ cảnh khi có: `request_id`, `user_id`, ID đối tượng nghiệp vụ, `duration_ms`.
- Mọi dịch vụ dùng chung tên trường.
- Lỗi: ghi stack trace vào một trường, không ghi thành nhiều dòng.

❌ Câu tự do, mỗi câu một mẫu, không lọc được theo người dùng:

```text
INFO|New report created by user 4253
INFO|User 478 deleted report
```

### 5. Ngữ cảnh và truy vết

1. Middleware ở điểm vào đầu tiên đọc header `X-Request-ID`. Thiếu thì sinh UUID. Trả lại header đó trong response.
2. Lưu ID vào context của luồng xử lý: `AsyncLocalStorage` trong Node.js, `contextvars` trong Python, `context.Context` trong Go, MDC trong Java. Logger tự lấy ID từ context.
3. ❌ Không truyền ID qua tham số của từng hàm nghiệp vụ.
4. Mỗi lời gọi sang dịch vụ khác gửi kèm header. Bên nhận gắn lại ID vào context.
5. Gửi message vào queue: đặt `request_id` vào header của message. Ghi một sự kiện chứa cả `request_id` và ID job. Worker gắn hai ID vào context đầu job, xóa cuối job.
6. Middleware hoặc interceptor bao quanh handler ghi access log khi response ra: method, path, status, thời gian xử lý. Cần ghi cả lúc request vào thì dùng logger riêng, như `access_req` và `access_res`.
7. Đồng bộ đồng hồ mọi máy bằng NTP. Đồng hồ lệch thì thứ tự sự kiện giữa các máy sai.

### 6. Đích ghi và hiệu năng

- Ghi log trong luồng xử lý request làm tăng thời gian phản hồi. Chọn một trong hai cách:
  - Ứng dụng chạy trong container: chỉ ghi JSON ra stdout. Collector như Fluent Bit, Vector đọc stdout, gom lô, gửi về kho tập trung. Ứng dụng không tự gom lô.
  - Ứng dụng tự gửi về kho: đẩy bản ghi vào hàng đợi trong bộ nhớ, tiến trình nền ghi theo lô.
- ⚠️ Lô trong bộ nhớ mất khi tiến trình chết. Với cách tự gửi, luôn ghi stdout song song. Giới hạn kích thước hàng đợi, đầy thì bỏ bản ghi và ghi cảnh báo.
- Chọn kích thước lô bằng test tải. Lô lớn tốn bộ nhớ và chậm hiển thị trên công cụ giám sát. Lô nhỏ không giảm được số lần ghi.
- Kho log lỗi thì request vẫn chạy bình thường.
- ❌ Không ghi log trong vòng lặp theo từng phần tử. Ghi một bản tổng kết sau vòng lặp.
- Tách đích theo cấp: ERROR trở lên tới kênh cảnh báo, mọi cấp tới kho tra cứu.

### 7. Xoay vòng và thời gian giữ

- File log không giới hạn làm đầy đĩa và sập máy chủ. Xoay vòng theo kích thước hoặc thời gian, nén hoặc xóa file cũ. Dùng công cụ có sẵn như logrotate, transport xoay vòng của thư viện log.
- Container: giới hạn kích thước và số file log của container runtime.
- Giữ theo cấp: ERROR trở lên giữ lâu để kiểm tra định kỳ, INFO ngắn hơn, DEBUG vài ngày. Log phục vụ kiểm toán giữ theo yêu cầu pháp lý của dự án.

### 8. Bảo mật

- Processor che dữ liệu chạy trước mọi đích ghi. Duyệt đệ quy object và mảng, so tên trường không phân biệt hoa thường, thay giá trị bằng `***`.
- Danh sách tên trường tối thiểu: `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`. Có thanh toán thì thêm `credit_card`, `card_number`, `cvv`. Email, số điện thoại: che một phần nếu luật dữ liệu cá nhân yêu cầu.
- ❌ Không ghi nguyên body request, body response. Ghi body rồi che từng trường là cách dễ lộ: thêm trường mới là lọt. Chỉ ghi các trường đã chọn.
- Kho log tập trung: phân quyền đọc theo đặc quyền tối thiểu, mã hóa khi truyền và khi lưu, ghi lại ai đã truy cập log.

### 9. Kiểm tra

- Grep code hoặc bật luật lint: không còn `print`, `console.log`, `fmt.Println`, chuỗi định dạng sẵn trong lệnh log.
- Test processor che dữ liệu với từng tên trường trong danh sách, cả trường lồng nhau.
- Gửi một request, lọc theo `request_id`: thấy đủ access log, log nghiệp vụ, log của dịch vụ phía sau.
- Tắt kho log: request vẫn thành công, stdout có cảnh báo.

## Lỗi thường gặp

| Lỗi | Sửa |
|---|---|
| `logger.info(\`User ${id} created order\`)` | `logger.info({ event: "order_created", user_id: id })` |
| Chỉ ghi khi lỗi | Ghi INFO lúc bắt đầu và kết thúc để biết lỗi ở chặng nào |
| Ghi toàn bộ payload ở INFO trên production | Chỉ ghi trường đã chọn, che trường nhạy cảm |
| `request_id` mất khi sang dịch vụ khác hoặc xuống queue | Gửi qua header, hoặc ghi sự kiện nối `request_id` với ID job |
| Ghi log đồng bộ vào kho tập trung trong request | Ghi stdout cho collector, hoặc hàng đợi bộ nhớ ghi theo lô |
| Không xoay vòng file log | Xoay vòng theo kích thước hoặc thời gian, giữ theo cấp |
| Bật DEBUG trên production | Cấp mặc định INFO, đổi bằng biến môi trường |
| Mỗi dịch vụ đặt tên trường khác nhau | Thống nhất schema ở bước 4 |

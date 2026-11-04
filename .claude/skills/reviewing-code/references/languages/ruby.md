# Ruby và Rails

Dùng khi review code Ruby 3.4+/4.0 và Rails 8.x. Trọng tâm: ngữ nghĩa Ruby, ranh giới controller, tính đúng của Active Record, hiệu năng truy vấn, background job và test.

## Phạm vi và phiên bản

File này nhắm tới ứng dụng Ruby 3.4/4.0 còn được bảo trì và Rails 8.x. Trước khi áp dụng lời khuyên phụ thuộc phiên bản, xem `.ruby-version`, `Gemfile.lock`, `config.load_defaults`, adapter CSDL, adapter queue và ma trận CI.

Không bắt dùng API mới chỉ vì API đó có sẵn. Ví dụ, `params.expect` của Rails 8 là API strong parameters gọn hơn, nhưng contract `require(...).permit(...)` tường minh có sẵn vẫn có thể đúng. Chi tiết implementation Ruby cũng khác nhau giữa MRI, JRuby và TruffleRuby, nên không coi Global VM Lock của MRI là thay thế cho đồng bộ hóa.

Câu hỏi review:
- Phiên bản Ruby, Rails, CSDL và queue thực tế đang triển khai là gì?
- Thay đổi có dựa vào giá trị mặc định khác nhau giữa các phiên bản Rails hoặc adapter không?
- Đề xuất chỉ liên quan nâng cấp có được tách khỏi phát hiện về tính đúng hoặc bảo mật không?

## Ngữ nghĩa Ruby và contract API

### Nhớ quy tắc truthiness của Ruby

Chỉ `false` và `nil` là falsey. `0`, `""` và `[]` đều truthy, nên code chuyển từ ngôn ngữ khác có thể lặng lẽ chọn sai nhánh.

```ruby
# Sai: 0 là truthy, điều kiện này không kiểm tra có bản ghi nào không.
if relation.count
  publish_report
end

# Đúng: nêu thẳng điều kiện, để CSDL trả lời hiệu quả.
publish_report if relation.exists?
```

Câu hỏi review:
- Điều kiện có dựa vào việc `0`, chuỗi rỗng hoặc tập rỗng là falsey không?
- `empty?`, `any?`, `exists?`, `present?` hoặc so sánh tường minh có thể hiện ý định rõ hơn không?
- Có relation nào bị nạp toàn bộ chỉ để kiểm tra một dòng có tồn tại không?

### Giữ contract của predicate và phép so sánh

Method predicate thường kết thúc bằng `?` và trả về boolean. Review kỹ phép so sánh bằng tự định nghĩa: `==`, `eql?`, `equal?` và `hash` có contract khác nhau.

```ruby
class Money
  attr_reader :amount, :currency

  def initialize(amount, currency)
    @amount = amount
    @currency = currency
  end

  def ==(other)
    other.is_a?(Money) &&
      amount == other.amount &&
      currency == other.currency
  end

  alias eql? ==

  def hash
    [amount, currency].hash
  end
end
```

Câu hỏi review:
- Nếu override `eql?`, `hash` có nhất quán để tra cứu trong Hash và Set chạy đúng không?
- Có chỗ nào vô tình dùng `equal?` trong khi cần so sánh giá trị không?
- Predicate có trả về object domain hoặc `nil` trong khi bên gọi mong `true` hoặc `false` không?

### Khai báo keyword argument tường minh

Ruby tách positional argument và keyword argument. Tham số `**options` rộng có thể giấu lỗi gõ và làm yếu contract API public.

```ruby
# Sai: lặng lẽ nhận option gõ sai hoặc không hỗ trợ.
def charge(customer, **options)
  gateway.charge(customer, options)
end

# Đúng: keyword bắt buộc và tùy chọn hiện rõ với bên gọi.
def charge(customer, amount:, currency: "USD", idempotency_key:)
  gateway.charge(
    customer,
    amount: amount,
    currency: currency,
    idempotency_key: idempotency_key
  )
end
```

Chỉ dùng `...` để ủy quyền trong suốt khi chủ ý chuyển tiếp mọi positional argument, keyword argument và block.

Câu hỏi review:
- Keyword bắt buộc có được khai báo không kèm giá trị mặc định không?
- Wrapper có giữ đúng keyword và block không?
- Nhận keyword tùy ý có biến lỗi gõ của bên gọi thành hành vi trễ hoặc im lặng không?

### Giữ ranh giới metaprogramming nhỏ

Ruby giúp dựng API động dễ dàng, nhưng người review coi `eval`, `class_eval` với chuỗi, `send`, `const_get` và constantize động là ranh giới tin cậy.

```ruby
# Sai: đầu vào người dùng quyết định method được gọi.
account.send(params[:operation])

# Đúng: ánh xạ đầu vào ngoài sang thao tác nội bộ cố định.
OPERATIONS = {
  "activate" => :activate!,
  "suspend" => :suspend!
}.freeze

operation = OPERATIONS.fetch(params[:operation])
account.public_send(operation)
```

Câu hỏi review:
- Đầu vào ngoài có chọn được method, class, hằng, template hoặc chuỗi code không?
- Có allowlist cố định trước `public_send` hoặc `constantize` không?
- Metaprogramming có được cô lập và có contract test không?

### Coi deserialize và chạy shell là ranh giới tin cậy

`Marshal.load` có thể khởi tạo object Ruby, không được nhận byte không tin cậy (P0). Ưu tiên định dạng chỉ chứa dữ liệu như JSON. Khi cần YAML, dùng `YAML.safe_load` hoặc `Psych.safe_load` với allowlist tường minh. Truyền tham số tiến trình thành từng giá trị riêng thay vì nội suy vào lệnh shell.

```ruby
# Sai: đầu vào không tin cậy có thể kích hoạt deserialize object nguy hiểm.
payload = Marshal.load(request.raw_post)

# Đúng: parse JSON chỉ chứa dữ liệu, rồi kiểm tra hình dạng.
payload = JSON.parse(request.raw_post)

# Đúng: chỉ cho phép kiểu YAML và alias mà định dạng cần.
payload = YAML.safe_load(request.raw_post, permitted_classes: [], aliases: false)

# Sai: tên file có thể chèn thêm cú pháp shell.
system("convert #{uploaded_path} output.png")

# Tốt hơn: dạng argv bỏ qua parse shell, nhưng chưa kiểm tra đường dẫn.
system("convert", uploaded_path, "output.png")
```

Câu hỏi review:
- Dữ liệu từ request, cache, cookie, queue hoặc file có tới được `Marshal.load`, `YAML.load` hoặc `Psych.load` không giới hạn không?
- Dữ liệu đã parse có được kiểm tra trước khi dùng để chọn class, method, đường dẫn hoặc thao tác CSDL không?
- `permitted_classes` và `aliases` có chặt nhất mà contract YAML cho phép không?
- Tham số subprocess có truyền riêng, đường dẫn có bị giới hạn trong thư mục upload dự kiến, exit status và timeout có được xử lý không?

## Collection, thay đổi tại chỗ và nil

### Tránh giá trị mặc định dùng chung cho collection

`Hash.new(object)` dùng lại cùng một object cho mọi key thiếu. Dùng block khi mỗi key cần trạng thái thay đổi được riêng.

```ruby
# Sai: mọi key thiếu dùng chung một mảng.
grouped = Hash.new([])
grouped[:paid] << 1
grouped[:failed] << 2
# Key chưa bao giờ được gán, cả hai lần đọc đều sửa cùng một giá trị mặc định ẩn.
grouped # => {}
grouped[:paid] # => [1, 2]
grouped[:failed] # => [1, 2]

# Sai: mọi phần tử trỏ tới cùng một mảng.
matrix = Array.new(3, [])

# Đúng: block tạo mảng độc lập cho từng phần tử.
matrix = Array.new(3) { [] }

# Đúng: mỗi key thiếu nhận mảng riêng.
grouped = Hash.new { |hash, key| hash[key] = [] }
grouped[:paid] << 1
grouped[:failed] << 2
```

Câu hỏi review:
- Giá trị mặc định của Hash có chứa Array, Hash hoặc String thay đổi được không?
- Block mặc định có lưu giá trị vừa sinh lại vào hash khi đó là ý định không?
- Hằng hoặc class attribute dùng chung có bị sửa xuyên qua các request hoặc test không?

### Coi method bang là tín hiệu ngữ nghĩa, không phải bảo đảm

Quy ước `!` thường chỉ phiên bản nguy hiểm hơn hoặc thay đổi tại chỗ, nhưng không có nghĩa chung là "raise khi thất bại". Nhiều method thay đổi tại chỗ trả về `nil` khi không có gì thay đổi.

```ruby
name = "ready"

# Sai: `downcase!` trả về nil khi chuỗi đã là chữ thường.
normalized = name.downcase!

# Đúng: dùng dạng không bang khi cần giá trị trả về.
normalized = name.downcase
```

Câu hỏi review:
- Code có dựa vào giá trị trả về của method bang mà chưa kiểm tra contract không?
- Thay đổi tại chỗ có hiện rõ với mọi nơi đang giữ object không?
- Phép biến đổi không thay đổi tại chỗ có làm luồng dữ liệu rõ hơn không?

### Không dùng safe navigation để giấu bất biến bị phá

`&.` hữu ích cho quan hệ thật sự tùy chọn. Safe navigation lặp lại có thể biến dữ liệu bắt buộc bị thiếu thành `nil` muộn và giấu nguồn gốc trạng thái sai.

```ruby
# Sai khi mọi order bắt buộc có customer và email.
recipient = order&.customer&.email

# Đúng: bắt buộc association và báo lỗi gần trạng thái sai.
recipient = order.customer.email
```

Câu hỏi review:
- nil là một phần của domain, hay là bằng chứng bất biến bị phá?
- Model, CSDL hoặc bên gọi có nên bảo đảm sự tồn tại thay vào đó không?
- `dig` hoặc `&.` có làm lỗi biến mất để rồi thất bại ở chỗ sau không?

### Chọn thao tác Enumerable khớp ý định

Dùng `each` cho side effect, `map` cho biến đổi, `filter_map` cho biến đổi kèm loại nil, `each_with_object` cho cộng dồn. Tránh chuỗi thao tác cấp phát mảng trung gian trên hot path.

```ruby
# Sai: dùng map cho side effect, để lại mảng không dùng.
orders.map { |order| AuditLog.write(order) }

# Đúng: side effect hiện rõ.
orders.each { |order| AuditLog.write(order) }

# Đúng: biến đổi và bỏ nil trong một lượt.
emails = users.filter_map { |user| user.email if user.subscribed? }
```

Câu hỏi review:
- Có dùng `map` mà bỏ qua collection trả về không?
- Chuỗi thao tác dài có cấp phát tập trung gian lớn không?
- Relation có bị chuyển sang Array trước khi CSDL lọc, sắp xếp hoặc tổng hợp không?

## Exception và an toàn tài nguyên

### Rescue lỗi dự kiến nhỏ nhất

`rescue` trần bắt `StandardError` và class con, nên vẫn gom nhiều lỗi không liên quan: lỗi lập trình, lỗi CSDL, timeout và lỗi validation.

```ruby
# Sai: biến mọi lỗi ứng dụng thông thường thành cùng một response.
def create
  order = Orders::Create.call(order_params)
  render json: order
rescue => error
  Rails.logger.info(error.message)
  render json: { error: error.message }, status: :internal_server_error
end

# Đúng: chuyển đổi lỗi dự kiến ở ranh giới, để lỗi bất ngờ đi tới
# nơi báo cáo tập trung.
rescue_from Orders::InvalidOrder, with: :render_invalid_order

def create
  order = Orders::Create.call(order_params)
  render json: { id: order.id, status: order.status }, status: :created
end
```

Câu hỏi review:
- Exception bị rescue có phải lỗi dự kiến ở ranh giới này không?
- Khối được bảo vệ có đủ hẹp để không bắt nhầm lỗi không liên quan không?
- Response có lộ thông điệp exception nội bộ, SQL, đường dẫn, token hoặc chi tiết nhà cung cấp không?

### Giữ backtrace và cause gốc

Dùng `raise` trần để ném lại exception hiện tại. `raise error` cũng ném lại cùng object exception và giữ backtrace sẵn có, nhưng `raise` trần thể hiện ý định rõ hơn. Khi chuyển sang lỗi domain, báo cáo object exception gốc và giữ chuỗi cause.

```ruby
begin
  gateway.charge(payload)
rescue Gateway::Timeout => error
  Rails.error.report(error, context: { order_id: order.id })
  raise Payments::Unavailable, "payment gateway timed out"
end
```

Trong khối `rescue`, ném exception mới giữ exception đã rescue làm `cause` ngầm. Tạo exception mới, như `raise Payments::Unavailable, error.message`, sinh backtrace mới. Chỉ làm vậy khi ranh giới cần lỗi riêng của domain.

Nguyên tắc về ranh giới, chuỗi cause và báo cáo lỗi dùng chung nhiều ngôn ngữ: xem [Xử lý lỗi](../error-handling.md).

Câu hỏi review:
- Ngữ cảnh có cấu trúc được ghi log mà không lộ bí mật hoặc dữ liệu thanh toán đầy đủ không?
- Lỗi có giữ chuỗi cause hữu ích không?
- Mức log có phù hợp, và lỗi có được báo cáo đúng một lần không?

### Dùng block hoặc ensure để dọn dẹp

Ưu tiên API tài nguyên dạng block vì API dạng block đóng tài nguyên kể cả khi có exception. Dùng `ensure` khi không có dạng block.

```ruby
# Đúng: File.open đóng handle sau block.
File.open(path, "rb") do |file|
  checksum(file)
end

connection = pool.checkout
begin
  consume(connection)
ensure
  pool.checkin(connection)
end
```

Câu hỏi review:
- File, lock, thư mục tạm và tài nguyên đã checkout có được giải phóng trên mọi nhánh thực thi không?
- Khối `ensure` có vô tình `return` và nuốt exception không?
- Logic retry có giới hạn số lần và chỉ áp dụng cho lỗi tạm thời không?

## Rails controller và bảo mật

### Require và permit tham số tường minh

Rails 8 có `params.expect` để yêu cầu đúng hình dạng và chỉ cho phép thuộc tính được nêu tên. Với phiên bản Rails cũ hơn còn hỗ trợ, theo quy ước `require(...).permit(...)` đã có.

```ruby
# Sai: tham số controller chưa lọc ở ranh giới mass assignment.
Order.create!(params[:order])

# Sai: cho phép mọi thuộc tính hiện tại và tương lai, kể cả cột nhạy cảm.
params.expect(order: {})

# Đúng: allowlist contract request phẳng.
def order_params
  params.expect(order: [:product_id, :quantity, :shipping_address_id])
end

# Sai: một mảng đơn không biểu diễn mảng các hash tham số lồng nhau.
params.expect(order: [:product_id, line_items_attributes: [:id, :sku, :quantity]])

# Đúng: dùng dạng mảng kép cho mảng resource lồng nhau.
params.expect(order: [
  :product_id,
  line_items_attributes: [[:id, :sku, :quantity]]
])
```

Câu hỏi review:
- Trường nhạy cảm về phân quyền như `user_id`, `role`, `paid`, `admin` có bị loại không?
- Mảng resource lồng nhau có dùng dạng `[[...]]` thay vì coi như hash lồng phẳng không?
- Hash và mảng lồng nhau có được permit đúng hình dạng mong đợi không?
- Có `permit!`, `to_unsafe_h` hoặc permit hash rỗng làm rộng contract không?

### Tham số hóa truy vấn Active Record

Không bao giờ nội suy dữ liệu request vào đoạn SQL. Ưu tiên điều kiện dạng hash hoặc placeholder, allowlist định danh động như cột sắp xếp.

```ruby
# Sai: SQL injection.
Order.where("status = '#{params[:status]}'")

# Đúng: điều kiện hash được tham số hóa.
Order.where(status: params[:status])

# Đúng: placeholder cho điều kiện không phải bằng.
Order.where("total_cents >= ?", params[:minimum_cents])

# Sai: giá trị được quote, nhưng tên cột vẫn do kẻ tấn công kiểm soát.
Order.order(Arel.sql("#{params[:sort]} DESC"))

# Đúng: ánh xạ giá trị ngoài sang định danh SQL cố định.
SORTS = {
  "newest" => { created_at: :desc },
  "total" => { total_cents: :desc }
}.freeze

Order.order(SORTS.fetch(params[:sort], SORTS.fetch("newest")))
```

Câu hỏi review:
- Đầu vào người dùng có tới `where`, `order`, `select`, `joins`, `having` hoặc `find_by_sql` dưới dạng chuỗi không?
- `Arel.sql` chỉ dùng cho literal do lập trình viên kiểm soát không?
- Cột và chiều sắp xếp động có chọn từ allowlist không?

Mẫu tham số hóa và định danh động cho nhiều ORM: xem [SQL injection](../sql-injection.md).

### Giữ render và redirect trên allowlist

Render trực tiếp object Active Record có thể lộ cột mới thêm mà controller không đổi. Dùng serializer hoặc danh sách trường tường minh. Coi redirect, đường dẫn file và thao tác bỏ qua escape HTML là ranh giới bảo mật.

```ruby
# Sai: cột tương lai có thể thành một phần response API.
render json: order

# Đúng: trường trong response có chủ ý và quản lý phiên bản được.
render json: {
  id: order.id,
  status: order.status,
  total_cents: order.total_cents
}, status: :created

# Sai: open redirect khi người dùng kiểm soát đích.
redirect_to params[:return_to], allow_other_host: true

# Đúng: redirect tới route của ứng dụng.
redirect_to order_path(order)
```

Câu hỏi review:
- Bí mật, password digest, token, ghi chú nội bộ hoặc dữ liệu cá nhân có bị serialize không?
- `html_safe`, `raw` hoặc `safe_join` có nhận nội dung không tin cậy không?
- Đầu vào người dùng có điều khiển được redirect ra ngoài, đường dẫn tải file hoặc response header không?

### Tách xác thực, phân quyền và giới hạn phạm vi

Xác thực xác định bên gọi là ai, phân quyền quyết định bên gọi được làm gì. Nạp bản ghi theo ID toàn cục trước khi phân quyền có thể gây IDOR (Insecure Direct Object Reference).

```ruby
# Sai: người dùng đã đăng nhập bất kỳ có thể nạp order của người khác.
order = Order.find(params[:id])

# Đúng: giới hạn tra cứu qua chủ sở hữu hoặc policy scope.
order = current_user.orders.find(params[:id])
```

Câu hỏi review:
- Mọi member action có được phân quyền, kể cả action controller mới thêm không?
- Tra cứu bản ghi có được giới hạn phạm vi trước update, destroy, download hoặc enqueue không?
- Với session trình duyệt, request thay đổi trạng thái có được bảo vệ CSRF không?

### Bảo vệ request trình duyệt dựa trên session

Cần chống CSRF khi trình duyệt tự gửi cookie session đã xác thực. Endpoint chỉ là API dùng bearer token tường minh có thể dùng chiến lược khác, nhưng tắt chống CSRF không an toàn chỉ vì endpoint trả về JSON.

```ruby
# Đúng: controller dựa trên session giữ bật chống giả mạo.
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
end
```

```ruby
# Đúng: cấu hình session store trong initializer (ví dụ
# config/initializers/session_store.rb), không đặt trong class controller.
# Không cho JavaScript đọc cookie, chỉ HTTPS trên production, và nêu rõ
# chính sách cross-site theo luồng của ứng dụng.
Rails.application.config.session_store :cookie_store,
  key: "_app_session",
  secure: Rails.env.production?,
  httponly: true,
  same_site: :lax
```

Câu hỏi review:
- Có `POST`, `PATCH`, `PUT` hoặc `DELETE` xác thực bằng trình duyệt nào bỏ qua `protect_from_forgery` không?
- Thiết lập cookie `secure`, `httponly` và `same_site` có phù hợp với môi trường triển khai và luồng đăng nhập không?
- Endpoint chỉ là API có tránh xác thực bằng cookie, hoặc có biện pháp chống CSRF có chủ ý không?

### Review Active Storage và fetch phía server

Với upload Active Storage và mọi lần fetch URL phía server, kiểm tra quyền sở hữu blob, kiểm tra content type và kích thước, và kiểm soát SSRF trước khi nhận URL do người dùng cung cấp. URL có chữ ký và hạn dùng, giới hạn direct upload và tham số variant phải nằm trong allowlist. Hướng dẫn rộng hơn về request và tài sản: xem [Review bảo mật](../security.md).

Câu hỏi review:
- Tải attachment, redirect hoặc fetch phía server có truy cập được file hoặc URL ngoài phạm vi đã phân quyền không?
- Content type, kích thước và quyền sở hữu có được kiểm tra trước khi lưu hoặc biến đổi blob không?
- URL do người dùng kiểm soát dùng cho fetch phía server có áp allowlist host và chặn dải mạng nội bộ không?

### Làm request ghi bị retry trở thành idempotent

Client hoặc proxy có thể retry request sau khi CSDL đã commit nhưng trước khi nhận response. Với thao tác như tạo order, yêu cầu idempotency key do bên gọi cung cấp, giới hạn theo chủ thể đã xác thực và thao tác, và ép tính duy nhất trong CSDL.

```ruby
# Service lưu cả key và fingerprint của request đã kiểm tra.
order = Orders::CreateOnce.call(
  actor: current_user,
  idempotency_key: request.headers.fetch("Idempotency-Key"),
  attributes: order_params
)

# Migration: bắt buộc key khi API này bắt buộc header, rồi chặn
# race tạo trùng đồng thời. Với bảng đã có dữ liệu, backfill
# hoặc đặt default tạm trước khi thêm `null: false`.
add_column :orders, :idempotency_key, :string, null: false
add_index :orders, [:user_id, :idempotency_key], unique: true
```

Khi cùng key được dùng lại, chỉ trả kết quả gốc nếu fingerprint request khớp. Từ chối key dùng lại với thuộc tính khác thay vì lặng lẽ trả về hoặc sửa nhầm resource.

Câu hỏi review:
- Timeout hoặc lỗi enqueue có thể xảy ra sau khi ghi đã commit không?
- Bên gọi có retry việc tạo, thanh toán, mời hoặc việc không idempotent khác không?
- Key bắt buộc có bị từ chối trước khi insert khi thiếu, và có lưu trong cột `null: false` không? Unique index cho phép nhiều `NULL` trên nhiều adapter.
- Với bảng có sẵn, migration có backfill trước khi ép `null: false` không?
- Idempotency có được ép bằng unique constraint và test với request đồng thời không?

## Tính đúng của Active Record

### Kết hợp validation của model với ràng buộc CSDL

Validation của model cho thông báo lỗi tốt hơn nhưng không chống được ghi đồng thời hoặc client không dùng Rails. Bất biến quan trọng cần ràng buộc và index trong CSDL.

```ruby
class Membership < ApplicationRecord
  validates :user_id, uniqueness: { scope: :team_id }
end

# Cũng cần migration:
add_index :memberships, [:team_id, :user_id], unique: true
add_check_constraint :orders, "total_cents >= 0", name: "orders_total_nonnegative"
```

Câu hỏi review:
- Bất biến unique, non-null, foreign key và khoảng giá trị có tồn tại trong CSDL không?
- Code ứng dụng có xử lý vi phạm ràng buộc do request đồng thời không?
- Mẫu truy vấn mới có index phù hợp không?

### Biết API nào bỏ qua validation và callback

Method thao tác hàng loạt có giá trị, nhưng `update_all`, `delete_all`, `insert_all` và SQL trực tiếp bỏ qua một phần vòng đời model thông thường.

```ruby
# Lệnh này không chạy validation hay callback update của model.
Order.where(expired: true).update_all(status: "cancelled", updated_at: Time.current)
```

Câu hỏi review:
- Bỏ qua validation, callback, timestamp, audit và hành vi dependent có chủ ý không?
- Có cần `destroy_all` để dọn dependent dù chậm hơn không?
- Ghi hàng loạt có bỏ qua callback counter cache và cần `reset_counters` hoặc bước đối soát tường minh khác không?
- Thao tác hàng loạt có giới hạn, quan sát được và retry an toàn không?

### Giữ callback nhỏ và dự đoán được

Callback gửi email, gọi API, enqueue nhiều workflow hoặc sửa model không liên quan làm việc lưu dữ liệu khó suy luận.

Ưu tiên service ứng dụng tường minh cho việc điều phối. Nếu việc chỉ được chạy sau khi transaction commit, dùng `after_commit` hoặc hành vi enqueue sau commit có chủ ý.

Câu hỏi review:
- Lưu một model có thể bất ngờ gây I/O mạng hoặc chuỗi tác động lớn không?
- Callback có chạy trong test, data migration, console script hoặc retry không?
- Thứ tự callback có là phụ thuộc tính đúng không được ghi lại không?

### Coi thay đổi enum và scope là thay đổi contract dữ liệu

Enum dựa trên số nguyên phụ thuộc ánh xạ thứ tự ổn định. Thêm giá trị mới vào cuối hoặc dùng ánh xạ tường minh, không sắp xếp lại mục có sẵn.

```ruby
# An toàn hơn cho dữ liệu sống lâu và contract giữa các service.
enum :status, {
  pending: 0,
  paid: 1,
  cancelled: 2
}
```

Scope phải luôn trả về relation. Scope có điều kiện trả về `nil` hoặc Array làm hỏng khả năng ghép nối.

Câu hỏi review:
- Thay đổi enum có diễn giải lại các dòng đã có không?
- Scope có còn nối chuỗi được với mọi đầu vào không?
- `default_scope` có giấu bản ghi hoặc thứ tự trong ngữ cảnh gây bất ngờ không?

### Giữ counter cache và query cache đúng

Counter cache là dữ liệu phi chuẩn hóa do callback duy trì. Ghi hàng loạt, SQL trực tiếp, import và dòng bị xóa bỏ qua vòng đời thông thường có thể làm counter cache lệch. Sửa có chủ ý bằng `reset_counters` sau khi xác minh truy vấn trên dữ liệu gốc.

Job chạy lâu cũng không nên giả định kết quả truy vấn còn đúng suốt job. Kiểm tra phạm vi query cache và dùng khối uncached hoặc truy vấn mới khi bước sau cần thấy dữ liệu đã ghi hoặc thay đổi đồng thời.

Câu hỏi review:
- `update_all`, `delete_all`, import hoặc SQL trực tiếp có bỏ qua cập nhật counter cache không?
- Việc sửa counter cache có quan sát được và dựa trên dữ liệu gốc hiện tại không?
- Kết quả truy vấn đã cache có bị cũ giữa các giai đoạn của job chạy lâu không?

## Hiệu năng truy vấn

### Phát hiện và ngăn N+1

Truy cập association trong vòng lặp là hotspot khi review. Chọn cách eager loading tùy association chỉ được nạp hay còn dùng trong điều kiện SQL.

```ruby
# Sai: một truy vấn cho orders, rồi mỗi customer một truy vấn.
orders = Order.where(status: "paid")
orders.each { |order| puts order.customer.name }

# Đúng: thường là hai truy vấn, nạp object dự đoán được.
orders = Order.where(status: "paid").preload(:customer)

# Đúng khi để Rails chọn chiến lược eager loading.
orders = Order.includes(:customer).where(status: "paid")

# Dùng eager_load khi chủ ý cần LEFT OUTER JOIN.
orders = Order.eager_load(:customer).where(customers: { active: true })
```

`strict_loading` biến lazy load vô tình thành lỗi thấy được trong development hoặc test.

`eager_load` dùng `LEFT OUTER JOIN`. Khi join association dạng collection, `eager_load` có thể đổi số dòng kết quả: một bản ghi cha xuất hiện một lần cho mỗi bản ghi con khớp. Dùng `distinct`, subquery, hoặc tách truy vấn lọc khỏi `preload` khi bên gọi cần mỗi bản ghi cha một dòng.

Phát hiện N+1 và chiến lược nạp cho nhiều framework: xem [Truy vấn N+1](../n-plus-one.md).

Câu hỏi review:
- Serializer, view, GraphQL resolver hoặc job có duyệt association chưa nạp không?
- Cách eager loading đã chọn có tương thích với lọc, sắp xếp và số dòng kết quả không?
- Join collection có thể nhân bản dòng cha hoặc cần `distinct`, subquery hay bước `preload` riêng không?
- Có assertion đếm truy vấn hoặc strict loading bảo vệ endpoint quan trọng không?

### Giữ lọc và tổng hợp trong CSDL

Nạp bản ghi trước khi lọc tốn bộ nhớ và có thể đổi ngữ nghĩa.

```ruby
# Sai: nạp mọi order đã thanh toán rồi lọc trong Ruby.
large_orders = Order.paid.to_a.select { |order| order.total_cents >= 10_000 }

# Đúng: CSDL áp điều kiện.
large_orders = Order.paid.where(total_cents: 10_000..)

# Sai: khởi tạo bản ghi chỉ để đọc một cột.
emails = User.active.map(&:email)

# Đúng: chỉ đọc cột cần.
emails = User.active.pluck(:email)
```

Câu hỏi review:
- `to_a`, `map`, `select` hoặc `sort_by` có đẩy việc sang Ruby quá sớm không?
- `pluck`, `pick`, `ids`, `exists?`, `count`, `sum` hoặc `maximum` có tránh được việc khởi tạo model không?
- Cột được chọn, biểu thức SQL, adapter hoặc kiểu thuộc tính tùy biến có giữ đúng kiểu giá trị bên gọi mong đợi không?
- Truy vấn có chọn nhiều cột hoặc dòng hơn bên gọi cần không?

### Xử lý theo lô tập dữ liệu lớn và phân trang endpoint

Dùng `find_each` hoặc `in_batches` cho xử lý nền khối lượng lớn, dùng phân trang ổn định cho endpoint danh sách.

```ruby
Order.where(status: "pending").find_each(batch_size: 1_000) do |order|
  Reconciliation.check(order)
end
```

`find_each` và `in_batches` chia lô theo con trỏ (mặc định là khóa chính) và có thể bỏ qua hoặc thay `ORDER BY` tùy biến của relation. Dùng con trỏ/thứ tự tường minh mà phiên bản Rails hiện tại hỗ trợ, hoặc truy vấn riêng, khi thứ tự nghiệp vụ quan trọng.

Câu hỏi review:
- Truy vấn này có thể tăng không giới hạn không?
- Xử lý theo lô có tương thích với con trỏ, thứ tự và hành vi thay đổi dữ liệu không?
- Phân trang có dùng thứ tự xác định và con trỏ hoặc khóa có index không?

### Review cache cùng việc vô hiệu hóa

Cache có thể giấu N+1 trong khi đưa vào dữ liệu cũ hoặc lẫn tenant. Cache key phải chứa mọi đầu vào làm thay đổi kết quả.

Câu hỏi review:
- Key có gồm tenant, locale, phạm vi phân quyền và phiên bản dữ liệu không?
- Vô hiệu hóa có gắn với các bản ghi ảnh hưởng tới giá trị đã cache không?
- Dữ liệu nhạy cảm có thể bị trả cho người dùng hoặc tenant khác không?

## Transaction và đồng thời

### Giữ transaction chỉ cho trạng thái CSDL

Transaction CSDL không rollback được lời gọi HTTP, message đã giao cho broker ngoài, file hay thanh toán.

```ruby
# Sai: thanh toán có thể thành công dù transaction CSDL rollback.
Order.transaction do
  gateway.charge(order.total_cents)
  order.update!(status: "paid")
end

# Tốt hơn: cấu hình job chỉ enqueue sau commit, rồi lưu
# chuyển trạng thái tường minh và đối soát thao tác ngoài idempotent.
class PaymentJob < ApplicationJob
  self.enqueue_after_transaction_commit = true
end

Order.transaction do
  order.update!(status: "payment_pending")
  PaymentJob.perform_later(order)
end
```

Không dựa vào giá trị mặc định enqueue phụ thuộc phiên bản. Ứng dụng Rails 8.0/8.1 và adapter queue có thể enqueue ngay tùy `config.load_defaults` và cấu trúc triển khai. Rails mới hơn có thể hoãn thường xuyên hơn, nhưng job phải tự khai báo hành vi cần có. Nếu bản thân việc enqueue phải bền vững cùng thay đổi trạng thái, dùng outbox hoặc đường đối soát.

Câu hỏi review:
- Side effect nào thật sự nằm trong transaction?
- Đúng class job đó có khai báo enqueue sau commit, thay vì dựa vào mặc định của adapter hay phiên bản Rails không?
- Timeout có thể nghĩa là "thất bại" hay "thành công nhưng mất response"?
- Có đường phục hồi hoặc đối soát cho trường hợp hoàn thành một phần không?

### Không nuốt lỗi CSDL trong transaction đã hỏng

Một số adapter, đặc biệt PostgreSQL, để transaction không dùng được sau lỗi câu lệnh cho tới khi rollback. Bắt lỗi ràng buộc dự kiến bên ngoài ranh giới transaction hoặc chạy lại toàn bộ transaction có chủ ý.

Câu hỏi review:
- Có rescue `ActiveRecord::StatementInvalid` trong transaction rồi chạy thêm SQL không?
- Retry có giới hạn ở xung đột tạm thời đã biết như deadlock hoặc serialization failure không?
- Retry có lặp lại side effect bên ngoài không?

### Lock bất biến, không chỉ lock đoạn code

Lock trong tiến trình Ruby không bảo vệ dữ liệu giữa nhiều tiến trình hoặc máy. Dùng unique constraint, cập nhật nguyên tử, optimistic locking hoặc row lock cho bất biến CSDL dùng chung.

```ruby
order.with_lock do
  return if order.paid?

  order.update!(status: "payment_pending")
end
```

Câu hỏi review:
- Hai request có thể cùng thấy trạng thái cũ và cùng chạy tiếp không?
- Cập nhật có điều kiện nguyên tử hoặc unique index có đơn giản hơn lock không?
- Thứ tự lấy lock có nhất quán để tránh deadlock không?

### Chọn optimistic hay pessimistic locking có chủ ý

Dùng optimistic locking cho chỉnh sửa thông thường khi xung đột hiếm và bên gọi có thể nạp lại hoặc giải quyết xung đột. Dùng pessimistic lock ngắn như `with_lock` cho chuyển trạng thái quan trọng nhỏ cần truy cập tuần tự.

```ruby
# Migration: Rails tăng cột này và từ chối cập nhật đã cũ.
add_column :orders, :lock_version, :integer, default: 0, null: false

begin
  order.update!(shipping_address: new_address)
rescue ActiveRecord::StaleObjectError
  # Nạp lại, trả response xung đột, hoặc yêu cầu người dùng hợp nhất thay đổi.
end
```

Câu hỏi review:
- Chỉnh sửa ít tranh chấp của người dùng có thể dùng `lock_version` và response xung đột thay vì giữ row lock không?
- Pessimistic locking có chỉ bao phần chuyển trạng thái tối thiểu và giữ thứ tự lock nhất quán không?

### Coi trạng thái toàn cục thay đổi được là trạng thái đồng thời

Class variable, class instance variable, hằng chứa object thay đổi được, memoization và client singleton có thể bị các thread request dùng chung.

Câu hỏi review:
- Lazy initialization có thread-safe và an toàn khi reload code không?
- Dữ liệu riêng của request có bị lưu vào biến toàn cục, class variable hoặc thread local sống lâu không?
- Client dùng chung có được thư viện ghi rõ là thread-safe không?

## Active Job và side effect bên ngoài

### Làm job bị retry trở thành idempotent

Job có thể bị retry khi Active Job hoặc queue backend cấu hình như vậy. Tiến trình cũng có thể dừng sau khi side effect bên ngoài thành công nhưng trước khi cập nhật trạng thái cục bộ.

```ruby
class CapturePaymentJob < ApplicationJob
  self.enqueue_after_transaction_commit = true
  retry_on PaymentGateway::Timeout, wait: :polynomially_longer, attempts: 5

  def perform(order)
    order.with_lock do
      return if order.paid?
      order.update!(status: "payment_processing")
    end

    result = PaymentGateway.capture(
      amount: order.total_cents,
      idempotency_key: "order-#{order.id}-capture"
    )

    order.update!(status: "paid", payment_reference: result.reference)
  end
end
```

Idempotency key của gateway, trạng thái đã lưu và quy trình đối soát phải phối hợp với nhau. Chỉ một cờ trong CSDL không chứng minh được khoản trừ tiền bên ngoài chưa xảy ra.

Câu hỏi review:
- Chuyện gì xảy ra nếu worker dừng sau side effect nhưng trước lần cập nhật cuối?
- Idempotency key có ổn định qua các lần retry nhưng duy nhất cho đúng thao tác dự định không?
- Lỗi retry được và lỗi vĩnh viễn có được xử lý khác nhau không?
- Trạng thái nào là kết thúc, retry được hoặc phục hồi được, và trạng thái `payment_processing` bị kẹt hiện ra để đối soát bằng cách nào?

### Hiểu tham số GlobalID

Active Job có thể serialize object Active Record bằng GlobalID. Job nạp bản ghi lúc chạy, không phải lúc enqueue. Nếu bản ghi đã bị xóa, deserialize ném `ActiveJob::DeserializationError` trước khi `perform` chạy.

Khi bản ghi vắng mặt là tình huống nghiệp vụ dự kiến, truyền ID và xử lý hẹp `ActiveRecord::RecordNotFound` bên trong job. Không dùng `discard_on ActiveJob::DeserializationError` toàn bộ trừ khi mọi lỗi deserialize đều chủ ý bỏ được, vì cấu hình đó còn có thể giấu lỗi serializer hoặc lỗi triển khai.

Câu hỏi review:
- Job có chủ ý dùng trạng thái bản ghi hiện tại thay vì snapshot không?
- Chuyện gì xảy ra khi bản ghi bị xóa hoặc không còn đủ điều kiện?
- `discard_on ActiveJob::DeserializationError` có làm mất việc lẽ ra cần điều tra không?

### Enqueue có chủ ý theo ranh giới transaction

Job chạy trước khi bản ghi mà job dùng commit thì có thể không tìm thấy bản ghi. Rails hỗ trợ enqueue sau commit, nhưng bảo đảm transaction phụ thuộc thiết lập cụ thể của job, adapter queue, load defaults của Rails và cấu trúc CSDL.

Câu hỏi review:
- Worker có thể chạy trước khi transaction tạo bản ghi commit không?
- Code có vô tình dựa vào việc bảng job nằm chung CSDL ứng dụng không?
- Nếu enqueue thất bại sau khi dữ liệu đã commit, có outbox, retry hoặc đường đối soát không?

### Đặt timeout và khả năng quan sát quanh việc mạng

Mọi lời gọi ra ngoài cần timeout connect/read/write có giới hạn, báo lỗi có cấu trúc và đủ định danh để lần theo một lần retry mà không ghi bí mật vào log.

Câu hỏi review:
- Timeout có được khai báo tường minh trong cấu hình client không?
- Độ trễ queue, số lần thử, request ID bên ngoài và kết quả cuối có quan sát được không?
- Job chạy lâu có được chia thành các đơn vị tiếp tục được hoặc có checkpoint khi phù hợp không?

## Test và công cụ

### Test hành vi ở đúng ranh giới

Dùng model test cho quy tắc domain, request/system test cho hành vi controller, job test cho ranh giới serialize, retry và side effect. Tránh test chỉ khẳng định callback hoặc method private đã được gọi.

Trường hợp cần ưu tiên test:
- tham số chưa permit không cập nhật được thuộc tính được bảo vệ;
- đầu vào sort/filter không an toàn không đổi được cấu trúc SQL;
- phân quyền giới hạn phạm vi bản ghi trước khi tra cứu;
- serializer không lộ cột nhạy cảm;
- hồi quy N+1 làm test thất bại qua assertion đếm truy vấn hoặc strict loading;
- job an toàn khi chạy hai lần;
- bản ghi GlobalID đã xóa và lỗi gateway vĩnh viễn được xử lý có chủ ý;
- timeout sau khi side effect bên ngoài thành công được đối soát mà không trùng lặp.

### Giữ test thời gian và bất đồng bộ xác định

Dùng time helper của Rails thay vì sleep thật. Chạy job qua test adapter hoặc integration test riêng cho backend, khẳng định cả hành vi enqueue và hành vi khi chạy ở những chỗ mỗi thứ quan trọng.

```ruby
travel_to(Time.zone.local(2026, 7, 14, 10, 0, 0)) do
  assert_enqueued_with(job: ExpireOrderJob, at: 30.minutes.from_now) do
    order.schedule_expiration!
  end
end
```

Câu hỏi review:
- Test có phụ thuộc thời gian thực, thứ tự toàn cục hoặc dữ liệu tạo trước đó không?
- Dịch vụ ngoài có được thay ở ranh giới adapter rõ ràng không?
- Test song song có dùng chung hằng thay đổi được, file, port hoặc trạng thái không nằm trong transaction không?

### Chạy đúng các kiểm tra dự án đã cấu hình

Lệnh thường gặp:

```bash
bundle exec ruby -wc path/to/file.rb
bundle exec rubocop
bundle exec brakeman -q
bundle exec rails test
bundle exec rspec
```

Chỉ chạy công cụ có trong repo, xem cấu hình công cụ trước khi coi ngưỡng style hoặc độ phức tạp là quy tắc chung. Phát hiện bảo mật của Brakeman và công cụ quét phụ thuộc cần người xác minh, không tắt mù quáng.

## Tài liệu chính thức

- [Ruby Releases](https://www.ruby-lang.org/en/downloads/releases/)
- [Ruby Syntax: Methods and Arguments](https://ruby-doc.org/3.4/syntax/methods_rdoc.html)
- [Ruby Syntax: Exceptions](https://ruby-doc.org/3.4/syntax/exceptions_rdoc.html)
- [Rails Action Controller Overview](https://guides.rubyonrails.org/action_controller_overview.html)
- [Rails Active Record Query Interface](https://guides.rubyonrails.org/active_record_querying.html)
- [Rails Active Record Transactions](https://api.rubyonrails.org/classes/ActiveRecord/Transactions/ClassMethods.html)
- [Rails Active Job Basics](https://guides.rubyonrails.org/active_job_basics.html)
- [Securing Rails Applications](https://guides.rubyonrails.org/security.html)
- [Testing Rails Applications](https://guides.rubyonrails.org/testing.html)
- [RuboCop Documentation](https://docs.rubocop.org/rubocop/)
- [RuboCop Rails Documentation](https://docs.rubocop.org/rubocop-rails/)
- [Brakeman](https://brakemanscanner.org/)

## Checklist

### Ngữ nghĩa Ruby

- [ ] Điều kiện tính tới truthiness của Ruby (`0`, `""` và `[]` là truthy).
- [ ] Contract so sánh bằng và `hash` nhất quán.
- [ ] Keyword argument và chuyển tiếp giữ đúng contract API.
- [ ] Tra cứu method hoặc hằng động có allowlist.
- [ ] Giá trị mặc định Hash/Array thay đổi được, hằng và trạng thái class không bị dùng chung vô tình.
- [ ] Dữ liệu không tin cậy không bao giờ tới deserialize không an toàn hoặc lệnh shell nội suy.
- [ ] Hiểu ngữ nghĩa giá trị trả về của method bang và safe navigation.

### Exception và tài nguyên

- [ ] Mệnh đề rescue xử lý lỗi dự kiến cụ thể ở ranh giới hẹp.
- [ ] Lỗi bất ngờ giữ cause và backtrace.
- [ ] Response cho client không lộ thông điệp exception nội bộ.
- [ ] Log gồm ngữ cảnh có cấu trúc an toàn và object exception.
- [ ] Tài nguyên và lock được giải phóng trên mọi nhánh thực thi.
- [ ] Retry có giới hạn và không lặp lại việc không idempotent.

### Controller và bảo mật

- [ ] Strong parameters dùng allowlist chính xác, không `permit!` hay chuyển hash không an toàn.
- [ ] Mảng resource lồng nhau dùng `params.expect(...: [[...]])` đúng hình dạng.
- [ ] Giá trị SQL được tham số hóa, định danh động có allowlist.
- [ ] Có đủ xác thực, phân quyền và giới hạn phạm vi bản ghi.
- [ ] `Model.find(params[:id])` không giới hạn phạm vi không bỏ qua được kiểm tra sở hữu hoặc policy.
- [ ] Request ghi bị retry dùng idempotency key có phạm vi và tính duy nhất trong CSDL khi cần.
- [ ] Trường serialize tường minh và loại dữ liệu nhạy cảm.
- [ ] Redirect, thao tác bỏ qua escape HTML, file và header không tin đầu vào người dùng, không cho open redirect.
- [ ] Request trình duyệt thay đổi trạng thái có chống CSRF, cookie session có thiết lập `secure`, `httponly`, `same_site` có chủ ý.
- [ ] Upload Active Storage và fetch URL phía server kiểm tra quyền sở hữu, nội dung và ranh giới SSRF.

### Active Record

- [ ] Validation model quan trọng có ràng buộc và index CSDL đi kèm.
- [ ] API hàng loạt tính tới việc bỏ qua callback, validation và timestamp có chủ ý.
- [ ] Ghi hàng loạt không lặng lẽ làm lệch counter cache, việc sửa và đối soát tường minh.
- [ ] Callback nhỏ, không giấu điều phối hay side effect mạng.
- [ ] Ánh xạ enum giữ nguyên giá trị đã lưu.
- [ ] Scope luôn là relation và ghép được với mọi đầu vào.
- [ ] Bất biến đồng thời dùng ràng buộc, cập nhật nguyên tử, optimistic locking hoặc lock CSDL ngắn.

### Truy vấn và hiệu năng

- [ ] Truy cập association trong vòng lặp được preload hoặc có lý do rõ ràng.
- [ ] `includes`, `preload` hoặc `eager_load` khớp ngữ nghĩa truy vấn.
- [ ] Join collection không nhân bản dòng cha hay đổi số dòng mà không ai biết.
- [ ] Lọc, sắp xếp, tổng hợp và kiểm tra tồn tại nằm trong CSDL.
- [ ] Tập dữ liệu lớn xử lý theo lô, endpoint danh sách phân trang với thứ tự ổn định.
- [ ] Mẫu filter/join/order mới có index hỗ trợ.
- [ ] Cache key gồm tenant, phân quyền, locale và phiên bản dữ liệu khi cần.

### Job và dịch vụ ngoài

- [ ] Job an toàn khi retry, giao trùng và worker bị ngắt.
- [ ] Thao tác bên ngoài dùng idempotency key ổn định khi được hỗ trợ.
- [ ] Ngữ nghĩa xóa GlobalID và trạng thái cũ/hiện tại có chủ ý, vắng mặt dự kiến được xử lý hẹp.
- [ ] Thời điểm enqueue khai báo trên job, không vô tình dựa vào cấu trúc queue/CSDL hay mặc định phiên bản.
- [ ] Hoàn thành một phần có đối soát, bù trừ hoặc outbox.
- [ ] Trạng thái kết thúc, retry được và đang xử lý bị kẹt quan sát được và phục hồi được.
- [ ] Lời gọi mạng có timeout, khả năng quan sát và log không lộ bí mật.

### Test và tự động hóa

- [ ] Request test phủ lọc tham số, phân quyền, status code và trường response.
- [ ] Test đếm truy vấn hoặc strict loading bảo vệ luồng xử lý nhạy về hiệu năng.
- [ ] Job test phủ retry, chạy trùng, bản ghi bị xóa và thất bại một phần.
- [ ] Test phụ thuộc thời gian dùng time helper xác định của Rails.
- [ ] Các kiểm tra Ruby, Rails, lint, test và bảo mật đã cấu hình trong repo đều qua.

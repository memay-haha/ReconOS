# Xử lý lỗi

Dùng khi review code bắt, ném, bọc, ghi log lỗi ở bất kỳ ngôn ngữ nào. File gồm nguyên tắc cốt lõi, anti-pattern, thiết kế phân tầng lỗi, cách ghi log và ví dụ theo ngôn ngữ.

## Nguyên tắc cốt lõi

### Nguyên tắc 1: Không nuốt lỗi

Xử lý mọi lỗi: truyền lên, ghi log, hoặc đổi thành lỗi có nghĩa hơn. **Không bao giờ** im lặng bỏ qua.

```text
// Pseudocode
result = risky_operation()
if error:
    // bắt buộc làm một trong các việc:
    //   1. trả error cho nơi gọi (truyền lên)
    //   2. ghi log rồi trả giá trị dự phòng (hạ cấp)
    //   3. panic/crash (khi không khôi phục được)
```

### Nguyên tắc 2: Thêm ngữ cảnh

Thông điệp lỗi phải có **mô tả thao tác** và **tham số then chốt**, để người debug định vị được lỗi mà không cần đọc stack trace.

```text
// ❌ Không có ngữ cảnh
"failed"

// ✅ Có ngữ cảnh
"failed to process order #12345: payment gateway timeout after 30s"
```

### Nguyên tắc 3: Dùng kiểu lỗi cụ thể

Phân biệt nguyên nhân thất bại bằng kiểu lỗi để nơi gọi xử lý chính xác từng trường hợp.

```text
// ❌ Lỗi chung chung
throw new Error("something went wrong")

// ✅ Kiểu cụ thể
throw new OrderNotFoundError(orderId)
throw new PaymentTimeoutException(gatewayName, timeoutMs)
```

### Nguyên tắc 4: Fail fast

Kiểm tra điều kiện tiên quyết trước khi bắt đầu thao tác, thất bại sớm. Cách này tránh trạng thái không nhất quán do chạy được một nửa mới phát hiện lỗi.

```python
# ❌ Chạy được một nửa mới thấy tham số sai
def process(data, config):
    result = expensive_computation(data)  # đã tốn 5 giây
    if not config.valid:
        raise ValueError("invalid config")  # 5 giây phí công

# ✅ Kiểm tra trước
def process(data, config):
    if not config.valid:
        raise ValueError("invalid config")
    result = expensive_computation(data)
```

### Nguyên tắc 5: Chỉ xử lý lỗi một lần

Không xử lý cùng một lỗi ở mọi tầng (vừa ghi log, vừa trả về, vừa bọc lỗi). Chọn một hướng xử lý, để nơi gọi quyết định.

```text
// ❌ Vừa ghi log vừa trả về (xử lý lặp)
if err:
    log.error("failed: %s", err)
    return err

// ✅ Chỉ bọc lỗi rồi trả về, tầng trên cùng xử lý tập trung
if err:
    return wrap_error("operation failed", err)
```

## Anti-pattern

### Anti-pattern 1: Khối catch rỗng

```python
# ❌ Python: except trống nuốt mọi exception (kể cả KeyboardInterrupt)
try:
    result = risky()
except:
    pass
```

```java
// ❌ Java: catch rỗng nuốt exception
try {
    result = risky();
} catch (Exception e) {
    // không làm gì
}
```

```go
// ❌ Go: bỏ qua error
result, _ := risky()
```

```rust
// ❌ Rust: unwrap() trong code production
let result = risky().unwrap();  // panic khi lỗi
```

### Anti-pattern 2: Catch quá rộng

```python
# ❌ Bắt mọi exception, không phân biệt được loại thất bại
try:
    result = risky()
except Exception as e:
    logger.error(f"failed: {e}")

# ✅ Bắt exception cụ thể
try:
    result = risky()
except ConnectionError as e:
    logger.warning(f"network issue, retrying: {e}")
    result = retry(risky)
except ValueError as e:
    logger.error(f"bad input: {e}")
    raise
```

### Anti-pattern 3: Mất exception gốc

```python
# ❌ Mất stack trace và thông tin của exception gốc
try:
    result = external_api.call()
except APIError as e:
    raise RuntimeError("API failed")  # mất nguyên nhân

# ✅ Giữ chuỗi exception
try:
    result = external_api.call()
except APIError as e:
    raise RuntimeError("API failed") from e
```

```java
// ❌ Mất exception gốc
catch (IOException e) {
    throw new ServiceException("IO failed");
}

// ✅ Giữ nguyên nhân
catch (IOException e) {
    throw new ServiceException("IO failed", e);
}
```

### Anti-pattern 4: Dùng exception để điều khiển luồng

```python
# ❌ Exception làm luồng điều khiển bình thường (chậm và khó đọc)
try:
    user = users[name]
except KeyError:
    user = create_default_user(name)

# ✅ Kiểm tra tường minh
user = users.get(name) or create_default_user(name)
```

```go
// ❌ Go: dùng panic điều khiển luồng
func getUser(id int) User {
    if id <= 0 {
        panic("invalid id")
    }
}

// ✅ Go: trả error
func getUser(id int) (User, error) {
    if id <= 0 {
        return User{}, fmt.Errorf("invalid user id: %d", id)
    }
}
```

### Anti-pattern 5: Bỏ qua giá trị trả về

```csharp
// ❌ Bỏ qua bool/Result trả về
dict.TryGetValue("key", out var value);
// value có thể là giá trị mặc định, nhưng code vẫn chạy tiếp như thành công

// ✅ Kiểm tra giá trị trả về
if (!dict.TryGetValue("key", out var value))
{
    throw new KeyNotFoundException("key not found");
}
```

## Thiết kế phân tầng lỗi

### Kiến trúc lỗi ba tầng

```text
┌─────────────────────────────────────────────────┐
│ Application Errors (tầng ứng dụng)              │
│   - AppError / ServiceError                     │
│   - Handler toàn cục bắt, trả response dễ hiểu  │
├─────────────────────────────────────────────────┤
│ Module Errors (tầng module)                     │
│   - PaymentError, AuthError, ValidationError    │
│   - Mỗi module nghiệp vụ tự định nghĩa kiểu lỗi │
├─────────────────────────────────────────────────┤
│ Infrastructure Errors (tầng hạ tầng)            │
│   - IOError, NetworkError, DatabaseError        │
│   - Lỗi tầng thấp từ OS, mạng, CSDL             │
└─────────────────────────────────────────────────┘
```

### Quy tắc thiết kế

1. **Lỗi tầng module kế thừa class gốc của tầng ứng dụng** để bắt tập trung.
2. **Lỗi hạ tầng đổi thành lỗi module tại ranh giới module**, không lộ ra tầng trên.
3. **Mỗi kiểu lỗi mang đủ ngữ cảnh** để debug (ID, thời điểm, tên thao tác).

### Ví dụ phân tầng (Python)

```python
class AppError(Exception):
    """Exception gốc của ứng dụng"""

class PaymentError(AppError):
    """Lỗi module thanh toán"""
    def __init__(self, order_id: str, reason: str):
        self.order_id = order_id
        super().__init__(f"payment failed for order {order_id}: {reason}")

class PaymentGatewayTimeout(PaymentError):
    """Cổng thanh toán quá thời gian"""
    def __init__(self, order_id: str, gateway: str, timeout_ms: int):
        self.gateway = gateway
        self.timeout_ms = timeout_ms
        super().__init__(order_id, f"gateway {gateway} timed out after {timeout_ms}ms")
```

### Ví dụ phân tầng (Java)

```java
public class AppException extends RuntimeException {
    private final String errorCode;
    public AppException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }
}

public class OrderNotFoundException extends AppException {
    public OrderNotFoundException(Long orderId) {
        super("ORDER_NOT_FOUND", "Order " + orderId + " not found", null);
    }
}
```

## Ghi log

### Chọn mức log

| Mức | Khi nào dùng | Ví dụ |
|---|---|---|
| **ERROR** | Sự cố cần người can thiệp | Thanh toán thất bại, dữ liệu không nhất quán |
| **WARN** | Bất thường tự khôi phục được | Thử lại thành công, chạy chế độ hạ cấp |
| **INFO** | Sự kiện nghiệp vụ bình thường | Tạo đơn hàng, người dùng đăng nhập |
| **DEBUG** | Thông tin debug | Tham số hàm, trạng thái trung gian |

### Định dạng log

```text
// ❌ Không có cấu trúc
log.error("failed to process")

// ✅ Có cấu trúc + ngữ cảnh
log.error("payment_failed", {
    "order_id": "12345",
    "gateway": "stripe",
    "error_code": "card_declined",
    "amount": 99.99,
    "duration_ms": 2340
})
```

### An toàn log

- **Không ghi thông tin nhạy cảm**: mật khẩu, token, PII, số thẻ tín dụng đầy đủ. Vi phạm là P0 🔴 Nghiêm trọng.
- **Che dữ liệu**: `email: a***@example.com`.
- **Chống log injection**: escape dữ liệu người dùng nhập để không giả mạo được dòng log.

## Ví dụ theo ngôn ngữ

### Python

```python
# ✅ Exception cụ thể + ngữ cảnh + chuỗi exception
try:
    response = http_client.post(url, data=payload)
    response.raise_for_status()
except requests.ConnectionError as e:
    raise PaymentGatewayError(f"cannot reach {gateway_name}") from e
except requests.HTTPError as e:
    if response.status_code == 429:
        raise RateLimitError(f"rate limited by {gateway_name}") from e
    raise PaymentGatewayError(f"HTTP {response.status_code} from {gateway_name}") from e
```

### Java

```java
// ✅ Exception cụ thể + ngữ cảnh + chuỗi nguyên nhân
try {
    var response = httpClient.send(request, BodyHandlers.ofString());
    if (response.statusCode() == 404) {
        throw new OrderNotFoundException(orderId);
    }
} catch (IOException e) {
    throw new PaymentGatewayException("gateway unreachable: " + gatewayUrl, e);
}
```

### Go

```go
// ✅ Bọc lỗi + ngữ cảnh + %w giữ chuỗi lỗi
result, err := client.Do(req)
if err != nil {
    return fmt.Errorf("payment gateway %s request failed: %w", gatewayName, err)
}
defer result.Body.Close()

if result.StatusCode == http.StatusNotFound {
    return fmt.Errorf("order %d not found: %w", orderID, ErrNotFound)
}
```

### Rust

```rust
// ✅ thiserror định nghĩa kiểu lỗi + ngữ cảnh
#[derive(Debug, thiserror::Error)]
enum PaymentError {
    #[error("gateway {gateway} unreachable")]
    GatewayUnreachable {
        gateway: String,
        #[source]
        source: reqwest::Error,
    },
    #[error("order {order_id} not found")]
    OrderNotFound { order_id: u64 },
}

async fn process_payment(gateway: &str, order_id: u64) -> Result<(), PaymentError> {
    let response = client.post(url)
        .send()
        .await
        .map_err(|e| PaymentError::GatewayUnreachable { gateway: gateway.into(), source: e })?;
    Ok(())
}
```

### C#

```csharp
// ✅ Exception cụ thể + ngữ cảnh
try
{
    var response = await httpClient.PostAsync(url, content);
    response.EnsureSuccessStatusCode();
}
catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
{
    throw new OrderNotFoundException(orderId, ex);
}
catch (HttpRequestException ex)
{
    throw new PaymentGatewayException($"gateway unreachable: {url}", ex);
}
```

### Swift

```swift
// ✅ Error enum + ngữ cảnh
enum PaymentError: Error {
    case gatewayUnreachable(name: String, underlying: Error)
    case orderNotFound(id: Int)
    case declined(reason: String)
}

func processPayment(orderId: Int) throws -> Receipt {
    guard orderId > 0 else {
        throw PaymentError.orderNotFound(id: orderId)
    }
    do {
        let response = try networkClient.post(url, body: payload)
        return try Receipt(from: response)
    } catch let error as NetworkError {
        throw PaymentError.gatewayUnreachable(name: gateway, underlying: error)
    }
}
```

### TypeScript

```typescript
// ✅ Class lỗi tự định nghĩa + ngữ cảnh
class PaymentError extends Error {
    constructor(
        message: string,
        public readonly orderId: string,
        public readonly gateway: string,
        public readonly cause?: Error,
    ) {
        super(message);
        this.name = 'PaymentError';
    }
}

async function processPayment(orderId: string): Promise<Receipt> {
    try {
        const response = await fetch(url, { method: 'POST', body: payload });
        if (!response.ok) {
            throw new PaymentError(`gateway returned ${response.status}`, orderId, gatewayName);
        }
        return await response.json();
    } catch (err) {
        if (err instanceof TypeError) {
            throw new PaymentError('gateway unreachable', orderId, gatewayName, err);
        }
        throw err;
    }
}
```

## Checklist

### Cốt lõi

- [ ] Không có khối catch rỗng hoặc lỗi bị im lặng bỏ qua
- [ ] Thông điệp lỗi có mô tả thao tác và tham số then chốt
- [ ] Dùng kiểu lỗi cụ thể (không dùng Error/Exception chung chung)
- [ ] Giữ chuỗi exception (`from` / `cause` / `%w`)
- [ ] Kiểm tra điều kiện tiên quyết trước khi bắt đầu thao tác (fail fast)

### Kiến trúc

- [ ] Có phân tầng lỗi rõ ràng (ứng dụng / module / hạ tầng)
- [ ] Có handler toàn cục bắt lỗi chưa xử lý
- [ ] Ranh giới API đổi lỗi nội bộ thành HTTP status code phù hợp

### Log

- [ ] Log lỗi có ngữ cảnh dạng có cấu trúc
- [ ] Không ghi thông tin nhạy cảm (mật khẩu, token, PII)
- [ ] Dùng đúng mức log (ERROR, WARN, INFO)

### Theo ngôn ngữ

- [ ] Go: không bỏ qua error, bọc bằng `%w`
- [ ] Python: bắt exception cụ thể, dùng `from` giữ chuỗi
- [ ] Java: exception có cause, dùng kiểu cụ thể
- [ ] Rust: truyền lỗi bằng `?`, kiểu Error tự định nghĩa
- [ ] C#: filter `when`, kiểu exception cụ thể
- [ ] Swift: do-catch, dùng Result khi xử lý trễ

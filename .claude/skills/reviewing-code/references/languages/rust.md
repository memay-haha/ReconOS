# Rust

Dùng khi review code Rust. Trình biên dịch đã bắt lỗi an toàn bộ nhớ, nên người review tập trung vào phần trình biên dịch không phát hiện được: logic nghiệp vụ, thiết kế API, hiệu năng, an toàn khi hủy (cancel safety) và khả năng bảo trì.

## Ownership và borrowing

### Tránh `clone()` không cần thiết

```rust
// ❌ clone() là "băng keo của Rust", dùng để lách borrow checker
fn bad_process(data: &Data) -> Result<()> {
    let owned = data.clone();  // Vì sao cần clone?
    expensive_operation(owned)
}

// ✅ Khi review, hỏi: clone có cần không? Mượn được không?
fn good_process(data: &Data) -> Result<()> {
    expensive_operation(data)  // truyền tham chiếu
}

// ✅ Nếu thật sự cần clone, ghi comment giải thích lý do
fn justified_clone(data: &Data) -> Result<()> {
    // Cần clone: data sẽ move vào task được spawn
    let owned = data.clone();
    tokio::spawn(async move {
        process(owned).await
    });
    Ok(())
}
```

### Dùng `Arc<Mutex<T>>`

```rust
// ❌ Arc<Mutex<T>> có thể che giấu trạng thái chia sẻ không cần thiết
struct BadService {
    cache: Arc<Mutex<HashMap<String, Data>>>,  // Có thật cần chia sẻ?
}

// ✅ Cân nhắc có cần chia sẻ không, hoặc thiết kế để tránh
struct GoodService {
    cache: HashMap<String, Data>,  // một chủ sở hữu
}

// ✅ Nếu thật sự cần truy cập đồng thời, chọn cấu trúc dữ liệu tốt hơn
use dashmap::DashMap;

struct ConcurrentService {
    cache: DashMap<String, Data>,  // lock chi tiết hơn
}
```

### Mẫu `Cow` (Copy-on-Write)

```rust
use std::borrow::Cow;

// ❌ Luôn cấp phát chuỗi mới
fn bad_process_name(name: &str) -> String {
    if name.is_empty() {
        "Unknown".to_string()  // cấp phát
    } else {
        name.to_string()  // cấp phát không cần thiết
    }
}

// ✅ Dùng Cow để tránh cấp phát thừa
fn good_process_name(name: &str) -> Cow<'_, str> {
    if name.is_empty() {
        Cow::Borrowed("Unknown")  // chuỗi tĩnh, không cấp phát
    } else {
        Cow::Borrowed(name)  // mượn dữ liệu gốc
    }
}

// ✅ Chỉ cấp phát khi cần sửa
fn normalize_name(name: &str) -> Cow<'_, str> {
    if name.chars().any(|c| c.is_uppercase()) {
        Cow::Owned(name.to_lowercase())  // cần sửa, cấp phát
    } else {
        Cow::Borrowed(name)  // không cần sửa, mượn
    }
}
```

## Review code unsafe (quan trọng nhất)

Thiếu tài liệu an toàn cho `unsafe` là P0 hoặc P1 tùy phạm vi ảnh hưởng.

### Yêu cầu cơ bản

```rust
// ❌ unsafe không có tài liệu an toàn: dấu hiệu đỏ
unsafe fn bad_transmute<T, U>(t: T) -> U {
    std::mem::transmute(t)
}

// ✅ Mỗi unsafe phải giải thích: vì sao an toàn, bất biến nào phải giữ
/// Chuyển `T` thành `U`.
///
/// # Safety
///
/// - `T` và `U` phải cùng kích thước và căn lề
/// - `T` phải là mẫu bit hợp lệ của `U`
/// - Bên gọi bảo đảm không còn tham chiếu tới `t` sau lời gọi
unsafe fn documented_transmute<T, U>(t: T) -> U {
    // SAFETY: bên gọi bảo đảm kích thước, căn lề khớp và mẫu bit hợp lệ
    std::mem::transmute(t)
}
```

### Comment cho khối unsafe

```rust
// ❌ Khối unsafe không giải thích
fn bad_get_unchecked(slice: &[u8], index: usize) -> u8 {
    unsafe { *slice.get_unchecked(index) }
}

// ✅ Mỗi khối unsafe phải có comment SAFETY
fn good_get_unchecked(slice: &[u8], index: usize) -> u8 {
    debug_assert!(index < slice.len(), "index out of bounds");
    // SAFETY: đã kiểm tra index < slice.len() bằng debug_assert.
    // Ở bản release, bên gọi phải bảo đảm index hợp lệ.
    unsafe { *slice.get_unchecked(index) }
}

// ✅ Bọc unsafe sau một API an toàn
pub fn checked_get(slice: &[u8], index: usize) -> Option<u8> {
    if index < slice.len() {
        // SAFETY: đã kiểm tra ranh giới ở trên
        Some(unsafe { *slice.get_unchecked(index) })
    } else {
        None
    }
}
```

### Mẫu unsafe thường gặp

```rust
// ✅ Biên FFI
extern "C" {
    fn external_function(ptr: *const u8, len: usize) -> i32;
}

pub fn safe_wrapper(data: &[u8]) -> Result<i32, Error> {
    // SAFETY: data.as_ptr() hợp lệ trong data.len() byte,
    // và external_function chỉ đọc buffer.
    let result = unsafe {
        external_function(data.as_ptr(), data.len())
    };
    if result < 0 {
        Err(Error::from_code(result))
    } else {
        Ok(result)
    }
}

// ✅ unsafe trên hot path về hiệu năng
pub fn fast_copy(src: &[u8], dst: &mut [u8]) {
    assert_eq!(src.len(), dst.len(), "slices must be equal length");
    // SAFETY: src và dst là slice hợp lệ cùng độ dài,
    // dst là &mut nên không bị alias.
    unsafe {
        std::ptr::copy_nonoverlapping(
            src.as_ptr(),
            dst.as_mut_ptr(),
            src.len()
        );
    }
}
```

## Code bất đồng bộ

Mẫu đồng thời chung: [concurrency.md](../concurrency.md).

### Tránh thao tác chặn

```rust
// ❌ Chặn trong ngữ cảnh bất đồng bộ: làm đói các task khác
async fn bad_async() {
    let data = std::fs::read_to_string("file.txt").unwrap();  // chặn!
    std::thread::sleep(Duration::from_secs(1));  // chặn!
}

// ✅ Dùng API bất đồng bộ
async fn good_async() -> Result<String> {
    let data = tokio::fs::read_to_string("file.txt").await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(data)
}

// ✅ Nếu buộc phải chặn, dùng spawn_blocking
async fn with_blocking() -> Result<Data> {
    let result = tokio::task::spawn_blocking(|| {
        // ở đây chặn an toàn
        expensive_cpu_computation()
    }).await?;
    Ok(result)
}
```

### Mutex và `.await`

```rust
// ❌ Giữ std::sync::Mutex qua .await: có thể deadlock
async fn bad_lock(mutex: &std::sync::Mutex<Data>) {
    let guard = mutex.lock().unwrap();
    async_operation().await;  // vừa giữ lock vừa chờ!
    process(&guard);
}

// ✅ Cách 1: thu nhỏ phạm vi lock
async fn good_lock_scoped(mutex: &std::sync::Mutex<Data>) {
    let data = {
        let guard = mutex.lock().unwrap();
        guard.clone()  // nhả lock ngay
    };
    async_operation().await;
    process(&data);
}

// ✅ Cách 2: dùng tokio::sync::Mutex (giữ qua await được)
async fn good_lock_tokio(mutex: &tokio::sync::Mutex<Data>) {
    let guard = mutex.lock().await;
    async_operation().await;  // OK: tokio Mutex thiết kế để giữ qua await
    process(&guard);
}

// 💡 Chọn loại nào:
// - std::sync::Mutex: tranh chấp thấp, critical section ngắn, không giữ qua await
// - tokio::sync::Mutex: cần giữ qua await, tranh chấp cao
```

### Method async trong trait

```rust
// ❌ Bẫy của async trait (phiên bản cũ)
#[async_trait]
trait BadRepository {
    async fn find(&self, id: i64) -> Option<Entity>;  // Box ngầm
}

// ✅ Rust 1.75+: async trait gốc
trait Repository {
    async fn find(&self, id: i64) -> Option<Entity>;

    // Trả kiểu Future cụ thể để tránh cấp phát
    fn find_many(&self, ids: &[i64]) -> impl Future<Output = Vec<Entity>> + Send;
}

// ✅ Khi cần dyn
trait DynRepository: Send + Sync {
    fn find(&self, id: i64) -> Pin<Box<dyn Future<Output = Option<Entity>> + Send + '_>>;
}
```

## An toàn khi hủy (cancel safety)

### Khái niệm

```rust
// Khi một Future bị drop tại điểm .await, Future đó ở trạng thái nào?
// Future an toàn khi hủy: hủy ở bất kỳ điểm await nào cũng an toàn
// Future không an toàn khi hủy: hủy có thể gây mất dữ liệu hoặc trạng thái không nhất quán

// ❌ Ví dụ không an toàn khi hủy
async fn cancel_unsafe(conn: &mut Connection) -> Result<()> {
    let data = receive_data().await;  // nếu bị hủy ở đây...
    conn.send_ack().await;  // ...ack không bao giờ gửi, dữ liệu có thể mất
    Ok(())
}

// ✅ Bản an toàn khi hủy
async fn cancel_safe(conn: &mut Connection) -> Result<()> {
    // Dùng transaction hoặc thao tác nguyên tử để giữ nhất quán
    let transaction = conn.begin_transaction().await?;
    let data = receive_data().await;
    transaction.commit_with_ack(data).await?;  // thao tác nguyên tử
    Ok(())
}
```

### Cancel safety trong `select!`

```rust
use tokio::select;

// ❌ Dùng Future không an toàn khi hủy trong select!
async fn bad_select(stream: &mut TcpStream) {
    let mut buffer = vec![0u8; 1024];
    loop {
        select! {
            // read_exact không an toàn khi hủy: khi timeout xong trước,
            // phần byte đã đọc vào buffer mất theo Future
            result = stream.read_exact(&mut buffer) => {
                result?;
                handle_data(&buffer);
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                println!("Timeout");
            }
        }
    }
}

// ✅ Dùng API an toàn khi hủy
async fn good_select(stream: &mut TcpStream) {
    let mut buffer = vec![0u8; 1024];
    loop {
        select! {
            // read an toàn khi hủy: dữ liệu chưa đọc vẫn nằm trong stream.
            // Nếu thật sự cần đọc đủ độ dài cố định, đưa read_exact sang task riêng
            // và select! trên JoinHandle của task đó, hủy không mất byte
            result = stream.read(&mut buffer) => {
                match result {
                    Ok(0) => break,  // EOF
                    Ok(n) => handle_data(&buffer[..n]),
                    Err(e) => return Err(e),
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                println!("Timeout, retrying...");
            }
        }
    }
}

// ✅ Dùng tokio::pin! để dùng lại Future an toàn
async fn pinned_select() {
    let sleep = tokio::time::sleep(Duration::from_secs(10));
    tokio::pin!(sleep);

    loop {
        select! {
            _ = &mut sleep => {
                println!("Timer elapsed");
                break;
            }
            data = receive_data() => {
                process(data).await;
                // sleep tiếp tục đếm ngược, không reset
            }
        }
    }
}
```

### Ghi tài liệu về cancel safety

```rust
/// Đọc trọn một message từ stream.
///
/// # Cancel Safety
///
/// Hàm này **không** an toàn khi hủy. Nếu bị hủy khi đang đọc,
/// dữ liệu đọc dở có thể mất và trạng thái stream không xác định.
/// Dùng `read_message_cancel_safe` nếu có khả năng bị hủy.
async fn read_message(stream: &mut TcpStream) -> Result<Message> {
    let len = stream.read_u32().await?;
    let mut buffer = vec![0u8; len as usize];
    stream.read_exact(&mut buffer).await?;
    Ok(Message::from_bytes(&buffer))
}

/// Đọc message, an toàn khi hủy.
///
/// # Cancel Safety
///
/// Hàm này an toàn khi hủy. Nếu bị hủy, dữ liệu đọc dở
/// giữ trong buffer nội bộ cho lần gọi sau.
async fn read_message_cancel_safe(reader: &mut BufferedReader) -> Result<Message> {
    reader.read_message_buffered().await
}
```

## spawn hay await

### Khi nào dùng spawn

```rust
// ❌ spawn thừa: tốn chi phí, mất tính structured concurrency
async fn bad_unnecessary_spawn() {
    let handle = tokio::spawn(async {
        simple_operation().await
    });
    handle.await.unwrap();  // Sao không await thẳng?
}

// ✅ await thẳng thao tác đơn giản
async fn good_direct_await() {
    simple_operation().await;
}

// ✅ spawn cho việc chạy song song thật sự
async fn good_parallel_spawn() {
    let task1 = tokio::spawn(fetch_from_service_a());
    let task2 = tokio::spawn(fetch_from_service_b());

    // hai request chạy song song
    let (result1, result2) = tokio::try_join!(task1, task2)?;
}

// ✅ spawn cho task nền (fire-and-forget)
async fn good_background_spawn() {
    // khởi động task nền, không chờ xong
    tokio::spawn(async {
        cleanup_old_sessions().await;
        log_metrics().await;
    });

    // làm tiếp việc khác
    handle_request().await;
}
```

### Yêu cầu `'static` của spawn

```rust
// ❌ Future truyền vào spawn phải là 'static
async fn bad_spawn_borrow(data: &Data) {
    tokio::spawn(async {
        process(data).await;  // Lỗi: `data` không phải 'static
    });
}

// ✅ Cách 1: clone dữ liệu
async fn good_spawn_clone(data: &Data) {
    let owned = data.clone();
    tokio::spawn(async move {
        process(&owned).await;
    });
}

// ✅ Cách 2: chia sẻ bằng Arc
async fn good_spawn_arc(data: Arc<Data>) {
    let data = Arc::clone(&data);
    tokio::spawn(async move {
        process(&data).await;
    });
}

// ✅ Cách 3: task có phạm vi (tokio-scoped hoặc async-scoped)
async fn good_scoped_spawn(data: &Data) {
    // giả sử dùng crate async-scoped
    async_scoped::scope(|s| async {
        s.spawn(async {
            process(data).await;  // mượn được
        });
    }).await;
}
```

### Xử lý lỗi `JoinHandle`

```rust
// ❌ Bỏ qua lỗi của spawn
async fn bad_ignore_spawn_error() {
    let handle = tokio::spawn(async {
        risky_operation().await
    });
    let _ = handle.await;  // bỏ qua cả panic lẫn lỗi
}

// ✅ Xử lý đủ kết quả JoinHandle
async fn good_handle_spawn_error() -> Result<()> {
    let handle = tokio::spawn(async {
        risky_operation().await
    });

    match handle.await {
        Ok(Ok(result)) => {
            // task xong thành công
            process_result(result);
            Ok(())
        }
        Ok(Err(e)) => {
            // lỗi bên trong task
            Err(e.into())
        }
        Err(join_err) => {
            // task panic hoặc bị hủy
            if join_err.is_panic() {
                error!("Task panicked: {:?}", join_err);
            }
            Err(anyhow!("Task failed: {}", join_err))
        }
    }
}
```

### Structured concurrency hay spawn

```rust
// ✅ Ưu tiên join! (structured concurrency)
async fn structured_concurrency() -> Result<(A, B, C)> {
    // mọi task cùng một phạm vi;
    // một task lỗi thì các task khác bị hủy
    tokio::try_join!(
        fetch_a(),
        fetch_b(),
        fetch_c()
    )
}

// ✅ Khi dùng spawn, tính tới vòng đời task
struct TaskManager {
    handles: Vec<JoinHandle<()>>,
}

impl TaskManager {
    async fn shutdown(self) {
        // graceful shutdown: chờ mọi task xong
        for handle in self.handles {
            if let Err(e) = handle.await {
                error!("Task failed during shutdown: {}", e);
            }
        }
    }

    async fn abort_all(self) {
        // tắt cưỡng bức: hủy mọi task
        for handle in self.handles {
            handle.abort();
        }
    }
}
```

## Xử lý lỗi

Nguyên tắc chung: [error-handling.md](../error-handling.md).

### Kiểu lỗi cho thư viện và cho ứng dụng

```rust
// ❌ Thư viện dùng anyhow: bên gọi không match được lỗi
pub fn parse_config(s: &str) -> anyhow::Result<Config> { ... }

// ✅ Thư viện dùng thiserror, ứng dụng dùng anyhow
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("invalid syntax at line {line}: {message}")]
    Syntax { line: usize, message: String },
    #[error("missing required field: {0}")]
    MissingField(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub fn parse_config(s: &str) -> Result<Config, ConfigError> { ... }
```

### Giữ ngữ cảnh lỗi

```rust
// ❌ Nuốt ngữ cảnh lỗi
fn bad_error() -> Result<()> {
    operation().map_err(|_| anyhow!("failed"))?;  // mất lỗi gốc
    Ok(())
}

// ✅ Dùng context để giữ chuỗi lỗi
fn good_error() -> Result<()> {
    operation().context("failed to perform operation")?;
    Ok(())
}

// ✅ Dùng with_context để tính lazy
fn good_error_lazy() -> Result<()> {
    operation()
        .with_context(|| format!("failed to process file: {}", filename))?;
    Ok(())
}
```

### Thiết kế kiểu lỗi

```rust
// ✅ Dùng #[source] để giữ chuỗi lỗi
#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("database error")]
    Database(#[source] sqlx::Error),

    #[error("network error: {message}")]
    Network {
        message: String,
        #[source]
        source: reqwest::Error,
    },

    #[error("validation failed: {0}")]
    Validation(String),
}

// ✅ Cài From cho các chuyển đổi thường gặp
impl From<sqlx::Error> for ServiceError {
    fn from(err: sqlx::Error) -> Self {
        ServiceError::Database(err)
    }
}
```

## Hiệu năng

### Tránh `collect()` thừa

```rust
// ❌ collect thừa: cấp phát trung gian
fn bad_sum(items: &[i32]) -> i32 {
    items.iter()
        .filter(|x| **x > 0)
        .collect::<Vec<_>>()  // không cần!
        .iter()
        .sum()
}

// ✅ Duyệt lazy
fn good_sum(items: &[i32]) -> i32 {
    items.iter().filter(|x| **x > 0).copied().sum()
}
```

### Nối chuỗi

```rust
// ❌ Nối chuỗi trong vòng lặp, cấp phát lại liên tục
fn bad_concat(items: &[&str]) -> String {
    let mut s = String::new();
    for item in items {
        s = s + item;  // mỗi lần đều cấp phát lại!
    }
    s
}

// ✅ Cấp phát trước hoặc dùng join
fn good_concat(items: &[&str]) -> String {
    items.join("")
}

// ✅ Cấp phát trước bằng with_capacity
fn good_concat_capacity(items: &[&str]) -> String {
    let total_len: usize = items.iter().map(|s| s.len()).sum();
    let mut result = String::with_capacity(total_len);
    for item in items {
        result.push_str(item);
    }
    result
}

// ✅ Dùng macro write!
use std::fmt::Write;

fn good_concat_write(items: &[&str]) -> String {
    let mut result = String::new();
    for item in items {
        write!(result, "{}", item).unwrap();
    }
    result
}
```

### Tránh cấp phát thừa

```rust
// ❌ Cấp phát Vec không cần thiết
fn bad_check_any(items: &[Item]) -> bool {
    let filtered: Vec<_> = items.iter()
        .filter(|i| i.is_valid())
        .collect();
    !filtered.is_empty()
}

// ✅ Dùng method iterator
fn good_check_any(items: &[Item]) -> bool {
    items.iter().any(|i| i.is_valid())
}

// ❌ String::from cho chuỗi tĩnh
fn bad_static() -> String {
    String::from("error message")  // cấp phát lúc chạy
}

// ✅ Trả &'static str
fn good_static() -> &'static str {
    "error message"  // không cấp phát
}
```

## Thiết kế trait

### Tránh trừu tượng hóa quá mức

```rust
// ❌ Trừu tượng quá mức: đây không phải Java, không cần interface cho mọi thứ
trait Processor { fn process(&self); }
trait Handler { fn handle(&self); }
trait Manager { fn manage(&self); }  // quá nhiều trait

// ✅ Chỉ tạo trait khi cần đa hình.
// Kiểu cụ thể thường đơn giản và nhanh hơn
struct DataProcessor {
    config: Config,
}

impl DataProcessor {
    fn process(&self, data: &Data) -> Result<Output> {
        // implementation trực tiếp
    }
}
```

### Trait object hay generic

```rust
// ❌ Trait object không cần thiết (dispatch động)
fn bad_process(handler: &dyn Handler) {
    handler.handle();  // gọi qua vtable
}

// ✅ Dùng generic (dispatch tĩnh, inline được)
fn good_process<H: Handler>(handler: &H) {
    handler.handle();  // trình biên dịch inline được
}

// ✅ Trait object hợp lý cho collection không đồng nhất
fn store_handlers(handlers: Vec<Box<dyn Handler>>) {
    // cần lưu nhiều loại handler khác nhau
}

// ✅ Dùng impl Trait cho kiểu trả về
fn create_handler() -> impl Handler {
    ConcreteHandler::new()
}
```

## Checklist

### Lỗi trình biên dịch không bắt được

Tính đúng của logic nghiệp vụ:

- [ ] Xử lý đúng điều kiện biên
- [ ] Chuyển trạng thái của state machine đầy đủ
- [ ] Không có race condition trong tình huống đồng thời

Thiết kế API:

- [ ] API công khai khó dùng sai
- [ ] Chữ ký kiểu thể hiện rõ ý định
- [ ] Độ chi tiết của kiểu lỗi hợp lý

### Ownership và borrowing

- [ ] `clone()` có chủ đích, có ghi lý do
- [ ] `Arc<Mutex<T>>` thật sự cần trạng thái chia sẻ
- [ ] Dùng `RefCell` có lý do chính đáng
- [ ] Lifetime không phức tạp quá mức
- [ ] Đã cân nhắc `Cow` để tránh cấp phát thừa

### Code unsafe (quan trọng nhất)

- [ ] Mỗi khối `unsafe` có comment `SAFETY`
- [ ] `unsafe fn` có mục tài liệu `# Safety`
- [ ] Giải thích vì sao an toàn, không chỉ làm gì
- [ ] Liệt kê bất biến phải giữ
- [ ] Biên `unsafe` nhỏ nhất có thể
- [ ] Đã cân nhắc phương án safe thay thế

### Bất đồng bộ và đồng thời

- [ ] Không chặn trong code bất đồng bộ (`std::fs`, `thread::sleep`)
- [ ] Không giữ lock `std::sync` qua `.await`
- [ ] Task được spawn thỏa `'static`
- [ ] Thứ tự lấy lock nhất quán
- [ ] Kích thước buffer của channel hợp lý

### Cancel safety

- [ ] Future trong `select!` an toàn khi hủy
- [ ] Hàm bất đồng bộ có ghi tài liệu về cancel safety
- [ ] Hủy không gây mất dữ liệu hoặc trạng thái không nhất quán
- [ ] Dùng `tokio::pin!` đúng cho Future cần dùng lại

### spawn hay await

- [ ] Chỉ spawn khi thật sự cần chạy song song
- [ ] Thao tác đơn giản thì await thẳng, không spawn
- [ ] Kết quả `JoinHandle` được xử lý đúng
- [ ] Đã tính vòng đời task và cách tắt
- [ ] Ưu tiên `join!`/`try_join!` cho structured concurrency

### Xử lý lỗi

- [ ] Thư viện: định nghĩa lỗi có cấu trúc bằng `thiserror`
- [ ] Ứng dụng: `anyhow` kèm `context`
- [ ] Không có `unwrap`/`expect` trong code production
- [ ] Thông báo lỗi giúp debug
- [ ] Giá trị trả về `must_use` được xử lý
- [ ] Dùng `#[source]` để giữ chuỗi lỗi

### Hiệu năng

- [ ] Tránh `collect()` thừa
- [ ] Dữ liệu lớn truyền bằng tham chiếu
- [ ] Chuỗi dùng `with_capacity` hoặc `write!`
- [ ] Chọn hợp lý giữa `impl Trait` và `Box<dyn Trait>`
- [ ] Hot path tránh cấp phát
- [ ] Đã cân nhắc `Cow` để giảm clone

### Chất lượng code

- [ ] `cargo clippy` không cảnh báo
- [ ] Đã format bằng `cargo fmt`
- [ ] Doc comment đầy đủ
- [ ] Test phủ điều kiện biên
- [ ] API công khai có ví dụ trong tài liệu

# Bất đồng bộ và đồng thời

Dùng khi review code async/await, goroutine, coroutine, thread, lock, hàng đợi hoặc bất kỳ chỗ nào chạy nhiều tác vụ cùng lúc. File gồm so sánh mô hình đồng thời, bẫy thường gặp, cách làm đúng và ví dụ theo ngôn ngữ.

## So sánh mô hình đồng thời

| Mô hình | Ngôn ngữ | Khái niệm chính | Ưu điểm | Nhược điểm |
|---|---|---|---|---|
| **Goroutines + Channels** | Go | Coroutine nhẹ + giao tiếp kiểu CSP | Cú pháp gọn, chi phí thấp | Phải tự truyền tín hiệu hủy |
| **async/await + Event Loop** | Python, TypeScript | Đa nhiệm hợp tác trên một thread | Không cần lock, dễ suy luận | Không được chặn event loop |
| **async/await + Tokio** | Rust | Futures + runtime lập lịch | Zero-cost abstraction, an toàn lúc biên dịch | Khó học |
| **Coroutines + Flow** | Kotlin | Hàm suspend + structured concurrency | Tự hủy, gắn vòng đời | Chọn Dispatchers phức tạp |
| **async/await + Actors** | Swift | Structured concurrency + cô lập bằng Actor | Kiểm tra data race lúc biên dịch | Chi phí chuyển sang Swift 6 |
| **async/await + TPL** | C# | Task + thread pool | Hệ thư viện trưởng thành, ConfigureAwait | Chuyển thread ngầm |
| **Threads + Mutexes** | C++, Java, mọi ngôn ngữ | Thread OS + bộ nhớ chung | Song song thật | Quản lý lock phức tạp, dễ deadlock |

### Chọn mô hình

```text
Nặng I/O (mạng, CSDL, file):
  → async/await (Python, TS, Rust, Swift, C#)
  → goroutines (Go)
  → coroutines (Kotlin)

Nặng CPU (tính toán, xử lý ảnh):
  → thread pool (Java, C++, C#)
  → multiprocessing (Python)
  → spawn_blocking (Rust tokio)
  → Dispatchers.Default (Kotlin)

Hỗn hợp:
  → async + spawn_blocking (Rust)
  → async + run_in_executor (Python)
  → goroutines + sync.Mutex (Go)
```

## Bẫy thường gặp

### Bẫy 1: Race condition

Nhiều tác vụ đồng thời đọc ghi trạng thái chung, kết quả phụ thuộc thứ tự chạy.

```text
// Pseudocode
counter = 0

task1: counter += 1   // đọc counter=0, ghi counter=1
task2: counter += 1   // đọc counter=0, ghi counter=1
// mong đợi counter=2, thực tế counter=1
```

**Cách sửa**: mutex, thao tác atomic, hoặc gói trạng thái chung vào Actor.

### Bẫy 2: Deadlock

Hai hoặc nhiều tác vụ chờ lock mà bên kia đang giữ.

```text
task1: lock(A); lock(B);  // giữ A, chờ B
task2: lock(B); lock(A);  // giữ B, chờ A
// cả hai chờ mãi
```

**Cách sửa**:

- Lấy lock theo một thứ tự thống nhất
- Lock có timeout (tryLock kèm timeout)
- Tránh lock lồng nhau

### Bẫy 3: Starvation

Tác vụ ưu tiên thấp không bao giờ đến lượt chạy.

```text
// Tác vụ ưu tiên cao đến liên tục, tác vụ ưu tiên thấp xếp hàng mãi
```

**Cách sửa**: lock công bằng (fair lock), hàng đợi ưu tiên, giới hạn số tác vụ đồng thời.

### Bẫy 4: Rò rỉ goroutine / task

Khởi chạy tác vụ đồng thời nhưng không bảo đảm tác vụ kết thúc.

```go
// ❌ Go: rò rỉ goroutine
func process() {
    ch := make(chan int)
    go func() {
        result := <-ch  // không ai gửi thì goroutine chặn mãi
    }()
    // hàm đã trả về nhưng goroutine vẫn chờ
}
```

```python
# ❌ Python: rò rỉ task
async def process():
    task = asyncio.create_task(long_running())
    # hàm đã trả về nhưng task vẫn chạy
```

**Cách sửa**: context/done channel (Go), TaskGroup (Python), structured concurrency (Kotlin/Swift).

### Bẫy 5: Chặn trong ngữ cảnh bất đồng bộ

```python
# ❌ Python: I/O đồng bộ trong hàm async chặn event loop
async def handle():
    result = requests.get(url)  # chặn, cả event loop đứng
    return result

# ✅ Dùng I/O bất đồng bộ
async def handle():
    result = await aiohttp.get(url)  # không chặn
    return result

# ✅ Hoặc đẩy code đồng bộ sang thread pool
async def handle():
    result = await asyncio.to_thread(requests.get, url)
    return result
```

```rust
// ❌ Rust: chặn trong hàm async
async fn handle() {
    let result = std::fs::read_to_string("large.txt");  // chặn runtime tokio
}

// ✅ Dùng spawn_blocking
async fn handle() {
    let result = tokio::task::spawn_blocking(|| {
        std::fs::read_to_string("large.txt")
    }).await?;
}
```

## Cách làm đúng

### 1. Structured concurrency

Gắn vòng đời tác vụ con với scope tạo ra chúng. Hủy tác vụ cha thì tác vụ con tự hủy.

```kotlin
// ✅ Kotlin: coroutineScope bảo đảm mọi coroutine con xong khi scope kết thúc
suspend fun processItems(items: List<Item>) = coroutineScope {
    items.forEach { item ->
        launch { processItem(item) }  // coroutine con
    }
    // scope kết thúc thì chờ mọi coroutine con
}
// processItems bị hủy thì mọi coroutine con tự hủy
```

```swift
// ✅ Swift: async let + TaskGroup
func processItems() async throws {
    async let resultA = fetchA()  // chạy đồng thời
    async let resultB = fetchB()
    let combined = try await (resultA, resultB)  // chờ cả hai
}
```

```python
# ✅ Python 3.11+: TaskGroup
async def process_items():
    async with asyncio.TaskGroup() as tg:
        for item in items:
            tg.create_task(process_item(item))
    # thoát TaskGroup thì chờ mọi task xong
    # một task lỗi thì các task còn lại tự hủy
```

### 2. Truyền tín hiệu hủy

Tín hiệu hủy phải tới được mọi tác vụ con.

```go
// ✅ Go: context truyền tín hiệu hủy
func processAll(ctx context.Context, items []Item) error {
    g, ctx := errgroup.WithContext(ctx)
    for _, item := range items {
        item := item
        g.Go(func() error {
            return processItem(ctx, item)
        })
    }
    return g.Wait()  // một tác vụ lỗi thì context hủy, các tác vụ khác nhận tín hiệu
}
```

```rust
// ✅ Rust: tokio::select! + JoinHandle
async fn process_with_timeout(item: Item) -> Result<Data> {
    tokio::select! {
        result = process(item) => result,
        _ = tokio::time::sleep(Duration::from_secs(30)) => {
            Err(anyhow!("processing timed out"))
        }
    }
}
```

### 3. Backpressure

Khi producer sinh dữ liệu nhanh hơn nhiều so với consumer, giới hạn kích thước hàng đợi để bộ nhớ không phình.

```go
// ✅ Go: channel có buffer tạo backpressure tự nhiên
func process(items <-chan Item) <-chan Result {
    results := make(chan Result, 10)  // buffer 10 kết quả
    go func() {
        for item := range items {
            results <- processItem(item)  // buffer đầy thì chặn
        }
        close(results)
    }()
    return results
}
```

```kotlin
// ✅ Kotlin: Flow có sẵn backpressure
fun itemsFlow(): Flow<Item> = flow {
    for (item in fetchAll()) {
        emit(item)  // collector chưa sẵn sàng thì suspend
    }
}
// Dùng buffer() điều khiển chiến lược buffer
itemsFlow()
    .buffer(capacity = 10, onBufferOverflow = BufferOverflow.SUSPEND)
    .collect { process(it) }
```

### 4. Giới hạn số tác vụ đồng thời

Tránh khởi chạy quá nhiều tác vụ cùng lúc làm cạn tài nguyên.

```python
# ✅ Python: Semaphore giới hạn đồng thời
async def fetch_all(urls: list[str], max_concurrent: int = 10):
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(url: str):
        async with semaphore:
            return await aiohttp.get(url)

    return await asyncio.gather(*[fetch_one(url) for url in urls])
```

```go
// ✅ Go: errgroup + semaphore
func fetchAll(ctx context.Context, urls []string, maxConcurrent int) error {
    g, ctx := errgroup.WithContext(ctx)
    sem := make(chan struct{}, maxConcurrent)

    for _, url := range urls {
        url := url
        g.Go(func() error {
            sem <- struct{}{}        // lấy semaphore
            defer func() { <-sem }() // trả semaphore
            return fetch(ctx, url)
        })
    }
    return g.Wait()
}
```

## Ví dụ theo ngôn ngữ

### Go: Goroutines + Channels + Context

```go
// ✅ Mẫu đầy đủ: hủy qua context + errgroup + giới hạn đồng thời
func processBatch(ctx context.Context, items []Item) ([]Result, error) {
    g, ctx := errgroup.WithContext(ctx)
    results := make([]Result, len(items))
    sem := make(chan struct{}, 10)  // tối đa 10 tác vụ đồng thời

    for i, item := range items {
        i, item := i, item
        g.Go(func() error {
            select {
            case sem <- struct{}{}:
            case <-ctx.Done():
                return ctx.Err()
            }
            defer func() { <-sem }()

            result, err := process(ctx, item)
            if err != nil {
                return fmt.Errorf("item %d: %w", i, err)
            }
            results[i] = result
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return results, nil
}
```

### Python: asyncio + TaskGroup

```python
# ✅ Python 3.11+: structured concurrency + giới hạn đồng thời
import asyncio

async def process_batch(items: list[Item], max_concurrent: int = 10) -> list[Result]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_one(item: Item) -> Result:
        async with semaphore:
            return await process(item)

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(process_one(item)) for item in items]

    return [task.result() for task in tasks]
```

### Rust: tokio + select + spawn_blocking

```rust
// ✅ Giới hạn đồng thời + timeout + cô lập thao tác chặn
use tokio::sync::Semaphore;
use std::sync::Arc;

async fn process_batch(items: Vec<Item>, max_concurrent: usize) -> Result<Vec<Output>> {
    let sem = Arc::new(Semaphore::new(max_concurrent));
    let mut handles = Vec::new();

    for item in items {
        let permit = sem.clone().acquire_owned().await?;
        handles.push(tokio::spawn(async move {
            let _permit = permit;  // drop khi xong
            tokio::select! {
                result = process(item) => result,
                _ = tokio::time::sleep(Duration::from_secs(30)) => Err(anyhow!("timeout")),
            }
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        results.push(handle.await??);
    }
    Ok(results)
}
```

### Kotlin: Coroutines + Flow + Dispatchers

```kotlin
// ✅ Structured concurrency + giới hạn đồng thời + hủy an toàn
suspend fun processBatch(items: List<Item>, maxConcurrent: Int = 10): List<Result> {
    val semaphore = Semaphore(maxConcurrent)
    return coroutineScope {
        items.map { item ->
            async(Dispatchers.IO) {
                semaphore.withPermit { process(item) }
            }
        }.awaitAll()
    }
}

// ✅ Flow: xử lý stream + backpressure
fun itemStream(): Flow<Result> = flow {
    for (item in fetchAllItems()) {
        emit(process(item))
    }
}
    .flowOn(Dispatchers.IO)
    .buffer(capacity = 10)
    .catch { e -> logger.error("stream failed", e) }
```

### Swift: async/await + TaskGroup + Actors

```swift
// ✅ Structured concurrency + cô lập bằng actor
actor ResultCollector {
    private var results: [Result] = []
    func add(_ result: Result) { results.append(result) }
    func all() -> [Result] { results }
}

func processBatch(items: [Item], maxConcurrent: Int = 10) async throws -> [Result] {
    let collector = ResultCollector()

    try await withThrowingTaskGroup(of: Void.self) { group in
        var active = 0
        for item in items {
            if active >= maxConcurrent {
                try await group.next()
                active -= 1
            }
            group.addTask {
                let result = try await process(item)
                await collector.add(result)
            }
            active += 1
        }
    }
    return await collector.all()
}
```

### C#: async/await + SemaphoreSlim + CancellationToken

```csharp
// ✅ Giới hạn đồng thời + hủy + xử lý exception
async Task<List<Result>> ProcessBatchAsync(
    List<Item> items,
    int maxConcurrent = 10,
    CancellationToken ct = default)
{
    using var semaphore = new SemaphoreSlim(maxConcurrent);
    var tasks = items.Select(async item =>
    {
        await semaphore.WaitAsync(ct);
        try
        {
            return await ProcessAsync(item, ct);
        }
        finally
        {
            semaphore.Release();
        }
    });

    var results = await Task.WhenAll(tasks);
    return results.ToList();
}
```

### TypeScript: giới hạn đồng thời bằng worker pool

```typescript
// ✅ Worker pool: số worker cố định cùng lấy việc từ hàng đợi.
//    Gán kết quả theo chỉ số gốc nên thứ tự đầu ra khớp đầu vào.
async function processWithLimit<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    limit: number,
): Promise<R[]> {
    const results: R[] = [];
    let index = 0;

    const workers = Array.from({ length: limit }, async () => {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i]);
        }
    });

    await Promise.all(workers);
    return results;
}
```

## Checklist

Race condition, deadlock, rò rỉ tác vụ và chặn event loop thường là P1 🔴 Cao. Race condition gây mất hoặc hỏng dữ liệu là P0 🔴 Nghiêm trọng.

### Cơ bản

- [ ] Tác vụ đồng thời có cơ chế kết thúc rõ ràng (không rò rỉ)
- [ ] Trạng thái chung có bảo vệ phù hợp (mutex, actor, channel)
- [ ] Không chạy thao tác chặn trong ngữ cảnh bất đồng bộ
- [ ] Tín hiệu hủy truyền tới mọi tác vụ con

### Kiến trúc

- [ ] Dùng structured concurrency (TaskGroup / coroutineScope / errgroup)
- [ ] Số tác vụ đồng thời có giới hạn trên (semaphore / bounded channel)
- [ ] Tác vụ chạy lâu có timeout
- [ ] Có backpressure để bộ nhớ không phình

### Hiệu năng

- [ ] Chia tác vụ đồng thời ở kích thước hợp lý (không quá nhỏ, không quá lớn)
- [ ] Nặng I/O dùng bất đồng bộ, nặng CPU dùng thread hoặc process
- [ ] Thời gian giữ lock ngắn nhất có thể
- [ ] Không có `await` thừa (thao tác chạy song song được lại chạy tuần tự)

### Theo ngôn ngữ

- [ ] Go: truyền context, dùng errgroup, buffer channel hợp lý
- [ ] Python: không chặn event loop, TaskGroup quản lý vòng đời
- [ ] Rust: spawn_blocking cô lập thao tác chặn, select! xử lý timeout
- [ ] Kotlin: coroutineScope cho structured concurrency, chọn Dispatchers đúng
- [ ] Swift: @MainActor bảo vệ UI, actor cô lập trạng thái thay đổi được
- [ ] C#: truyền CancellationToken, ConfigureAwait(false) trong code thư viện
- [ ] TypeScript: Promise.all + giới hạn đồng thời, AbortController để hủy

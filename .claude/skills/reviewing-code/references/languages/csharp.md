# C# / .NET

Dùng khi review code C# / .NET 8. Phạm vi: tính năng C# 12, lập trình bất đồng bộ, hiệu năng EF Core, ASP.NET Core, dependency injection, LINQ.

## Tính năng C# 12

### Primary constructor (kiểu không phải record)

```csharp
// ❌ Constructor truyền thống, nhiều code lặp
public class ProductService
{
    private readonly ProductDbContext _db;
    private readonly ILogger<ProductService> _logger;

    public ProductService(ProductDbContext db, ILogger<ProductService> logger)
    {
        _db = db;
        _logger = logger;
    }
}

// ✅ Primary constructor: dependency injection gọn
public class ProductService(ProductDbContext db, ILogger<ProductService> logger)
{
    public async Task<Product?> GetAsync(int id)
        => await db.Products.FindAsync(id);
}

// ⚠️ Tham số primary constructor không phải property, không được gán lại
// ⚠️ Cần lưu lâu dài thì khai báo field rõ ràng
public class OrderService(OrderDbContext db)
{
    private readonly OrderDbContext _db = db; // capture rõ ràng
}
```

### Collection expression

```csharp
// ❌ Khởi tạo collection kiểu cũ
int[] nums = new int[] { 1, 2, 3 };
List<string> names = new List<string> { "alice", "bob" };

// ✅ Collection expression
int[] nums = [1, 2, 3];
List<string> names = ["alice", "bob"];
Span<char> span = ['a', 'b'];

// ✅ Toán tử spread
int[] merged = [..nums, 4, 5];
```

### Tham số mặc định của lambda

```csharp
// ❌ Viết nhiều lambda thay cho overload
var add = (int a, int b) => a + b;
var addDefault = (int a) => a + 1;

// ✅ Tham số mặc định
var add = (int a, int b = 1) => a + b;
```

## Lập trình bất đồng bộ

Mẫu đồng thời chung và ví dụ ở ngôn ngữ khác: xem [concurrency.md](../concurrency.md).

### Task.Wait() / .Result / async void là anti-pattern nghiêm trọng (P1)

```csharp
// ❌ Task.Wait() / .Result: nguy cơ deadlock (chặn đồng bộ trên thao tác bất đồng bộ)
public ActionResult<Data> Get(int id)
{
    var data = _service.GetDataAsync(id).Result; // deadlock
    return Ok(data);
}

// ❌ async void: không bắt được exception, làm sập tiến trình
public async void HandleEvent()
{
    await _service.ProcessAsync(); // exception làm sập ngay
}

// ✅ async Task: bất đồng bộ xuyên suốt
public async Task<ActionResult<Data>> Get(int id)
{
    var data = await _service.GetDataAsync(id);
    return Ok(data);
}
```

### ConfigureAwait(false) cho code thư viện

```csharp
// ❌ Code thư viện capture SynchronizationContext không cần thiết
public class LibraryService
{
    public async Task<string> GetDataAsync()
    {
        var response = await _httpClient.GetAsync("/api/data");
        return await response.Content.ReadAsStringAsync();
    }
}

// ✅ Code thư viện dùng ConfigureAwait(false) để tránh deadlock
public class LibraryService
{
    public async Task<string> GetDataAsync()
    {
        var response = await _httpClient.GetAsync("/api/data").ConfigureAwait(false);
        return await response.Content.ReadAsStringAsync().ConfigureAwait(false);
    }
}
```

### Truyền CancellationToken

```csharp
// ❌ Bỏ qua CancellationToken
public async Task<List<User>> SearchAsync(string query)
{
    return await _db.Users.Where(u => u.Name.Contains(query)).ToListAsync();
}

// ✅ Truyền CancellationToken suốt chuỗi gọi
public async Task<List<User>> SearchAsync(string query, CancellationToken ct = default)
{
    return await _db.Users
        .Where(u => u.Name.Contains(query))
        .ToListAsync(ct);
}
```

### Giải phóng tài nguyên bất đồng bộ

```csharp
// ❌ Dispose đồng bộ tài nguyên bất đồng bộ
public class DataClient : IDisposable
{
    public void Dispose()
    {
        _httpClient.Dispose(); // có thể bỏ dở request đang chạy
    }
}

// ✅ IAsyncDisposable
public class DataClient : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        await _stream.DisposeAsync();
    }
}

// ✅ Bên gọi dùng await using
await using var client = new DataClient();
```

## Hiệu năng EF Core

### Truy vấn N+1

Nguyên lý chung và cách xử lý ở các ngôn ngữ khác: xem [n-plus-one.md](../n-plus-one.md).

```csharp
// ❌ N+1 kinh điển: mỗi Blog chạy một truy vấn lấy Posts
foreach (var blog in await context.Blogs.ToListAsync())
{
    foreach (var post in blog.Posts) // mỗi vòng lặp truy vấn CSDL
    {
        Console.WriteLine(post.Title);
    }
}

// ✅ Eager loading + projection
await foreach (var blog in context.Blogs
    .Select(b => new { b.Url, b.Posts })
    .AsAsyncEnumerable())
{
    foreach (var post in blog.Posts)
        Console.WriteLine(post.Title);
}
```

### Lấy thừa dữ liệu (không projection)

```csharp
// ❌ Tải mọi cột trong khi chỉ cần Url
var urls = await context.Blogs.ToListAsync();

// ✅ Chỉ chọn field cần dùng (projection)
var urls = await context.Blogs
    .Select(b => b.Url)
    .ToListAsync();
```

### Thiếu phân trang

```csharp
// ❌ Tập kết quả không giới hạn
var posts = await context.Posts
    .Where(p => p.Title.StartsWith("A"))
    .ToListAsync(); // có thể tới hàng triệu bản ghi

// ✅ Giới hạn số kết quả
var posts = await context.Posts
    .Where(p => p.Title.StartsWith("A"))
    .OrderBy(p => p.Id)
    .Skip((page - 1) * pageSize)
    .Take(pageSize)
    .ToListAsync();
```

### Cartesian explosion (JOIN bùng nổ tích Descartes)

```csharp
// ❌ Nhiều Include tạo nhiều dữ liệu trùng
var blogs = await context.Blogs
    .Include(b => b.Posts)
    .Include(b => b.Tags)
    .ToListAsync(); // mỗi dòng lặp lại dữ liệu Blog

// ✅ Tách truy vấn bằng AsSplitQuery
var blogs = await context.Blogs
    .Include(b => b.Posts)
    .Include(b => b.Tags)
    .AsSplitQuery()
    .ToListAsync();
```

### Thiếu AsNoTracking khi chỉ đọc

```csharp
// ❌ Mặc định có tracking: truy vấn chỉ đọc cũng chịu chi phí tracking
var products = await context.Products.ToListAsync();

// ✅ AsNoTracking: bỏ change tracking, nhanh hơn và ít bộ nhớ hơn
var products = await context.Products
    .AsNoTracking()
    .ToListAsync();
```

### Hàm trên cột làm mất index

```csharp
// ✅ Dùng được index (sargable)
var posts1 = await context.Posts
    .Where(p => p.Title.StartsWith("A"))
    .ToListAsync();

// ❌ Không dùng được index: quét toàn bảng
var posts2 = await context.Posts
    .Where(p => p.Title.EndsWith("A"))
    .ToListAsync();

// ❌ Bọc hàm quanh cột: quét toàn bảng
var posts3 = await context.Posts
    .Where(p => p.Title.ToLower() == "foo")
    .ToListAsync();
```

### Truy cập CSDL đồng bộ và bất đồng bộ

```csharp
// ❌ Gọi CSDL đồng bộ: chặn thread
var products = context.Products.ToList();
context.SaveChanges();

// ✅ Gọi CSDL bất đồng bộ
var products = await context.Products.ToListAsync();
await context.SaveChangesAsync();
```

## ASP.NET Core

### Dùng sai HttpClient

```csharp
// ❌ Tạo HttpClient mới cho mỗi request: cạn socket
using var client = new HttpClient();
var response = await client.GetAsync("https://api.example.com/data");

// ✅ Inject qua IHttpClientFactory
public class MyService
{
    private readonly HttpClient _client;
    public MyService(HttpClient client) => _client = client; // inject từ factory
}
```

### Dùng HttpContext trong thread nền

```csharp
// ❌ Capture scoped service trong tác vụ nền: đã bị dispose khi request kết thúc
_ = Task.Run(async () =>
{
    await context.SaveChangesAsync(); // ObjectDisposedException
});

// ✅ Tạo scope mới
_ = Task.Run(async () =>
{
    await using var scope = serviceScopeFactory.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.SaveChangesAsync();
});
```

### Đọc Request.Form đồng bộ

```csharp
// ❌ Đọc Form đồng bộ: sync over async
var form = HttpContext.Request.Form;

// ✅ Đọc bất đồng bộ
var form = await HttpContext.Request.ReadFormAsync();
```

### Dùng exception để điều khiển luồng

```csharp
// ❌ Dùng exception để kiểm tra tồn tại: exception tốn kém, chậm hơn nhiều so với kiểm tra trực tiếp
try
{
    var user = await _db.Users.FirstAsync(u => u.Id == id);
}
catch (InvalidOperationException)
{
    return NotFound();
}

// ✅ Kiểm tra thay vì bắt exception
var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
if (user is null) return NotFound();
```

### Đặt response header sau khi đã gửi body

```csharp
// ❌ Đặt header sau khi body đã gửi: ném exception
await next(context);
context.Response.Headers["X-Custom"] = "value"; // có thể ném exception

// ✅ Dùng callback OnStarting
context.Response.OnStarting(() =>
{
    context.Response.Headers["X-Custom"] = "value";
    return Task.CompletedTask;
});
await next(context);
```

## Dependency injection

### Inject scoped service vào singleton

```csharp
// ❌ Scoped service inject vào singleton: lệch vòng đời
services.AddSingleton<BackgroundWorker>();
services.AddScoped<IUserRepository, UserRepository>();

// BackgroundWorker là singleton, UserRepository là scoped
// → UserRepository bị dùng chung giữa nhiều request hoặc đã bị dispose

// ✅ Trong singleton, tạo scope qua IServiceScopeFactory
public class BackgroundWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public BackgroundWorker(IServiceScopeFactory scopeFactory)
        => _scopeFactory = scopeFactory;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
    }
}
```

## LINQ

### ToList rồi mới LINQ

```csharp
// ❌ ToList trước rồi mới lọc: tải cả bảng vào bộ nhớ
var results = context.Posts
    .Where(p => p.Title.StartsWith("A"))
    .ToList()
    .Where(p => SomeClientFilter(p)); // lọc phía client, đã tải mọi dòng

// ✅ Để CSDL lọc nhiều nhất có thể
var results = await context.Posts
    .Where(p => p.Title.StartsWith("A") && SomeDbFilter(p))
    .AsAsyncEnumerable()
    .Where(p => SomeClientFilter(p)) // chỉ lọc các dòng CSDL trả về
    .ToListAsync();
```

### Count() và Any()

```csharp
// ❌ Count() chạy cả truy vấn
if (context.Users.Count() > 0) { /* ... */ }

// ✅ Any() hiệu quả hơn: trả về ngay khi gặp bản ghi đầu tiên
if (await context.Users.AnyAsync()) { /* ... */ }
```

### Duyệt IEnumerable nhiều lần

```csharp
// ❌ IEnumerable bị duyệt hai lần
public void Process(IEnumerable<int> numbers)
{
    if (numbers.Any()) // lần duyệt thứ nhất
    {
        foreach (var n in numbers) // lần duyệt thứ hai (có thể truy vấn lại)
        {
            Console.WriteLine(n);
        }
    }
}

// ✅ Cần dùng nhiều lần thì materialize trước
public void Process(IEnumerable<int> numbers)
{
    var list = numbers.ToList(); // chỉ duyệt một lần
    if (list.Any())
    {
        foreach (var n in list)
        {
            Console.WriteLine(n);
        }
    }
}
```

### Side effect trong Select

```csharp
// ❌ Side effect trong Select: thời điểm chạy khó đoán
var results = users.Select(u =>
{
    _logger.LogInformation($"Processing {u.Name}"); // side effect
    return u.Email;
}).ToList();

// ✅ Đặt side effect trong foreach
foreach (var user in users)
{
    _logger.LogInformation("Processing {Name}", user.Name);
}
var results = users.Select(u => u.Email).ToList();
```

## Checklist

### Tính năng C# 12

- [ ] Tham số primary constructor không bị gán lại
- [ ] Cú pháp collection expression thống nhất (không trộn kiểu cũ và mới)

### Lập trình bất đồng bộ

- [ ] Không có `Task.Wait()`, `.Result`, `async void`
- [ ] Code thư viện dùng `ConfigureAwait(false)`
- [ ] `CancellationToken` truyền suốt chuỗi gọi
- [ ] Tài nguyên bất đồng bộ dùng `IAsyncDisposable` / `await using`
- [ ] Không trộn truy cập dữ liệu đồng bộ và bất đồng bộ

### EF Core

- [ ] Không có N+1 (truy cập navigation property trong vòng lặp)
- [ ] Projection `Select()` để tránh lấy thừa
- [ ] Phân trang: có `Take()`/`Skip()` trước `ToListAsync()`
- [ ] Nhiều `Include()` thì dùng `AsSplitQuery()`
- [ ] Truy vấn chỉ đọc dùng `AsNoTracking()`
- [ ] Không gọi hàm trên cột làm mất index
- [ ] Mọi lệnh gọi CSDL đều bất đồng bộ

### ASP.NET Core

- [ ] HttpClient lấy qua `IHttpClientFactory`
- [ ] Tác vụ nền không dùng trực tiếp scoped service
- [ ] Dùng `ReadFormAsync` thay cho `Request.Form`
- [ ] Không dùng exception để điều khiển luồng
- [ ] Response header đặt qua `OnStarting`

### Dependency injection

- [ ] Không inject scoped service vào singleton
- [ ] Tác vụ nền tạo scope mới

### LINQ

- [ ] Không có `ToList()` thừa trước LINQ
- [ ] Dùng `Any()` thay cho `Count() > 0`
- [ ] IEnumerable không bị duyệt nhiều lần (hoặc đã materialize)
- [ ] Không có side effect trong Select

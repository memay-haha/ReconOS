# Truy vấn N+1

Dùng khi review code truy cập CSDL qua ORM hoặc vòng lặp có truy vấn: Django, SQLAlchemy, JPA, EF Core, Laravel, Doctrine, Prisma. N+1 là anti-pattern hiệu năng thường gặp ở tầng ORM và tầng truy cập dữ liệu.

## Định nghĩa

N+1 là **1 truy vấn lấy N bản ghi, sau đó vòng lặp phát sinh thêm N truy vấn** để lấy dữ liệu liên quan.

```text
Luồng request:
  1 truy vấn  → lấy N bản ghi chính
  N truy vấn  → mỗi bản ghi chính truy vấn dữ liệu liên quan một lần
  ─────────
  Tổng: 1 + N truy vấn
```

### Tác hại

| Vấn đề | Ảnh hưởng |
|---|---|
| **Số truy vấn tăng tuyến tính** | 100 bản ghi = 101 câu SQL, 1.000 bản ghi = 1.001 câu |
| **Độ trễ mạng cộng dồn** | Mỗi truy vấn có một vòng khứ hồi (RTT), N vòng khứ hồi chậm hơn nhiều so với 1 truy vấn theo lô |
| **Cạn connection pool** | Nhiều truy vấn chiếm hết kết nối CSDL, kéo chậm cả ứng dụng |
| **Khó phát hiện khi phát triển** | Môi trường dev ít dữ liệu nên N+1 không lộ, lên production dữ liệu lớn thì hiệu năng giảm mạnh |

## Ảnh hưởng hiệu năng

### So sánh: lấy 100 người dùng kèm đơn hàng

| Cách làm | Số câu SQL | Độ trễ (giả định RTT = 1 ms) | Phù hợp với |
|---|---|---|---|
| N+1 lazy load | 101 | ~101 ms | Dữ liệu rất ít |
| Eager loading (JOIN) | 1 | ~1 ms | Một-nhiều, dữ liệu vừa phải |
| Eager loading (IN) | 2 | ~2 ms | Nhiều-nhiều, tập dữ liệu lớn |
| DataLoader / batch | 2 | ~2 ms | GraphQL, truy vấn đồ thị phức tạp |

### So sánh số câu SQL

```sql
-- ❌ N+1: 1 + 100 = 101 truy vấn
SELECT * FROM users;                          -- truy vấn 1
SELECT * FROM orders WHERE user_id = 1;       -- truy vấn 2
SELECT * FROM orders WHERE user_id = 2;       -- truy vấn 3
...
SELECT * FROM orders WHERE user_id = 100;     -- truy vấn 101

-- ✅ Theo lô: 2 truy vấn
SELECT * FROM users;
SELECT * FROM orders WHERE user_id IN (1,2,...,100);
```

## Cách phát hiện

### 1. Log SQL của ORM

Bật log SQL, quan sát số truy vấn trong môi trường test hoặc dev:

```python
# Django
import logging
logging.getLogger('django.db.backends').setLevel(logging.DEBUG)

# SQLAlchemy
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
```

```yaml
# Spring Boot application.yml
spring:
  jpa:
    show-sql: true
    properties:
      hibernate.format_sql: true
```

```csharp
// EF Core
optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information);
```

### 2. Assert số truy vấn trong test

```python
# Django: đếm truy vấn
from django.test.utils import CaptureQueriesContext
from django.db import connection

with CaptureQueriesContext(connection) as ctx:
    list(User.objects.select_related("profile").all())
assert len(ctx) <= 2  # tối đa 2 truy vấn
```

```java
// Hibernate: p6spy hoặc datasource-proxy
// đếm số câu SQL chạy trong test
assertThat(sqlCount).isLessThanOrEqualTo(2);
```

### 3. Công cụ APM và giám sát CSDL

- **Django Debug Toolbar**: hiện số câu SQL và thời gian theo thời gian thực.
- **p6spy** (Java): chặn ở tầng JDBC, ghi lại mọi câu SQL.
- **MiniProfiler** (.NET): thống kê SQL nhúng ngay trong trang.
- **DataDog / New Relic**: cảnh báo truy vấn chậm trên production.

## Cách giải chung

### Cách 1: Eager loading (JOIN)

Một truy vấn JOIN lấy cả bản ghi chính và bản ghi liên quan. Dùng cho quan hệ một-một, một-nhiều.

### Cách 2: Batch fetching (mệnh đề IN)

Hai truy vấn: bản ghi chính, rồi `WHERE id IN (...)` lấy bản ghi liên quan theo lô. Dùng cho quan hệ nhiều-nhiều, tập dữ liệu lớn.

### Cách 3: DataLoader

Với GraphQL hoặc truy vấn đồ thị phức tạp: gom mọi ID cần lấy, gộp thành một truy vấn theo lô.

```text
// Pseudocode DataLoader
class DataLoader<K, V> {
    load(K key) → V         // ghi nhận nhu cầu, chưa truy vấn ngay
    loadAll([K]) → [V]      // gộp thành một truy vấn theo lô
}
```

### Cách 4: Projection

Chỉ lấy trường cần dùng để giảm lượng dữ liệu truyền:

```sql
-- ❌ Lấy mọi cột
SELECT * FROM users JOIN profiles ON ...

-- ✅ Chỉ chiếu trường cần dùng
SELECT u.name, p.avatar_url FROM users u JOIN profiles p ON ...
```

## Cách làm theo ngôn ngữ

### Python / Django

Chi tiết: [django.md](languages/django.md).

```python
# ForeignKey / OneToOne → select_related (SQL JOIN)
books = Book.objects.select_related("publisher")

# M2M / FK ngược → prefetch_related (2 truy vấn + ghép trong Python)
authors = Author.objects.prefetch_related("books")

# Prefetch lồng nhau
authors = Author.objects.prefetch_related("books__publisher")

# Điều khiển chi tiết bằng object Prefetch
from django.db.models import Prefetch
authors = Author.objects.prefetch_related(
    Prefetch("books", queryset=Book.objects.filter(published=True), to_attr="published_books")
)
```

### Python / SQLAlchemy (FastAPI)

Chi tiết: [fastapi.md](languages/fastapi.md).

```python
from sqlalchemy.orm import selectinload, joinedload

# selectinload: tải theo lô bằng mệnh đề IN (nên dùng khi chạy bất đồng bộ)
stmt = select(Order).options(selectinload(Order.customer))

# joinedload: tải bằng JOIN
stmt = select(Order).options(joinedload(Order.customer))
```

### Java / JPA (Spring Boot)

Chi tiết: [java.md](languages/java.md), [java8.md](languages/java8.md).

```java
// ❌ FetchType.EAGER hoặc lazy load phát sinh trong vòng lặp
@OneToMany(fetch = FetchType.EAGER)  // nguy hiểm

// ✅ JOIN FETCH
@Query("SELECT u FROM User u JOIN FETCH u.orders")
List<User> findAllWithOrders();

// ✅ @EntityGraph (khai báo)
@EntityGraph(attributePaths = {"orders", "profile"})
List<User> findAll();

// ✅ @BatchSize (giảm N+1 xuống N/batchSize + 1)
@OneToMany
@BatchSize(size = 50)
private List<Order> orders;
```

### C# / EF Core

Chi tiết: [csharp.md](languages/csharp.md).

```csharp
// ❌ N+1: foreach kích hoạt lazy load
foreach (var blog in await context.Blogs.ToListAsync())
    foreach (var post in blog.Posts)  // mỗi vòng lặp một truy vấn

// ✅ Include + ThenInclude
var blogs = await context.Blogs
    .Include(b => b.Posts)
    .ToListAsync();

// ✅ Projection (an toàn nhất, tránh lấy thừa)
var data = await context.Blogs
    .Select(b => new { b.Url, PostTitles = b.Posts.Select(p => p.Title) })
    .ToListAsync();
```

### PHP / Laravel / Doctrine

Chi tiết: [php.md](languages/php.md).

```php
// ❌ Truy vấn trong vòng lặp
foreach ($orders as $order) {
    $customer = $customerRepo->find($order->customerId);
    render($order, $customer);
}

// ✅ Tải trước theo lô
$customerIds = array_unique(array_map(fn($o) => $o->customerId, $orders));
$customers = $customerRepo->findByIds($customerIds);

foreach ($orders as $order) {
    render($order, $customers[$order->customerId] ?? null);
}

// Laravel Eloquent: with()
$orders = Order::with('customer')->get();

// Doctrine: JOIN FETCH
$dql = 'SELECT o, c FROM Order o JOIN o.customer c';
```

### TypeScript / Prisma

Chi tiết: [typescript.md](languages/typescript.md).

```typescript
// ❌ N+1
const users = await prisma.user.findMany();
for (const user of users) {
    user.posts = await prisma.post.findMany({ where: { userId: user.id } });
}

// ✅ include (Prisma tự sinh JOIN hoặc truy vấn theo lô)
const users = await prisma.user.findMany({
    include: { posts: true },
});

// ✅ include lồng nhau
const users = await prisma.user.findMany({
    include: {
        posts: { include: { comments: true } },
    },
});
```

## Checklist

N+1 trên đường xử lý danh sách là P1 🔴 Cao: sửa trước merge.

### Phát hiện

- [ ] Đã bật log SQL hoặc giám sát số truy vấn
- [ ] Test có assert số truy vấn
- [ ] Công cụ APM đã cấu hình cảnh báo N+1

### Sửa

- [ ] Quan hệ ForeignKey / OneToOne dùng eager loading bằng JOIN
- [ ] Quan hệ M2M / quan hệ ngược dùng tải trước theo lô bằng IN
- [ ] Không phát sinh truy vấn CSDL trong vòng lặp
- [ ] Dùng projection để chỉ lấy trường cần dùng

### Kiến trúc

- [ ] API danh sách có phân trang, tránh tải quá nhiều bản ghi một lần
- [ ] Với GraphQL: dùng DataLoader
- [ ] Có chiến lược cache (Redis) cho dữ liệu liên quan đọc nhiều

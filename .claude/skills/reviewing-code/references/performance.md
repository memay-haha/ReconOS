# Review hiệu năng

Dùng khi review thay đổi có thể ảnh hưởng hiệu năng: frontend (Core Web Vitals, bundle, render danh sách), bộ nhớ, truy vấn CSDL, API, độ phức tạp thuật toán và lỗi hiệu quả ở mức code. Chi tiết N+1: [n-plus-one.md](n-plus-one.md). Chi tiết bất đồng bộ và đồng thời: [concurrency.md](concurrency.md).

## Frontend: Core Web Vitals

### Chỉ số chính (2024)

| Chỉ số | Tên đầy đủ | Mục tiêu | Ý nghĩa |
|---|---|---|---|
| **LCP** | Largest Contentful Paint | ≤ 2,5 s | Thời gian vẽ phần tử nội dung lớn nhất |
| **INP** | Interaction to Next Paint | ≤ 200 ms | Thời gian phản hồi tương tác (thay FID từ 2024) |
| **CLS** | Cumulative Layout Shift | ≤ 0,1 | Tổng độ dịch bố cục |
| **FCP** | First Contentful Paint | ≤ 1,8 s | Thời gian vẽ nội dung đầu tiên |
| **TBT** | Total Blocking Time | ≤ 200 ms | Thời gian main thread bị chặn |

### LCP

```javascript
// ❌ Ảnh LCP lazy load, làm chậm nội dung chính
<img src="hero.jpg" loading="lazy" />

// ✅ Ảnh LCP tải ngay
<img src="hero.jpg" fetchpriority="high" />

// ❌ Định dạng ảnh chưa tối ưu
<img src="hero.png" />  // file PNG quá lớn

// ✅ Định dạng hiện đại, ảnh responsive
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg" alt="Hero" />
</picture>
```

Điểm cần kiểm tra:

- [ ] Phần tử LCP có `fetchpriority="high"` không?
- [ ] Có dùng định dạng WebP/AVIF không?
- [ ] Có render phía máy chủ hoặc sinh tĩnh không?
- [ ] CDN cấu hình đúng chưa?

### FCP

```html
<!-- ❌ CSS chặn render -->
<link rel="stylesheet" href="all-styles.css" />

<!-- ✅ Nhúng CSS quan trọng, tải phần còn lại bất đồng bộ -->
<style>/* style quan trọng của màn hình đầu */</style>
<link rel="preload" href="styles.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />

<!-- ❌ Font chặn render -->
@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2');
}

<!-- ✅ Tối ưu hiển thị font -->
@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2');
  font-display: swap;  /* dùng font hệ thống trước, tải xong thì đổi */
}
```

### INP

```javascript
// ❌ Tác vụ dài chặn main thread
button.addEventListener('click', () => {
  // thao tác đồng bộ mất 500 ms
  processLargeData(data);
  updateUI();
});

// ✅ Chia nhỏ tác vụ dài
button.addEventListener('click', async () => {
  // nhường main thread
  await scheduler.yield?.() ?? new Promise(r => setTimeout(r, 0));

  // xử lý theo lô
  for (const chunk of chunks) {
    processChunk(chunk);
    await scheduler.yield?.();
  }
  updateUI();
});

// ✅ Dùng Web Worker cho tính toán nặng
const worker = new Worker('heavy-computation.js');
worker.postMessage(data);
worker.onmessage = (e) => updateUI(e.data);
```

### CLS

```css
/* ❌ Media không khai báo kích thước */
img { width: 100%; }

/* ✅ Giữ chỗ trước */
img {
  width: 100%;
  aspect-ratio: 16 / 9;
}

/* ❌ Nội dung chèn động làm dịch bố cục */
.ad-container { }

/* ✅ Giữ chiều cao cố định */
.ad-container {
  min-height: 250px;
}
```

Checklist CLS:

- [ ] Ảnh, video có width/height hoặc aspect-ratio không?
- [ ] Font có dùng `font-display: swap` không?
- [ ] Nội dung động có giữ chỗ trước không?
- [ ] Có tránh chèn nội dung lên phía trên nội dung đang hiển thị không?

## Hiệu năng JavaScript

### Tách code và lazy load

```javascript
// ❌ Tải toàn bộ code một lần
import { HeavyChart } from './charts';
import { PDFExporter } from './pdf';
import { AdminPanel } from './admin';

// ✅ Tải khi cần
const HeavyChart = lazy(() => import('./charts'));
const PDFExporter = lazy(() => import('./pdf'));

// ✅ Tách code theo route
const routes = [
  { path: '/dashboard', component: lazy(() => import('./pages/Dashboard')) },
  { path: '/admin', component: lazy(() => import('./pages/Admin')) },
];
```

### Kích thước bundle

```javascript
// ❌ Import cả thư viện
import _ from 'lodash';
import moment from 'moment';

// ✅ Import phần cần dùng
import debounce from 'lodash/debounce';
import { format } from 'date-fns';

// ❌ Không tree shaking được
export default {
  fn1() {},
  fn2() {},  // không dùng nhưng vẫn bị đóng gói
};

// ✅ Named export hỗ trợ tree shaking
export function fn1() {}
export function fn2() {}
```

Checklist bundle:

- [ ] Có dùng `import()` động để tách code không?
- [ ] Thư viện lớn có import theo phần cần dùng không?
- [ ] Đã phân tích kích thước bundle chưa (webpack-bundle-analyzer)?
- [ ] Có phụ thuộc không dùng tới không?

### Render danh sách

```javascript
// ❌ Render danh sách lớn
function List({ items }) {
  return (
    <ul>
      {items.map(item => <li key={item.id}>{item.name}</li>)}
    </ul>
  );  // 10000 bản ghi = 10000 nút DOM
}

// ✅ Virtual scroll, chỉ render phần đang thấy
import { FixedSizeList } from 'react-window';

function VirtualList({ items }) {
  return (
    <FixedSizeList height={400} itemCount={items.length} itemSize={35}>
      {({ index, style }) => <div style={style}>{items[index].name}</div>}
    </FixedSizeList>
  );
}
```

Điểm cần kiểm tra với dữ liệu lớn:

- [ ] Danh sách trên 100 mục có dùng cuộn ảo không?
- [ ] Bảng có phân trang hoặc ảo hóa không?
- [ ] Có render toàn bộ dữ liệu khi không cần không?

## Quản lý bộ nhớ

### Rò rỉ bộ nhớ thường gặp

#### 1. Event listener không gỡ

```javascript
// ❌ Component đã unmount nhưng listener vẫn chạy
useEffect(() => {
  window.addEventListener('resize', handleResize);
}, []);

// ✅ Gỡ listener
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

#### 2. Timer không xóa

```javascript
// ❌ Không xóa timer
useEffect(() => {
  setInterval(fetchData, 5000);
}, []);

// ✅ Xóa timer
useEffect(() => {
  const timer = setInterval(fetchData, 5000);
  return () => clearInterval(timer);
}, []);
```

#### 3. Closure giữ tham chiếu

```javascript
// ❌ Closure giữ tham chiếu tới object lớn
function createHandler() {
  const largeData = new Array(1000000).fill('x');
  return function handler() {
    // largeData bị closure giữ, không thu hồi được
    console.log(largeData.length);
  };
}

// ✅ Chỉ giữ dữ liệu cần thiết
function createHandler() {
  const largeData = new Array(1000000).fill('x');
  const length = largeData.length;  // chỉ giữ giá trị cần dùng
  return function handler() {
    console.log(length);
  };
}
```

#### 4. Subscription không hủy

```javascript
// ❌ Không đóng WebSocket/EventSource
useEffect(() => {
  const ws = new WebSocket('wss://...');
  ws.onmessage = handleMessage;
}, []);

// ✅ Đóng kết nối
useEffect(() => {
  const ws = new WebSocket('wss://...');
  ws.onmessage = handleMessage;
  return () => ws.close();
}, []);
```

### Checklist bộ nhớ

- [ ] Mọi `useEffect` có hàm dọn dẹp không?
- [ ] Event listener có gỡ khi component unmount không?
- [ ] Timer có xóa không?
- [ ] Kết nối WebSocket/SSE có đóng không?
- [ ] Object lớn có giải phóng kịp thời không?
- [ ] Có biến toàn cục tích lũy dữ liệu không?

### Công cụ phát hiện

| Công cụ | Dùng để |
|---|---|
| Chrome DevTools Memory | Phân tích heap snapshot |
| MemLab (Meta) | Tự động phát hiện rò rỉ bộ nhớ |
| Performance Monitor | Theo dõi bộ nhớ thời gian thực |

## Hiệu năng CSDL

### Truy vấn N+1

Chi tiết và ví dụ nhiều ORM: [n-plus-one.md](n-plus-one.md).

```python
# ❌ N+1: 1 + N truy vấn
users = User.objects.all()  # 1 truy vấn
for user in users:
    print(user.profile.bio)  # N truy vấn (mỗi người dùng một lần)

# ✅ Eager loading: 2 truy vấn
users = User.objects.select_related('profile').all()
for user in users:
    print(user.profile.bio)  # không phát sinh truy vấn

# ✅ Quan hệ nhiều-nhiều dùng prefetch_related
posts = Post.objects.prefetch_related('tags').all()
```

```javascript
// Ví dụ TypeORM
// ❌ N+1
const users = await userRepository.find();
for (const user of users) {
  const posts = await user.posts;  // mỗi vòng lặp một truy vấn
}

// ✅ Eager loading
const users = await userRepository.find({ relations: ['posts'] });
```

### Index

```sql
-- ❌ Quét toàn bảng
SELECT * FROM orders WHERE status = 'pending';

-- ✅ Thêm index
CREATE INDEX idx_orders_status ON orders(status);

-- ❌ Mất index: bọc cột trong hàm
SELECT * FROM users WHERE YEAR(created_at) = 2024;

-- ✅ Truy vấn khoảng dùng được index
SELECT * FROM users
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';

-- ❌ Mất index: LIKE có wildcard ở đầu
SELECT * FROM products WHERE name LIKE '%phone%';

-- ✅ So khớp tiền tố dùng được index
SELECT * FROM products WHERE name LIKE 'phone%';
```

### Tối ưu truy vấn

```sql
-- ❌ SELECT * lấy cột không cần
SELECT * FROM users WHERE id = 1;

-- ✅ Chỉ lấy cột cần dùng
SELECT id, name, email FROM users WHERE id = 1;

-- ❌ Bảng lớn không có LIMIT
SELECT * FROM logs WHERE type = 'error';

-- ✅ Phân trang
SELECT * FROM logs WHERE type = 'error' LIMIT 100 OFFSET 0;

-- ❌ Truy vấn trong vòng lặp
for id in user_ids:
    cursor.execute("SELECT * FROM users WHERE id = %s", (id,))

-- ✅ Truy vấn theo lô
cursor.execute("SELECT * FROM users WHERE id IN %s", (tuple(user_ids),))
```

### Checklist CSDL

P1, bắt buộc kiểm tra:

- [ ] Có truy vấn N+1 không?
- [ ] Cột trong mệnh đề WHERE có index không?
- [ ] Đã tránh `SELECT *` chưa?
- [ ] Truy vấn bảng lớn có LIMIT không?

P2, nên kiểm tra:

- [ ] Đã dùng EXPLAIN phân tích kế hoạch truy vấn chưa?
- [ ] Thứ tự cột trong composite index có đúng không?
- [ ] Có index không dùng tới không?
- [ ] Có theo dõi slow query log không?

## Hiệu năng API

### Phân trang

```javascript
// ❌ Trả toàn bộ dữ liệu
app.get('/users', async (req, res) => {
  const users = await User.findAll();  // có thể trả 100000 bản ghi
  res.json(users);
});

// ✅ Phân trang + giới hạn số bản ghi tối đa
app.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);  // tối đa 100
  const offset = (page - 1) * limit;

  const { rows, count } = await User.findAndCountAll({
    limit, offset, order: [['id', 'ASC']],
  });

  res.json({
    data: rows,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  });
});
```

### Cache

```javascript
// ✅ Cache bằng Redis
async function getUser(id) {
  const cacheKey = `user:${id}`;

  // 1. Kiểm tra cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Truy vấn CSDL
  const user = await db.users.findById(id);

  // 3. Ghi cache (đặt thời hạn)
  await redis.setex(cacheKey, 3600, JSON.stringify(user));
  return user;
}

// ✅ HTTP cache header
app.get('/static-data', (req, res) => {
  res.set({
    'Cache-Control': 'public, max-age=86400',  // 24 giờ
    'ETag': 'abc123',
  });
  res.json(data);
});
```

### Nén response

```javascript
// ✅ Bật nén Gzip/Brotli
const compression = require('compression');
app.use(compression());

// ✅ Chỉ trả trường cần dùng
// Request: GET /users?fields=id,name,email
app.get('/users', async (req, res) => {
  const fields = req.query.fields?.split(',') || ['id', 'name'];
  const users = await User.findAll({ attributes: fields });
  res.json(users);
});
```

### Giới hạn tần suất

```javascript
// ✅ Rate limit
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 phút
  max: 100,             // tối đa 100 request
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/', limiter);
```

### Checklist API

- [ ] Endpoint danh sách có phân trang không?
- [ ] Có giới hạn số bản ghi tối đa mỗi trang không?
- [ ] Dữ liệu truy cập nhiều có cache không?
- [ ] Đã bật nén response chưa?
- [ ] Có rate limit không?
- [ ] Có chỉ trả trường cần dùng không?

## Độ phức tạp thuật toán

### So sánh độ phức tạp thường gặp

| Độ phức tạp | Tên | 10 phần tử | 1.000 phần tử | 1 triệu phần tử | Ví dụ |
|---|---|---|---|---|---|
| O(1) | Hằng số | 1 | 1 | 1 | Tra bảng băm |
| O(log n) | Logarit | 3 | 10 | 20 | Tìm kiếm nhị phân |
| O(n) | Tuyến tính | 10 | 1.000 | 1 triệu | Duyệt mảng |
| O(n log n) | Tuyến tính logarit | 33 | 10.000 | 20 triệu | Quicksort |
| O(n²) | Bình phương | 100 | 1 triệu | 1.000 tỷ | Vòng lặp lồng nhau |
| O(2ⁿ) | Lũy thừa | 1024 | ∞ | ∞ | Fibonacci đệ quy |

### Nhận diện khi review

```javascript
// ❌ O(n²): vòng lặp lồng nhau
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) duplicates.push(arr[i]);
    }
  }
  return duplicates;
}

// ✅ O(n): dùng Set
function findDuplicates(arr) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of arr) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates];
}
```

```javascript
// ❌ O(n²): gọi includes trong mỗi vòng lặp
function removeDuplicates(arr) {
  const result = [];
  for (const item of arr) {
    if (!result.includes(item)) {  // includes là O(n)
      result.push(item);
    }
  }
  return result;
}

// ✅ O(n): dùng Set
function removeDuplicates(arr) {
  return [...new Set(arr)];
}
```

```javascript
// ❌ Tra cứu O(n): mỗi lần đều duyệt mảng
const users = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, ...];
function getUser(id) {
  return users.find(u => u.id === id);  // O(n)
}

// ✅ Tra cứu O(1): dùng Map
const userMap = new Map(users.map(u => [u.id, u]));
function getUser(id) {
  return userMap.get(id);  // O(1)
}
```

### Độ phức tạp bộ nhớ

```javascript
// ⚠️ Bộ nhớ O(n): tạo mảng mới
const doubled = arr.map(x => x * 2);

// ✅ Bộ nhớ O(1): sửa tại chỗ (nếu được phép)
for (let i = 0; i < arr.length; i++) {
  arr[i] *= 2;
}

// ⚠️ Đệ quy quá sâu có thể tràn stack
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);  // stack O(n)
}

// ✅ Bản lặp, bộ nhớ O(1)
function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}
```

### Mẫu nhận xét về độ phức tạp

```markdown
💡 "Vòng lặp lồng nhau này là O(n²), dữ liệu lớn sẽ chậm"
P1 🔴 "Gọi Array.includes() trong vòng lặp làm cả hàm thành O(n²), nên dùng Set"
P2 🟡 "Độ sâu đệ quy này có thể tràn stack, nên đổi sang vòng lặp hoặc đệ quy đuôi"
```

## Ngưỡng đo hiệu năng

### Frontend

| Chỉ số | Tốt | Cần cải thiện | Kém |
|---|---|---|---|
| LCP | ≤ 2,5 s | 2,5-4 s | > 4 s |
| INP | ≤ 200 ms | 200-500 ms | > 500 ms |
| CLS | ≤ 0,1 | 0,1-0,25 | > 0,25 |
| FCP | ≤ 1,8 s | 1,8-3 s | > 3 s |
| Kích thước bundle (JS) | < 200 KB | 200-500 KB | > 500 KB |

### Backend

| Chỉ số | Tốt | Cần cải thiện | Kém |
|---|---|---|---|
| Thời gian phản hồi API | < 100 ms | 100-500 ms | > 500 ms |
| Truy vấn CSDL | < 50 ms | 50-200 ms | > 200 ms |
| Tải trang | < 3 s | 3-5 s | > 5 s |

## Công cụ

### Hiệu năng frontend

| Công cụ | Dùng để |
|---|---|
| Lighthouse | Đo Core Web Vitals |
| WebPageTest | Phân tích hiệu năng chi tiết |
| webpack-bundle-analyzer | Phân tích bundle |
| Chrome DevTools Performance | Phân tích hiệu năng lúc chạy |

### Phát hiện rò rỉ bộ nhớ

| Công cụ | Dùng để |
|---|---|
| MemLab | Tự động phát hiện rò rỉ bộ nhớ |
| Chrome Memory Tab | Phân tích heap snapshot |

### Hiệu năng backend

| Công cụ | Dùng để |
|---|---|
| EXPLAIN | Phân tích kế hoạch truy vấn |
| pganalyze | Theo dõi hiệu năng PostgreSQL |
| New Relic / Datadog | Giám sát APM |

## Anti-pattern hiệu quả mức code

Lỗi hiệu quả ở mức code, tách khỏi vấn đề hiệu năng mức kiến trúc. Lỗi quản lý tài nguyên (kết nối không đóng, listener không gỡ, timer không xóa) xem mục Quản lý bộ nhớ ở trên và [concurrency.md](concurrency.md).

### Lặp lại công việc không cần

- [ ] Cùng một hàm hoặc truy vấn có bị gọi lặp lại trong cùng một request/render không?
- [ ] File hoặc cấu hình có bị đọc lại trong vòng lặp không (loop-invariant)?
- [ ] Kết quả tính toán có cache được hoặc truyền xuống dưới được không?

```typescript
// ❌ Phần loop-invariant chạy lại trong mỗi vòng
for (const path of paths) {
  const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
  processFile(path, config);
}

// ✅ Đưa ra ngoài vòng lặp
const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
for (const path of paths) processFile(path, config);
```

### Bỏ lỡ cơ hội chạy đồng thời

- [ ] Thao tác bất đồng bộ độc lập có bị `await` tuần tự không?
- [ ] Có thể chạy đồng thời bằng `Promise.all` / `asyncio.gather` / `tokio::join!` không?

```typescript
// ❌ await tuần tự
const a = await fetchA();
const b = await fetchB();

// ✅ Chạy đồng thời
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

### Hot path phình to

- [ ] Code cấp module hoặc lúc import có chạy thao tác nặng không (I/O file, mạng, dựng object lớn)?
- [ ] Đường xử lý mỗi request có phần khởi tạo hoãn được không?
- [ ] Code khởi động có chặn request đầu tiên không?

### Cấu trúc dữ liệu không giới hạn

Mục này tập trung vào giới hạn dung lượng. Lỗi vòng đời tài nguyên xem mục Quản lý bộ nhớ.

- [ ] Dict, list, cache toàn cục có `max-size` hoặc TTL không?
- [ ] Cấu trúc tích lũy (hàng đợi, log, buffer metrics) có giới hạn trên không?
- [ ] Object cấp phát theo request có bị giữ tham chiếu lâu dài, không GC được không?

```python
# ❌ Cache không giới hạn
_cache: dict[str, Any] = {}

# ✅ LRU có giới hạn
from functools import lru_cache

@lru_cache(maxsize=256)
def get_cached(key: str) -> Any:
    return expensive_computation(key)
```

## Tài liệu tham khảo

- [Core Web Vitals (web.dev)](https://web.dev/articles/vitals)

## Checklist

### P1 🔴 Cao: sửa trước merge

Frontend:

- [ ] Ảnh LCP có bị lazy load không? (không được)
- [ ] Có `transition: all` không?
- [ ] Có animate width/height/top/left không?
- [ ] Danh sách trên 100 mục có ảo hóa không?

Backend:

- [ ] Có truy vấn N+1 không?
- [ ] Endpoint danh sách có phân trang không?
- [ ] Có `SELECT *` trên bảng lớn không?

Chung:

- [ ] Có vòng lặp lồng nhau O(n²) hoặc tệ hơn không?
- [ ] `useEffect` và event listener có dọn dẹp không?

### P2 🟡 Trung bình

Frontend:

- [ ] Có tách code không?
- [ ] Thư viện lớn có import theo phần cần dùng không?
- [ ] Ảnh có dùng WebP/AVIF không?
- [ ] Có phụ thuộc không dùng tới không?

Backend:

- [ ] Dữ liệu truy cập nhiều có cache không?
- [ ] Cột WHERE có index không?
- [ ] Có theo dõi truy vấn chậm không?

API:

- [ ] Có bật nén response không?
- [ ] Có rate limit không?
- [ ] Có chỉ trả trường cần dùng không?

### P3 🟢 Thấp: gợi ý tối ưu

- [ ] Đã phân tích kích thước bundle chưa?
- [ ] Có dùng CDN không?
- [ ] Có giám sát hiệu năng không?
- [ ] Đã chạy benchmark hiệu năng chưa?

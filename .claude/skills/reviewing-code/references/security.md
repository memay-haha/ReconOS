# Bảo mật và độ tin cậy

Dùng khi review code có chạm tới xác thực, phân quyền, dữ liệu người dùng nhập, lệnh hệ thống, file, mạng, mật mã, secret, đồng thời hoặc tài nguyên lúc chạy. Danh mục bám theo OWASP Top 10. Chi tiết SQL injection ở [sql-injection.md](sql-injection.md), XSS ở [xss.md](xss.md).

## Cách báo một phát hiện bảo mật

Mỗi phát hiện bảo mật phải có đủ:

1. Vị trí: file, dòng, hàm.
2. Khả năng khai thác: ai khai thác được (ẩn danh, người dùng đã đăng nhập, quản trị viên), điều kiện cần, payload hoặc chuỗi bước mẫu.
3. Tác động: kẻ tấn công đọc, sửa, xóa được gì, chiếm được quyền gì, làm sập được gì.
4. Mức nghiêm trọng theo bảng ở mục Mức nghiêm trọng.
5. Cách sửa cụ thể, kèm code đúng nếu được.

Không báo "có thể có lỗ hổng" khi chưa chỉ ra được đường dữ liệu từ nguồn không tin cậy tới điểm nguy hiểm. Nếu chưa chắc, ghi rõ chưa chắc ở bước nào.

## Mức nghiêm trọng

| Mức | Mô tả | Hành động |
|---|---|---|
| P0 🔴 Nghiêm trọng | Khai thác được ngay, nguy cơ lộ hoặc mất dữ liệu | Chặn merge, sửa ngay |
| P1 🔴 Cao | Lỗ hổng đáng kể, cần điều kiện cụ thể mới khai thác được | Sửa trước merge, chậm nhất trước khi phát hành |
| P2 🟡 Trung bình | Rủi ro vừa, thiếu một tầng phòng thủ chiều sâu | Nên sửa, merge được nếu có việc theo dõi |
| P3 🟢 Thấp | Vi phạm thực hành tốt, rủi ro nhỏ | Sửa nếu tiện, không chặn merge |
| 💡 Gợi ý | Đề xuất cải thiện | Tùy chọn |

## Xác thực (AuthN)

- [ ] Băm mật khẩu bằng thuật toán mạnh (bcrypt, argon2).
- [ ] Áp yêu cầu độ phức tạp mật khẩu.
- [ ] Khóa tài khoản sau nhiều lần đăng nhập sai.
- [ ] Luồng đặt lại mật khẩu an toàn.
- [ ] Dùng xác thực đa yếu tố cho thao tác nhạy cảm.
- [ ] Session token sinh ngẫu nhiên bằng nguồn ngẫu nhiên mật mã.
- [ ] Có thời gian hết hạn session.
- [ ] Không có session fixation, quản lý session không yếu.

## Phân quyền (AuthZ) và tenancy

- [ ] Kiểm tra quyền trên mọi request.
- [ ] Áp nguyên tắc đặc quyền tối thiểu.
- [ ] RBAC (Role-Based Access Control) cài đúng.
- [ ] Không có đường leo thang đặc quyền.
- [ ] Kiểm tra tham chiếu object trực tiếp (chống IDOR).
- [ ] Endpoint API có tầng bảo vệ phù hợp. Endpoint mới có auth guard hoặc kiểm tra RBAC.
- [ ] Mọi thao tác đọc và ghi đều kiểm tra tenant hoặc quyền sở hữu.
- [ ] Không tin vai trò, cờ, ID do client gửi lên.
- [ ] Không có broken access control.

### IDOR (Insecure Direct Object Reference)

```python
# ❌ Lỗ hổng: không kiểm tra quyền sở hữu
def get_order(request, order_id):
    order = Order.objects.get(id=order_id)  # người dùng nào cũng xem được đơn của người khác
    return JsonResponse(order.to_dict())

# ✅ Kiểm tra quyền sở hữu trước khi trả về
def get_order(request, order_id):
    order = Order.objects.filter(id=order_id, user=request.user).first()
    if not order:
        return JsonResponse({'error': 'Not found'}, status=404)
    return JsonResponse(order.to_dict())
```

```typescript
// ❌ Lỗ hổng: không kiểm tra quyền
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.order.findUnique({ where: { id: Number(req.params.id) } });
  res.json(order);
});

// ✅ Đưa ngữ cảnh người dùng vào truy vấn
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.order.findFirst({
    where: {
      id: Number(req.params.id),
      userId: req.user.id,  // giới hạn trong người dùng hiện tại
    },
  });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});
```

```java
// ✅ Spring Security: phân quyền ở mức method
@GetMapping("/api/orders/{id}")
@PreAuthorize("@orderService.isOwner(#id, authentication.principal.id)")
public Order getOrder(@PathVariable Long id) {
    return orderService.findById(id);
}
```

### UUID và ID tự tăng

```typescript
// ❌ ID tự tăng bị liệt kê được
// GET /api/users/1, /api/users/2, /api/users/3 ...

// ✅ UUID không đoán trước được
// GET /api/users/550e8400-e29b-41d4-a716-446655440000

// ⚠️ UUID chỉ chống liệt kê, không thay cho kiểm tra quyền
// Vẫn phải kiểm tra người dùng hiện tại có quyền truy cập tài nguyên đó không
```

## JWT và token

- Tấn công nhầm thuật toán: chấp nhận `none` hoặc `HS256` khi đang chờ `RS256`.
- Secret yếu hoặc ghi cứng trong code.
- Thiếu `exp` hoặc không kiểm tra `exp`.
- Đặt dữ liệu nhạy cảm vào payload JWT. Token chỉ encode base64, không mã hóa nội dung.
- Không kiểm tra `iss` (issuer) hoặc `aud` (audience).

```typescript
// ❌ Cấu hình JWT không an toàn
jwt.sign(payload, 'weak-secret');

// ✅ Cấu hình JWT an toàn
jwt.sign(payload, process.env.JWT_SECRET, {
  algorithm: 'RS256',
  expiresIn: '15m',
  issuer: 'your-app',
  audience: 'your-api',
});

// ❌ Không kiểm tra chữ ký JWT
const decoded = jwt.decode(token);  // không kiểm tra chữ ký

// ✅ Kiểm tra chữ ký và claim
const decoded = jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  issuer: 'your-app',
  audience: 'your-api',
});
```

## Validate đầu vào và escape đầu ra

Dạng cần tìm:

- XSS: chèn HTML không an toàn, `dangerouslySetInnerHTML`, template không escape, gán `innerHTML`.
- Injection: SQL, NoSQL, command, GraphQL injection qua nối chuỗi hoặc template literal.
- SSRF: URL do người dùng kiểm soát đi tới dịch vụ nội bộ mà không qua allowlist.
- Path traversal: dữ liệu người dùng nhập nằm trong đường dẫn file mà không làm sạch (tấn công `../`).
- Prototype pollution: gộp object không an toàn trong JavaScript (`Object.assign`, spread với dữ liệu người dùng nhập).
- Deserialization không an toàn: deserialize dữ liệu không tin cậy bằng định dạng cho phép tạo object tùy ý.

### SQL injection

Quy tắc số một: luôn dùng truy vấn tham số hóa. Không bao giờ nối dữ liệu người dùng nhập vào chuỗi SQL.

Ngôn ngữ và framework phổ biến đều có cơ chế tham số hóa:

- Python: `cursor.execute("SELECT ...", params)`, method filter của ORM.
- Java: `PreparedStatement`, JPA `@Query` với `@Param`.
- Go: `db.Query("SELECT ...", args...)`.
- Node.js: `client.query("SELECT ...", [args])`, Prisma ORM.
- PHP: PDO prepared statement, Laravel Eloquent.
- C#: ADO.NET `SqlParameter`, Dapper, EF Core LINQ.

Ví dụ đủ ngôn ngữ, mẫu ORM không an toàn, xử lý tên bảng và cột động, công cụ phát hiện: [sql-injection.md](sql-injection.md).

### XSS

Quy tắc số một: dựa vào cơ chế auto-escape của framework, soát mọi lối thoát.

- React: JSX tự escape. Soát `dangerouslySetInnerHTML`.
- Vue: `{{ }}` tự escape. Soát `v-html`.
- Angular: interpolation tự escape. Soát `bypassSecurityTrustHtml`.
- Svelte: `{ }` tự escape. Soát `{@html}`.
- Django: template tự escape. Soát `mark_safe`.

Phòng thủ chiều sâu: cấu hình CSP (Content Security Policy) với `script-src` dùng nonce.

Ví dụ đủ framework, cấu hình CSP, phân biệt validate đầu vào và escape đầu ra, công cụ phát hiện: [xss.md](xss.md).

### CSRF

```typescript
// ✅ Máy chủ: sinh và kiểm tra CSRF token
import crypto from 'node:crypto';

function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware: kiểm tra token trên request làm đổi trạng thái
app.post('/api/data', (req, res) => {
  const token = req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;
  if (!token || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  // ...xử lý request
});
```

```python
# ✅ Django: có sẵn chống CSRF
# settings.py
MIDDLEWARE = [
    'django.middleware.csrf.CsrfViewMiddleware',  # bật mặc định
]

# template: chèn CSRF token
# <form method="post">
#   {% csrf_token %}
# </form>

# ❌ Tắt CSRF trên một view
@csrf_exempt  # chỉ dùng khi thật sự bắt buộc
def my_view(request):
    ...
```

```java
// ✅ Spring Security: CSRF bật mặc định
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) {
        http.csrf(csrf -> csrf
            .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
        );
        return http.build();
    }
}
```

```typescript
// ✅ Cookie SameSite làm tầng phòng thủ bổ sung
res.cookie('session', sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',  // hoặc 'lax' nếu cần cho phép request GET điều hướng
  maxAge: 3600000,
});
```

### SSRF

```python
# ❌ Lỗ hổng: URL do người dùng kiểm soát
import requests
url = request.GET.get('url')
response = requests.get(url)

# ✅ Kiểm tra URL theo allowlist
ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com']

def is_safe_url(url: str) -> bool:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return parsed.hostname in ALLOWED_HOSTS

if is_safe_url(url):
    response = requests.get(url)
```

```typescript
// ❌ Lỗ hổng: fetch URL bất kỳ
const url = req.query.url;
const response = await fetch(url);

// ✅ Kiểm tra URL trước khi fetch
const ALLOWED_DOMAINS = ['api.internal.com'];

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Chặn IP nội bộ
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return false;
    }
    if (parsed.hostname.match(/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./)) {
      return false; // chặn dải IP private
    }
    return ALLOWED_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
```

```go
// ✅ Go: kiểm tra URL trước khi gửi request
import "net/url"

func isSafeURL(rawURL string) bool {
    u, err := url.Parse(rawURL)
    if err != nil {
        return false
    }
    // Chặn IP nội bộ
    if u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" {
        return false
    }
    // Chỉ cho phép HTTPS
    if u.Scheme != "https" {
        return false
    }
    return true
}
```

### Command injection

```python
# ❌ Lỗ hổng: shell=True
import subprocess
subprocess.run(f"convert {filename} output.png", shell=True)

# ✅ Truyền danh sách tham số, không qua shell
subprocess.run(['convert', filename, 'output.png'], check=True)

# ✅ Kiểm tra và làm sạch dữ liệu nhập
import shlex
safe_filename = shlex.quote(filename)
```

```typescript
// ❌ Lỗ hổng: exec với chuỗi nội suy
import { exec } from 'node:child_process';
exec(`convert ${filename} output.png`);

// ✅ Dùng execFile với mảng tham số
import { execFile } from 'node:child_process';
execFile('convert', [filename, 'output.png'], (error, stdout) => {
  if (error) throw error;
});

// ❌ Không bao giờ đưa dữ liệu người dùng vào shell
exec(`echo ${userInput}`);  // userInput = "; rm -rf /"

// ✅ Làm sạch, hoặc dùng cách không qua shell
import { writeFile } from 'node:fs/promises';
await writeFile('output.txt', userInput);  // không dùng shell
```

```go
// ❌ Lỗ hổng: lệnh shell chứa dữ liệu người dùng nhập
cmd := exec.Command("sh", "-c", "echo " + userInput)

// ✅ Dùng exec.Command với tham số tách riêng
cmd := exec.Command("echo", userInput)

// ❌ Đưa dữ liệu người dùng vào shell
out, _ := exec.Command("bash", "-c", "cat "+filename).Output()

// ✅ Đọc file trực tiếp, không qua shell
data, err := os.ReadFile(filename)
```

```java
// ❌ Lỗ hổng: Runtime.exec với nối chuỗi
Runtime.getRuntime().exec("convert " + filename + " output.png");

// ✅ Dùng ProcessBuilder với tham số tách riêng
ProcessBuilder pb = new ProcessBuilder("convert", filename, "output.png");
Process process = pb.start();

// ❌ Nguy hiểm: đưa dữ liệu người dùng vào shell
Runtime.getRuntime().exec(new String[]{"sh", "-c", "echo " + userInput});
```

### Path traversal

Dấu hiệu: tên file hoặc đường dẫn lấy từ request rồi nối thẳng vào thư mục gốc. Cách sửa: chuẩn hóa đường dẫn, rồi kiểm tra kết quả vẫn nằm trong thư mục cho phép.

```python
# ❌ Lỗ hổng: filename = "../../etc/passwd"
path = os.path.join(UPLOAD_DIR, filename)
return open(path, 'rb').read()

# ✅ Chuẩn hóa rồi kiểm tra nằm trong thư mục gốc
base = Path(UPLOAD_DIR).resolve()
path = (base / filename).resolve()
if not path.is_relative_to(base):
    raise PermissionError('Invalid path')
```

```typescript
// ✅ Node.js: resolve rồi so tiền tố thư mục gốc
const base = path.resolve(UPLOAD_DIR);
const target = path.resolve(base, filename);
if (!target.startsWith(base + path.sep)) throw new Error('Invalid path');
```

### Deserialization không an toàn

Dấu hiệu: `pickle.loads`, `yaml.load` không có `SafeLoader`, Java `ObjectInputStream.readObject`, PHP `unserialize`, .NET `BinaryFormatter` trên dữ liệu từ request, cookie, queue hoặc file người dùng tải lên. Tác động thường là thực thi code từ xa.

```python
# ❌ Deserialize dữ liệu không tin cậy
obj = pickle.loads(request.body)
cfg = yaml.load(text, Loader=yaml.Loader)

# ✅ Dùng định dạng chỉ chứa dữ liệu
obj = json.loads(request.body)
cfg = yaml.safe_load(text)
```

```java
// ❌ readObject trên stream từ client
Object o = new ObjectInputStream(request.getInputStream()).readObject();

// ✅ Dùng JSON với kiểu đích cố định, hoặc ObjectInputFilter giới hạn class được phép
MyDto dto = objectMapper.readValue(request.getInputStream(), MyDto.class);
```

## Bảo vệ dữ liệu

### Secret và dữ liệu nhạy cảm

- [ ] Không có secret trong code.
- [ ] Lưu secret trong biến môi trường hoặc secret manager.
- [ ] Không có API key, token, thông tin xác thực trong code, cấu hình, log.
- [ ] Không có secret trong lịch sử git. Không lộ biến môi trường chứa secret cho phía client.
- [ ] Mã hóa dữ liệu nhạy cảm khi lưu.
- [ ] Mã hóa dữ liệu nhạy cảm khi truyền (HTTPS).
- [ ] Xử lý PII đúng quy định (GDPR...).
- [ ] Không ghi dữ liệu nhạy cảm vào log. Không ghi log PII hoặc payload nhạy cảm quá mức.
- [ ] Che dữ liệu trong thông báo lỗi.
- [ ] Xóa dữ liệu an toàn khi có yêu cầu.

```yaml
# ❌ Secret trong file cấu hình
database:
  password: "super-secret-password"

# ✅ Tham chiếu biến môi trường
database:
  password: ${DATABASE_PASSWORD}
```

### Thông báo lỗi

```typescript
// ❌ Lộ thông tin nhạy cảm
catch (error) {
  return res.status(500).json({
    error: error.stack,  // lộ chi tiết bên trong
    query: sqlQuery,     // lộ cấu trúc CSDL
  });
}

// ✅ Thông báo lỗi chung
catch (error) {
  logger.error('Database error', { error, userId });  // ghi log nội bộ
  return res.status(500).json({ error: 'An unexpected error occurred' });
}
```

## Mặc định không an toàn

Tìm cấu hình mở rộng quá mức hoặc tắt tầng bảo vệ có sẵn:

- CORS `Access-Control-Allow-Origin: *` đi cùng credentials.
- Thiếu header bảo mật (CSP, X-Frame-Options, X-Content-Type-Options).
- Lộ header nội bộ hoặc stack trace ra response.
- Tắt CSRF (`@csrf_exempt`, `csrf().disable()`) không có lý do.
- Secret mặc định hoặc yếu (`'weak-secret'`), mật khẩu mặc định.
- Chế độ debug bật ở môi trường chạy thật, tắt kiểm tra chứng chỉ TLS (`verify=False`).
- Cookie session thiếu `httpOnly`, `secure`, `sameSite`.

### CORS

```typescript
// ❌ CORS quá rộng
app.use(cors({ origin: '*' }));

// ✅ CORS giới hạn
app.use(cors({
  origin: ['https://your-app.com'],
  methods: ['GET', 'POST'],
  credentials: true,
}));
```

### HTTP header

```typescript
// Header bảo mật cần đặt
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
}));
```

## Bảo mật API: rate limit

- [ ] Rate limit trên mọi endpoint công khai.
- [ ] Giới hạn chặt hơn trên endpoint xác thực.
- [ ] Giới hạn theo người dùng và theo IP.
- [ ] Xử lý gọn khi vượt giới hạn.
- [ ] Có timeout, retry, rate limit khi gọi dịch vụ bên ngoài.

## Mật code

- [ ] Dùng thuật toán đã kiểm chứng (AES-256, RSA-2048 trở lên).
- [ ] Không tự viết thuật toán mật mã.
- [ ] Sinh số ngẫu nhiên bằng nguồn an toàn mật mã.
- [ ] Quản lý và xoay vòng khóa đúng cách.
- [ ] Lưu khóa an toàn (HSM, KMS).

Lỗi thường gặp:

- Thuật toán yếu (MD5, SHA1) cho mục đích bảo mật.
- IV hoặc salt ghi cứng.
- Mã hóa không xác thực (ECB mode, không có HMAC).
- Độ dài khóa không đủ.

```typescript
// ❌ Sinh ngẫu nhiên yếu
const token = Math.random().toString(36);

// ✅ Ngẫu nhiên an toàn mật mã
const crypto = require('crypto');
const token = crypto.randomBytes(32).toString('hex');

// ❌ MD5/SHA1 cho mật khẩu
const hash = crypto.createHash('md5').update(password).digest('hex');

// ✅ Dùng bcrypt hoặc argon2
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 12);
```

## Phụ thuộc và chuỗi cung ứng

- [ ] Chỉ lấy phụ thuộc từ nguồn tin cậy.
- [ ] Không có lỗ hổng đã biết (`npm audit`, `cargo audit`). Không dùng bản cũ có CVE đã biết.
- [ ] Cập nhật phụ thuộc thường xuyên.
- [ ] Commit lock file (`package-lock.json`, `Cargo.lock`). Không để phụ thuộc không ghim phiên bản, vì bản cập nhật độc hại có thể lọt vào.
- [ ] Dùng ít phụ thuộc nhất có thể.
- [ ] Kiểm tra giấy phép.
- [ ] Không có dependency confusion (trùng tên gói private).
- [ ] Không import từ nguồn hoặc CDN không tin cậy mà thiếu kiểm tra integrity.

```bash
# Node.js
npm audit
npm audit fix

# Python
pip-audit
safety check

# Rust
cargo audit

# Chung
snyk test
```

## Ghi log và giám sát

- [ ] Không có dữ liệu nhạy cảm trong log (mật khẩu, token, PII).
- [ ] Bảo vệ log khỏi bị sửa.
- [ ] Thời gian lưu log phù hợp.
- [ ] Ghi log sự kiện bảo mật (lần đăng nhập, thay đổi quyền).
- [ ] Chặn log injection.

```typescript
// ❌ Ghi log dữ liệu nhạy cảm
logger.info(`User login: ${email}, password: ${password}`);

// ✅ Ghi log an toàn
logger.info('User login attempt', { email, success: true });
```

## Rủi ro lúc chạy: vòng lặp, CPU, bộ nhớ

- Vòng lặp không giới hạn hoặc vô hạn, đệ quy không có điều kiện dừng chắc chắn.
- Buffer lớn trong bộ nhớ: đọc cả file, cả response, cả bảng vào RAM.
- Hotspot CPU: thao tác O(n²) trên dữ liệu người dùng kiểm soát kích thước.
- Thiếu timeout, retry, rate limit khi gọi bên ngoài.
- Thao tác chặn trên đường xử lý request (I/O đồng bộ trong ngữ cảnh bất đồng bộ).
- Cạn tài nguyên: file handle, kết nối, bộ nhớ.
- ReDoS (Regular Expression Denial of Service).

Với mỗi điểm trên, hỏi: kẻ tấn công có điều khiển được kích thước đầu vào hoặc số lần lặp không. Nếu có, phát hiện là lỗi bảo mật (từ chối dịch vụ), không chỉ là lỗi hiệu năng.

## Race condition

Race condition gây lỗi chập chờn và lỗ hổng bảo mật, khó thấy khi đọc code tuần tự.

### Truy cập trạng thái dùng chung

- Nhiều thread, goroutine, tác vụ bất đồng bộ cùng truy cập biến dùng chung mà không đồng bộ.
- Trạng thái toàn cục hoặc singleton bị sửa đồng thời.
- Lazy init không lock đúng (lỗi double-checked locking).
- Dùng collection không thread-safe trong ngữ cảnh đồng thời.

### Check-then-act (TOCTOU)

- Mẫu `if (exists) then use` không có thao tác nguyên tử.
- Mẫu `if (authorized) then perform` khi quyền có thể đổi giữa hai bước.
- Kiểm tra file tồn tại rồi mới thao tác trên file.
- Kiểm tra số dư rồi mới trừ tiền (giao dịch tài chính).
- Kiểm tra tồn kho rồi mới đặt hàng.

### Đồng thời trong CSDL

- Thiếu optimistic locking (cột `version`, kiểm tra `updated_at`).
- Thiếu pessimistic locking (`SELECT FOR UPDATE`).
- Đọc, sửa, ghi mà không có mức cô lập giao dịch phù hợp.
- Tăng bộ đếm không nguyên tử (cần `UPDATE SET count = count + 1`).
- Vi phạm ràng buộc unique khi insert đồng thời.

### Hệ phân tán

- Thiếu distributed lock cho tài nguyên dùng chung.
- Race condition khi bầu leader.
- Race khi vô hiệu cache (đọc dữ liệu cũ sau khi ghi).
- Phụ thuộc thứ tự sự kiện mà không sắp thứ tự đúng.
- Split-brain khi vận hành cụm.

### Mẫu cần đánh dấu

```text
# Mẫu nguy hiểm:
if not exists(key):       # TOCTOU
    create(key)

value = get(key)          # đọc, sửa, ghi
value += 1
set(key, value)

if user.balance >= amount:  # check-then-act
    user.balance -= amount
```

### Câu hỏi khi review

- "Chuyện gì xảy ra nếu hai request chạy vào đoạn code này cùng lúc?"
- "Thao tác này nguyên tử hay có thể bị ngắt giữa chừng?"
- "Đoạn code này truy cập trạng thái dùng chung nào?"
- "Đoạn code này chạy thế nào khi tải đồng thời cao?"

## Toàn vẹn dữ liệu

- Thiếu giao dịch, ghi dở dang, cập nhật trạng thái không nhất quán.
- Kiểm tra dữ liệu yếu trước khi lưu (lỗi ép kiểu).
- Thiếu idempotency cho thao tác có retry.
- Mất cập nhật do sửa đồng thời.

## Checklist

- [ ] Mỗi phát hiện nêu vị trí, khả năng khai thác, tác động, mức P0-P3, cách sửa.
- [ ] Mọi truy vấn SQL dùng tham số. Mọi lối thoát HTML của framework đã soát.
- [ ] Request làm đổi trạng thái có chống CSRF. Cookie session có `httpOnly`, `secure`, `sameSite`.
- [ ] URL do người dùng kiểm soát qua allowlist trước khi gọi ra ngoài (SSRF).
- [ ] Mọi truy cập object theo ID có kiểm tra quyền sở hữu và tenant (IDOR).
- [ ] Không gọi shell với dữ liệu người dùng nhập. Đường dẫn file đã chuẩn hóa và giới hạn trong thư mục gốc.
- [ ] Không deserialize dữ liệu không tin cậy bằng `pickle`, `yaml.load`, `ObjectInputStream`, `unserialize`.
- [ ] Endpoint mới có auth guard. Không tin vai trò, cờ, ID do client gửi.
- [ ] JWT kiểm tra chữ ký, thuật toán, `exp`, `iss`, `aud`.
- [ ] Không có secret trong code, cấu hình, log, lịch sử git, bundle phía client.
- [ ] Thông báo lỗi không lộ stack trace hoặc truy vấn.
- [ ] Không có mặc định không an toàn: CORS `*` kèm credentials, debug bật, tắt TLS, tắt CSRF.
- [ ] Có rate limit cho endpoint công khai và endpoint xác thực, có timeout cho lời gọi ra ngoài.
- [ ] Không có vòng lặp vô hạn, buffer không giới hạn, regex ReDoS trên dữ liệu người dùng kiểm soát.
- [ ] Không dùng MD5, SHA1, `Math.random` cho mục đích bảo mật. Không IV hoặc salt ghi cứng, không ECB.
- [ ] Phụ thuộc đã ghim phiên bản, không có CVE đã biết.
- [ ] Không có check-then-act, đọc-sửa-ghi thiếu lock hoặc thiếu giao dịch trên trạng thái dùng chung.
- [ ] Thao tác có retry là idempotent.

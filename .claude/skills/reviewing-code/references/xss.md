# Chống XSS

Dùng khi review code hiển thị dữ liệu người dùng nhập ra HTML: component frontend, template phía máy chủ, SSR, cấu hình CSP. Danh mục bảo mật chung ở [security.md](security.md).

## Dạng XSS

XSS (Cross-Site Scripting) nằm trong hạng 3 OWASP Top 10 (2021, gộp chung với Injection). Ba biến thể:

| Dạng | Mô tả | Đường tấn công |
|---|---|---|
| Reflected | Máy chủ phản chiếu script độc hại vào response | Tham số URL, dữ liệu form gửi lên |
| Stored (persistent) | Script độc hại lưu trong CSDL rồi trả cho người dùng khác | Bình luận, hồ sơ, tin nhắn |
| DOM-based | JavaScript phía client sửa DOM không an toàn | `innerHTML`, `document.write()`, `eval()` |

Mức mặc định: stored XSS và XSS chạy trong phiên đã đăng nhập là P0 🔴 Nghiêm trọng. Reflected XSS cần người dùng bấm liên kết thường là P1 🔴 Cao. Báo kèm khả năng khai thác (dữ liệu đi vào từ đâu, ai thấy) và tác động (đánh cắp session, thao tác thay người dùng).

## Chiến lược phòng chống chung

1. Escape đầu ra: escape dữ liệu theo ngữ cảnh hiển thị (HTML, JS, URL, CSS).
2. CSP (Content Security Policy): giới hạn script nào được chạy.
3. Làm sạch đầu vào: chỉ khi bắt buộc có rich text (DOMPurify).
4. Auto-escape của framework: dựa vào mặc định của framework, soát mọi lối thoát.

Phân biệt chính: validate đầu vào chặn dữ liệu xấu đi vào hệ thống. Escape đầu ra chặn dữ liệu xấu bị hiển thị thành code. Cần cả hai, không cái nào đủ một mình.

## Ví dụ theo framework

### React

```typescript
// ✅ React tự escape biểu thức JSX (an toàn mặc định)
return <div>{userInput}</div>;

// ❌ dangerouslySetInnerHTML bỏ qua escape
return <div dangerouslySetInnerHTML={{ __html: userInput }} />;

// ✅ Nếu bắt buộc dùng HTML, làm sạch trước
import DOMPurify from 'dompurify';
return <div dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(userInput)
}} />;

// ❌ href với giao thức javascript:
return <a href={`javascript:void(${userInput})`}>Click</a>;

// ✅ Kiểm tra giao thức URL
const safeUrl = userInput.startsWith('https://') ? userInput : '#';
return <a href={safeUrl}>Click</a>;

// ❌ eval hoặc new Function với dữ liệu người dùng nhập
const result = eval(userInput);

// ❌ innerHTML trong ref hoặc effect
useEffect(() => {
  ref.current.innerHTML = userInput;
}, [userInput]);
```

### Vue

```html
<!-- ✅ Vue tự escape text interpolation -->
<div>{{ userInput }}</div>

<!-- ❌ v-html bỏ qua escape -->
<div v-html="userInput"></div>

<!-- ✅ Làm sạch trước khi dùng v-html -->
<div v-html="sanitized(userInput)"></div>
```

```typescript
import DOMPurify from 'dompurify';

export default {
  methods: {
    sanitized(input: string): string {
      return DOMPurify.sanitize(input);
    }
  }
};

// ❌ v-bind:href với giao thức javascript:
// <a :href="userInput">Click</a>, userInput có thể là "javascript:alert(1)"
```

### Angular

```typescript
// ✅ Angular tự escape interpolation (an toàn mặc định)
template: `<div>{{ userInput }}</div>`

// ❌ bypassSecurityTrustHtml tắt cơ chế làm sạch
import { DomSanitizer } from '@angular/platform-browser';

constructor(private sanitizer: DomSanitizer) {
  this.unsafe = this.sanitizer.bypassSecurityTrustHtml(userInput);
}

// ❌ bypassSecurityTrustUrl với giao thức javascript:
this.unsafeUrl = this.sanitizer.bypassSecurityTrustUrl(userInput);

// ✅ Chỉ dùng bypassSecurityTrust* với nội dung máy chủ đã kiểm tra
// và ghi rõ lý do
```

### Svelte

```svelte
<!-- ✅ Svelte tự escape biểu thức -->
<div>{userInput}</div>

<!-- ❌ {@html} bỏ qua escape -->
<div>{@html userInput}</div>

<!-- ✅ Làm sạch trước khi dùng {@html} -->
<script>
  import DOMPurify from 'dompurify';
  const sanitized = DOMPurify.sanitize(userInput);
</script>
<div>{@html sanitized}</div>
```

### Django (phía máy chủ)

```python
# ✅ Django tự escape biến trong template
# template: <p>{{ user_bio }}</p>

# ❌ mark_safe bỏ qua auto-escape
from django.utils.safestring import mark_safe
return HttpResponse(mark_safe(f"<p>{user_bio}</p>"))

# ❌ Tắt autoescape trong template
# {% autoescape off %}{{ user_bio }}{% endautoescape %}

# ✅ Nếu bắt buộc dùng mark_safe, escape trước
from django.utils.html import escape
return HttpResponse(mark_safe(f"<p>{escape(user_bio)}</p>"))
```

### Render phía máy chủ

```typescript
// ❌ SSR: chèn thẳng dữ liệu người dùng vào HTML
const html = `<div>${userInput}</div>`;

// ✅ Luôn escape nội dung render phía máy chủ
import escapeHtml from 'escape-html';
const html = `<div>${escapeHtml(userInput)}</div>`;

// ❌ Serialize JSON không escape
const json = JSON.stringify({ name: userInput });
// userInput có thể chứa </script> để thoát khỏi thẻ script

// ✅ JSON trong HTML: escape < và >
const safe = JSON.stringify({ name: userInput })
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e');
```

## Content Security Policy (CSP)

CSP là tầng phòng thủ chiều sâu. Kể cả khi XSS lọt qua escape đầu ra, CSP vẫn giới hạn hành động của kẻ tấn công.

```nginx
# ✅ CSP khuyến nghị (chặt)
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
```

```typescript
// ✅ Middleware Express
import helmet from 'helmet';

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'nonce-{random}'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
}));
```

```html
<!-- ✅ Nonce CSP trong thẻ script -->
<script nonce="{random}">
  // CSP cho phép chạy
</script>

<!-- ❌ Inline event handler (CSP chặn nếu không có 'unsafe-inline') -->
<button onclick="doSomething()">Click</button>

<!-- ✅ Gắn event listener trong JS có nonce -->
<script nonce="{random}">
  document.getElementById('btn').addEventListener('click', doSomething);
</script>
```

Anti-pattern CSP cần tránh:

- `script-src 'unsafe-inline'` không kèm nonce hoặc hash.
- `script-src 'unsafe-eval'` (cho phép `eval()`).
- `default-src *` (cho tải từ mọi origin).
- `script-src https:` (cho mọi origin HTTPS, kể cả origin kẻ tấn công kiểm soát).

## Validate đầu vào và escape đầu ra

| Tầng | Làm gì | Khi nào | Ví dụ |
|---|---|---|---|
| Validate đầu vào | Từ chối hoặc làm sạch dữ liệu khi nhận | Ở ranh giới API | Từ chối `<script>` trong trường tên |
| Escape đầu ra | Escape dữ liệu theo ngữ cảnh hiển thị | Lúc render | `&lt;script&gt;` trong HTML |

Quy tắc: validate đầu vào chỉ để tiện (loại dữ liệu xấu rõ ràng). Escape đầu ra mới là ranh giới bảo mật. Không bao giờ chỉ dựa vào validate đầu vào.

## Phát hiện và test

```bash
# Quét tự động
# OWASP ZAP
zap-cli quick-scan --spider https://example.com

# Payload thử thủ công
<script>alert(1)</script>
<img src=x onerror=alert(1)>
" onmouseover="alert(1)
javascript:alert(1)
'-alert(1)-'

# Phân tích tĩnh (review code)
grep -rn "innerHTML\|dangerouslySetInnerHTML\|v-html\|bypassSecurityTrust\|mark_safe\|@html\|{@html" src/
grep -rn "eval(\|new Function\|document.write\|setTimeout.*string\|setInterval.*string" src/
```

## Checklist

- [ ] Mặc định dựa vào auto-escape của framework (không tự escape thủ công).
- [ ] Đã soát `dangerouslySetInnerHTML`, `v-html`, `bypassSecurityTrust`, `{@html}`, `mark_safe`.
- [ ] Mọi lối thoát render HTML đều qua `DOMPurify.sanitize()` hoặc tương đương trước.
- [ ] CSP cấu hình `script-src` dùng nonce hoặc hash.
- [ ] Không có `eval()`, `new Function()`, URL `javascript:` chứa dữ liệu người dùng nhập.
- [ ] Không có inline event handler (`onclick="..."`) khi đã bật CSP.
- [ ] Nội dung render phía máy chủ đã escape trước khi chèn.
- [ ] JSON nhúng trong HTML đã escape (`</script>` thành `\u003c/script\u003e`).

---
name: reviewing-code
description: Dùng khi review code, review pull request, review thay đổi git hiện tại, audit bảo mật, review kiến trúc, review hiệu năng, tìm bug, xây chuẩn review cho nhóm, hướng dẫn dev mới qua review. Áp dụng cho React, Vue, Angular, Svelte, TypeScript, CSS/Less/Sass, NestJS, Python, Django, FastAPI, Java, Java 8, C#/.NET, Kotlin, Go, Rust, C, C++, Zig, Swift, PHP, Ruby/Rails, Dart/Flutter, Qt.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - WebFetch
---

# Review code

## Tổng quan

Review code để bắt bug, giữ code dễ bảo trì, chia sẻ kiến thức, giữ chuẩn code, cải thiện thiết kế. Review không để khoe kiến thức, bắt bẻ định dạng, chặn tiến độ vô lý hay ép theo sở thích cá nhân.

Mặc định chỉ review. ❌ Không sửa code cho tới khi người dùng chọn cách xử lý ở bước 7.

## Mức nghiêm trọng

Một thang mức duy nhất cho mọi phát hiện và mọi file tham khảo.

| Mức | Tên | Ví dụ | Hành động |
|---|---|---|---|
| P0 🔴 | Nghiêm trọng | Lỗ hổng bảo mật, mất dữ liệu, sai logic nghiêm trọng | Chặn merge |
| P1 🔴 | Cao | Lỗi logic, vi phạm SOLID đáng kể, suy giảm hiệu năng | Sửa trước merge |
| P2 🟡 | Trung bình | Code smell, khó bảo trì, vi phạm SOLID nhỏ | Sửa trong PR hoặc tạo việc tiếp theo |
| P3 🟢 | Thấp | Style, đặt tên, gợi ý nhỏ | Tùy chọn |

Nhãn không phải mức, không chặn merge: 💡 gợi ý cách khác, 📚 kiến thức, 🎉 khen.

## Quy trình

### 1. Thu thập ngữ cảnh (2-3 phút)

1. Đọc mô tả PR, issue liên kết, yêu cầu nghiệp vụ, quyết định kiến trúc liên quan.
2. Xem trạng thái CI: test có qua không.
3. Xác định phạm vi thay đổi:

```bash
git status -sb
git diff --stat
git diff
```

4. Dùng `rg` hoặc `grep` tìm module liên quan, nơi gọi, contract.
5. Xác định điểm vào, ranh giới sở hữu, đường đi quan trọng: xác thực, thanh toán, ghi dữ liệu, gọi mạng.
6. Diff lớn: chạy script phân loại độ phức tạp, nhận gợi ý cách review:

```bash
git diff main...HEAD | python3 scripts/pr-analyzer.py
python3 scripts/pr-analyzer.py --diff-file changes.diff --stats
```

| Trường hợp | Xử lý |
|---|---|
| `git diff` rỗng | Báo người dùng, hỏi có review thay đổi đã stage hoặc một dải commit không |
| PR trên 400 dòng | Đề nghị tách PR |
| Diff trên 500 dòng | Tóm tắt theo file trước, rồi review theo lô theo module hoặc tính năng |
| Nhiều concern trộn lẫn | Nhóm phát hiện theo tính năng logic, không theo thứ tự file |

### 2. Review tổng thể (5-10 phút)

1. **Kiến trúc, SOLID:** giải pháp có hợp vấn đề không. Tìm vi phạm SRP, OCP, LSP, ISP, DIP, coupling, cohesion, anti-pattern, hướng phụ thuộc. Đọc [architecture-solid.md](references/architecture-solid.md).
   - Đề xuất refactor: giải thích vì sao tăng cohesion hoặc giảm coupling, nêu cách tách nhỏ an toàn.
   - Refactor lớn: đề xuất kế hoạch từng bước, không viết lại toàn bộ.
2. **Ứng viên xóa:** code không dùng, trùng lặp, bị feature flag tắt. Phân biệt xóa ngay an toàn và hoãn kèm kế hoạch có checkpoint test, metric. Template: [removal-plan.md](references/removal-plan.md).
3. **Hiệu năng:** độ phức tạp thuật toán, N+1, bộ nhớ, cache. Đọc [performance.md](references/performance.md), [n-plus-one.md](references/n-plus-one.md).
4. **Tổ chức file:** file mới đặt đúng chỗ không.
5. **Chiến lược test:** có test cho điều kiện biên không.

### 3. Review từng dòng (10-20 phút)

Với mỗi file, kiểm tra:

- **Logic:** điều kiện biên, off-by-one, null, race condition.
- **Bảo mật:** XSS, injection SQL/NoSQL/command, SSRF, path traversal, thiếu AuthN/AuthZ, thiếu kiểm tra tenant, lộ secret trong log/env/file, thiếu rate limit, vòng lặp không giới hạn, hotspot CPU/bộ nhớ, deserialization không an toàn, crypto yếu, mặc định không an toàn, race condition, check-then-act, TOCTOU, thiếu lock. Mỗi phát hiện nêu cả **khả năng khai thác** và **tác động**. Đọc [security.md](references/security.md), [sql-injection.md](references/sql-injection.md), [xss.md](references/xss.md).
- **Xử lý lỗi:** nuốt exception, catch quá rộng, thiếu xử lý lỗi, lỗi bất đồng bộ. Đọc [error-handling.md](references/error-handling.md).
- **Bất đồng bộ, đồng thời:** đọc [concurrency.md](references/concurrency.md).
- **Điều kiện biên:** null/undefined, collection rỗng, giới hạn số, off-by-one.
- **Hiệu năng:** N+1, vòng lặp thừa, thao tác nặng trên hot path, thiếu cache, rò rỉ bộ nhớ, bộ nhớ không giới hạn.
- **Dễ bảo trì:** tên rõ, một trách nhiệm, comment đúng chỗ.
- **Tái sử dụng:** trước khi nhận code mới, tìm helper sẵn có trong file lân cận và module dùng chung. Anti-pattern: parameter sprawl, leaky abstraction, điều kiện lồng sâu, stringly-typed, TOCTOU, no-op update, state thừa. Đọc [code-quality.md](references/code-quality.md).
- **Bug thường gặp theo ngôn ngữ:** [common-bugs.md](references/common-bugs.md).
- **Hướng dẫn riêng của ngôn ngữ:** bảng Hướng dẫn theo ngôn ngữ ở dưới.

Ưu tiên lỗi gây hỏng âm thầm hoặc sự cố production.

### 4. Tổng kết và quyết định (2-3 phút)

1. Tóm tắt vấn đề chính.
2. Nêu điểm làm tốt.
3. Ra quyết định: `APPROVE`, `COMMENT` (góp ý nhỏ), `REQUEST_CHANGES` (phải sửa).
4. Thay đổi phức tạp: đề nghị pair programming.

### 5. Định dạng báo cáo

```markdown
## Tóm tắt review

**File đã review**: X file, Y dòng thay đổi
**Đánh giá chung**: APPROVE | REQUEST_CHANGES | COMMENT

## Phát hiện

### P0 - Nghiêm trọng
(không có hoặc danh sách)

### P1 - Cao
1. **[file:dòng]** Tiêu đề ngắn
  - Mô tả vấn đề
  - Cách sửa đề xuất

### P2 - Trung bình
2. (đánh số liên tục qua các mục)

### P3 - Thấp

## Điểm làm tốt

## Kế hoạch xóa và lặp lại
(nếu có)

## Gợi ý thêm
(không chặn merge)
```

Comment theo dòng:

```text
::code-comment{file="path/to/file.ts" line="42" severity="P1"}
Mô tả vấn đề và cách sửa đề xuất.
::
```

Không có phát hiện: nêu rõ đã kiểm tra gì, phần chưa kiểm tra (ví dụ "chưa kiểm tra migration CSDL"), rủi ro còn lại, test nên chạy thêm.

Comment trên PR theo mẫu: [pr-review-template.md](assets/pr-review-template.md). Checklist tra nhanh: [review-checklist.md](assets/review-checklist.md).

### 6. Cách viết phản hồi

Phản hồi tốt thì cụ thể, làm được, mang tính hướng dẫn, nói về code chứ không nói về người, có khen, có thứ tự ưu tiên. Chi tiết: [feedback.md](references/feedback.md).

| ❌ Sai | ✅ Đúng |
|---|---|
| "Chỗ này sai." | "P1: Hai người dùng truy cập cùng lúc sẽ gây race condition. Cân nhắc dùng mutex." |
| "Sao không dùng pattern X?" | "💡 Repository pattern sẽ giúp test dễ hơn. Ví dụ: ..." |
| "Đổi tên biến này." | "P3: `userCount` rõ hơn `uc`. Không chặn merge nếu bạn muốn giữ." |
| "Chỗ này lỗi nếu list rỗng." | "Nếu `items` là mảng rỗng thì sao?" |
| "Phải thêm xử lý lỗi." | "Gọi API thất bại thì hàm nên xử lý thế nào?" |
| "Phải đổi sang async/await." | "💡 async/await có thể dễ đọc hơn. Bạn thấy sao?" |
| "Tách ra hàm." | "Logic này lặp ở 3 chỗ. Tách thành hàm có hợp lý không?" |

❌ Không review tay: định dạng, thứ tự import, lỗi linter, lỗi chính tả đơn giản. Để Prettier, Black, linter xử lý.

### 7. Xác nhận bước tiếp theo

```markdown
## Bước tiếp theo

Tìm thấy X vấn đề (P0: _, P1: _, P2: _, P3: _).

**Chọn cách xử lý:**

1. **Sửa tất cả**
2. **Chỉ sửa P0/P1**
3. **Sửa mục cụ thể**: cho biết số thứ tự
4. **Không sửa**: kết thúc review
```

❌ Không sửa code cho tới khi người dùng chọn.

## Hướng dẫn chung

| Chủ đề | File |
|---|---|
| Kiến trúc, SOLID, anti-pattern, coupling, cohesion | [architecture-solid.md](references/architecture-solid.md) |
| Kế hoạch xóa code | [removal-plan.md](references/removal-plan.md) |
| Chất lượng code chung, tái sử dụng, điều kiện biên | [code-quality.md](references/code-quality.md) |
| Bảo mật: SQLi, XSS, CSRF, SSRF, IDOR, command injection | [security.md](references/security.md) |
| SQL injection: truy vấn tham số, ORM, identifier động | [sql-injection.md](references/sql-injection.md) |
| XSS: escape đầu ra, CSP | [xss.md](references/xss.md) |
| Hiệu năng: Web Vitals, thuật toán, bộ nhớ, cache | [performance.md](references/performance.md) |
| N+1: eager loading, batch, DataLoader | [n-plus-one.md](references/n-plus-one.md) |
| Xử lý lỗi: fail fast, phân cấp lỗi, log lỗi | [error-handling.md](references/error-handling.md) |
| Bất đồng bộ, đồng thời: goroutine, async/await, actor | [concurrency.md](references/concurrency.md) |
| Bug thường gặp theo ngôn ngữ | [common-bugs.md](references/common-bugs.md) |
| Cách viết phản hồi, tư duy người review | [feedback.md](references/feedback.md) |

## Hướng dẫn theo ngôn ngữ

Đọc file của ngôn ngữ, framework có trong diff.

| Ngôn ngữ, framework | File | Trọng tâm |
|---|---|---|
| React | [react.md](references/languages/react.md) | Hooks, useEffect, React 19 Actions, RSC, Suspense, TanStack Query v5 |
| Vue 3 | [vue.md](references/languages/vue.md) | Composition API, reactivity, Props/Emits, watcher, composable |
| Angular 17+ | [angular.md](references/languages/angular.md) | Signals, Standalone, RxJS, Zoneless, template, test, route guard, HttpInterceptor |
| Svelte, SvelteKit | [svelte.md](references/languages/svelte.md) | Runes, load, Form Actions, chuyển store, ranh giới SSR/CSR |
| TypeScript | [typescript.md](references/languages/typescript.md) | Type safety, async/await, immutability, test, module resolution, TS 5.x |
| CSS, Less, Sass | [css.md](references/languages/css.md) | Biến, `!important`, hiệu năng, responsive, tương thích |
| NestJS | [nestjs.md](references/languages/nestjs.md) | DI, phân tầng, DTO validation, Guard, Interceptor, phụ thuộc vòng |
| Python | [python.md](references/languages/python.md) | Default tham số mutable, exception, thuộc tính class |
| Django, DRF | [django.md](references/languages/django.md) | Bảo mật, N+1, Serializer, ViewSet, async view |
| FastAPI | [fastapi.md](references/languages/fastapi.md) | Depends, Pydantic v2, async, session, N+1, xác thực và phân quyền, test |
| Java 17/21 | [java.md](references/languages/java.md) | Tính năng mới, Spring Boot 3, virtual thread, Stream, Optional |
| Java 8 | [java8.md](references/languages/java8.md) | Spring Boot 2, `javax.*`, Stream, Optional, `java.time`, CompletableFuture |
| C#, .NET | [csharp.md](references/languages/csharp.md) | C# 12, async, EF Core, ASP.NET Core, LINQ |
| Kotlin, Android | [kotlin.md](references/languages/kotlin.md) | Coroutine, Flow, Jetpack Compose, null safety, rò rỉ bộ nhớ |
| Go | [go.md](references/languages/go.md) | Xử lý lỗi, goroutine, channel, context, interface |
| Rust | [rust.md](references/languages/rust.md) | Ownership, borrowing, unsafe, async, cancel safety, xử lý lỗi |
| C | [c.md](references/languages/c.md) | Con trỏ, buffer, an toàn bộ nhớ, UB, code an toàn, tính khả chuyển |
| C++ | [cpp.md](references/languages/cpp.md) | RAII, smart pointer, C++20/23, constexpr, test |
| Zig | [zig.md](references/languages/zig.md) | Allocator, error union, defer/errdefer, comptime, C interop |
| Swift, SwiftUI | [swift.md](references/languages/swift.md) | Optional, Swift Concurrency, Sendable, actor, property wrapper, value/reference type |
| PHP | [php.md](references/languages/php.md) | Type system PHP 8, PDO, bảo mật, Composer, PHPUnit, PHPStan |
| Ruby, Rails | [ruby.md](references/languages/ruby.md) | Ngữ nghĩa Ruby, Rails 8, Active Record, Active Job, bảo mật, test |
| Dart, Flutter | [dart.md](references/languages/dart.md) | Widget rebuild, const, null safety, isolate, Riverpod/Bloc, platform channel, key, dispose |
| Qt | [qt.md](references/languages/qt.md) | Object model, signal/slot, Model/View, QML, chuyển Qt6, test |

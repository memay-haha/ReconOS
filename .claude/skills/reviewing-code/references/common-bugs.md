# Lỗi thường gặp

Danh sách tra nhanh mẫu lỗi theo nhóm và theo ngôn ngữ. Dùng khi quét nhanh một diff trước khi đi sâu. Ví dụ code, giải thích và checklist đầy đủ của từng ngôn ngữ nằm trong `languages/`, ví dụ [python.md](languages/python.md).

## Lỗi chung mọi ngôn ngữ

### Lỗi logic

- [ ] Off-by-one trong vòng lặp và khi truy cập mảng
- [ ] Biểu thức boolean sai (vi phạm luật De Morgan)
- [ ] Thiếu kiểm tra null/undefined
- [ ] Race condition trong code chạy đồng thời
- [ ] Dùng sai toán tử so sánh (`==` với `===`, `=` với `==`)
- [ ] Tràn số nguyên (overflow/underflow)
- [ ] So sánh số thực dấu phẩy động trực tiếp

### Quản lý tài nguyên

- [ ] Rò rỉ bộ nhớ (kết nối, listener không đóng)
- [ ] File handle không đóng
- [ ] Kết nối CSDL không trả lại pool
- [ ] Event listener không gỡ
- [ ] Timer/interval không xóa

### Xử lý lỗi

- [ ] Nuốt exception (khối catch rỗng)
- [ ] Bắt exception chung chung, che mất lỗi cụ thể
- [ ] Không truyền lỗi lên tầng gọi
- [ ] Ném sai loại lỗi
- [ ] Thiếu khối finally/dọn dẹp

## TypeScript/JavaScript

- [ ] Dùng `==` thay cho `===`
- [ ] Dùng `any`: nên dùng kiểu cụ thể, hoặc `unknown` kèm type guard
- [ ] Thiếu `await` khi gọi hàm async
- [ ] Promise bị reject không xử lý (không có try-catch quanh await)
- [ ] Mất ngữ cảnh `this` trong callback
- [ ] Thiếu prop `key` trong danh sách
- [ ] Closure giữ biến vòng lặp đã cũ
- [ ] `parseInt` không truyền radix
- [ ] Sửa mảng/object trong lúc duyệt

Hướng dẫn đầy đủ: [typescript.md](languages/typescript.md).

## React / React 19

- [ ] Gọi Hook trong điều kiện hoặc vòng lặp (vi phạm Rules of Hooks)
- [ ] Mảng phụ thuộc của `useEffect` thiếu hoặc sai
- [ ] `useEffect` thiếu hàm cleanup (subscription, timer, fetch)
- [ ] Dùng `useEffect` để tính state dẫn xuất (nên dùng `useMemo`)
- [ ] Lạm dụng `useMemo`/`useCallback`, hoặc dùng mà không có `React.memo`
- [ ] Định nghĩa component bên trong component khác (mount lại mỗi lần render)
- [ ] Prop không ổn định (object, hàm inline truyền vào component memo)
- [ ] Sửa trực tiếp props
- [ ] Danh sách thiếu `key` hoặc dùng index làm key (danh sách đổi thứ tự được)
- [ ] Server Component dùng API phía client (`useState`, `useEffect`, `onClick`)
- [ ] `'use client'` đặt ở component cha làm cả cây con thành client
- [ ] `useActionState` gọi `setState` thay vì trả state mới
- [ ] `useFormStatus` gọi trong cùng component với `<form>` (phải nằm ở component con)
- [ ] Dùng `useOptimistic` cho thao tác quan trọng (thanh toán, xóa)
- [ ] Một Suspense boundary cho cả trang (phần chậm chặn phần nhanh)
- [ ] Thiếu Error Boundary bọc Suspense
- [ ] Hook `use()` nhận Promise mới ở mỗi lần render

**TanStack Query v5:**

- [ ] `queryKey` thiếu tham số ảnh hưởng tới dữ liệu
- [ ] Để mặc định `staleTime: 0` gây refetch quá nhiều
- [ ] `useSuspenseQuery` dùng kèm `enabled` (không hỗ trợ)
- [ ] Mutation thành công nhưng không invalidate query liên quan
- [ ] Optimistic update thiếu rollback trong `onError`
- [ ] Dùng cú pháp mảng của v4 (`useQuery(['key'], fn)`) thay cho cú pháp object của v5

**Test:**

- [ ] Dùng `container.querySelector` thay cho `screen.getByRole`
- [ ] Dùng `fireEvent` thay cho `userEvent`
- [ ] Test chi tiết implementation thay vì hành vi người dùng thấy
- [ ] Dùng `getBy*` cho nội dung bất đồng bộ (nên dùng `findBy*`)

Hướng dẫn đầy đủ: [react.md](languages/react.md).

## Vue 3

- [ ] Destructure object `reactive()` làm mất reactivity (dùng `toRefs`)
- [ ] Truyền `props.x` vào composable thay vì `() => props.x` hoặc `toRef(props, 'x')`
- [ ] `watch` có callback async nhưng thiếu `onCleanup` (race condition)
- [ ] `computed` có side effect (sửa dữ liệu, gọi API)
- [ ] `v-for` dùng index làm `:key` khi danh sách đổi thứ tự được
- [ ] `v-if` và `v-for` trên cùng một phần tử
- [ ] `defineProps` không khai báo kiểu TypeScript
- [ ] Giá trị mặc định dạng object trong `withDefaults` không dùng hàm factory
- [ ] Sửa trực tiếp props thay vì emit sự kiện
- [ ] `watchEffect` có phụ thuộc không rõ, chạy lại quá nhiều

Hướng dẫn đầy đủ: [vue.md](languages/vue.md).

## Python

- [ ] Tham số mặc định kiểu mutable (`def f(x=[])`)
- [ ] `except:` trần bắt cả `KeyboardInterrupt` và `SystemExit`
- [ ] Thuộc tính class mutable dùng chung (`class C: items = []`)
- [ ] Dùng `is` thay cho `==` khi so sánh giá trị
- [ ] Quên tham số `self` trong method
- [ ] Sửa list trong lúc duyệt
- [ ] Nối chuỗi trong vòng lặp (dùng `"".join()`)
- [ ] Không đóng file (dùng câu lệnh `with`)
- [ ] Hàm public thiếu type annotation

Hướng dẫn đầy đủ: [python.md](languages/python.md). Django: [django.md](languages/django.md). FastAPI: [fastapi.md](languages/fastapi.md).

## Rust

**Ownership và borrowing:**

- [ ] Gọi `clone()` thừa để né borrow checker
- [ ] Dùng `Arc<Mutex<T>>` khi một chủ sở hữu là đủ
- [ ] Lưu borrow trong struct khi dữ liệu owned đơn giản hơn
- [ ] Dùng `RefCell` thừa (kiểm tra lúc chạy thay vì lúc biên dịch)

**Unsafe:**

- [ ] Khối `unsafe` thiếu comment `SAFETY:` giải thích bất biến
- [ ] `unsafe fn` thiếu mục tài liệu `# Safety`
- [ ] Bất biến của unsafe nằm rải rác qua nhiều module

**Bất đồng bộ và đồng thời:**

- [ ] Gọi hàm chặn trong ngữ cảnh bất đồng bộ (`std::fs`, `std::thread::sleep`)
- [ ] Giữ `std::sync::Mutex` qua `.await`
- [ ] Task spawn thiếu ràng buộc lifetime `'static`
- [ ] Drop Future mà không await (việc bị bỏ quên)

**Xử lý lỗi:**

- [ ] `unwrap()`/`expect()` trong code production
- [ ] Thư viện dùng `anyhow` thay cho `thiserror` (bên gọi không match được lỗi)
- [ ] Nuốt ngữ cảnh lỗi (`map_err(|_| ...)`)
- [ ] Bỏ qua giá trị trả về có `must_use`

**Hiệu năng:**

- [ ] `.collect()` thừa: nên dùng lazy iterator
- [ ] Nối chuỗi trong vòng lặp không có `with_capacity`
- [ ] `Box<dyn Trait>` khi `impl Trait` là đủ

Hướng dẫn đầy đủ: [rust.md](languages/rust.md).

## Go

- [ ] Bỏ qua lỗi (`result, _ := SomeFunction()`)
- [ ] Goroutine không có đường thoát (rò rỉ)
- [ ] Thiếu hoặc truyền sai `context.Context`
- [ ] Closure giữ biến vòng lặp (Go < 1.22)
- [ ] `defer` trong vòng lặp (chỉ chạy khi hàm kết thúc, không chạy theo từng vòng)
- [ ] Shadowing biến
- [ ] Dùng map trước khi khởi tạo
- [ ] Bọc lỗi bằng `%v` thay cho `%w` (làm hỏng `errors.Is`/`errors.As`)

Hướng dẫn đầy đủ: [go.md](languages/go.md).

## Java / Spring Boot

- [ ] POJO/DTO viết boilerplate tay thay vì `record` *(Java 17+)*
- [ ] Switch kiểu cũ thiếu `break` (nên dùng switch expression) *(Java 14+)*
- [ ] Field injection thay cho constructor injection
- [ ] JPA N+1 (thiếu `fetch join` hoặc `@EntityGraph`)
- [ ] `equals`/`hashCode` sai trên JPA entity (tránh `@Data`; nên dùng business key ổn định hoặc id an toàn với null, không bao giờ dùng mọi trường lazy)
- [ ] `Optional.get()` không kiểm tra `isPresent()`
- [ ] Stream có side effect

Hướng dẫn đầy đủ (Java 17/21 và Spring Boot 3): [java.md](languages/java.md).

## Java 8 / Spring Boot 2 (code cũ)

- [ ] Dùng chung `SimpleDateFormat` / `Date` cũ thay cho `java.time`
- [ ] `Collectors.toMap` gặp giá trị null hoặc thiếu hàm merge
- [ ] `Optional` dùng làm field/tham số, hoặc `isPresent()`+`get()` dùng như kiểm tra null
- [ ] I/O trong `CompletableFuture.supplyAsync` chạy trên `commonPool` (không chỉ định executor)
- [ ] `RestTemplate` không đặt timeout kết nối/đọc
- [ ] `@Transactional` trên method private hoặc tự gọi trong cùng class
- [ ] `parallelStream` dùng state mutable chung
- [ ] Trộn `javax.*` và `jakarta.*` trên Boot 2

Hướng dẫn đầy đủ: [java8.md](languages/java8.md).

## PHP

- [ ] File mới thiếu `declare(strict_types=1);`
- [ ] So sánh lỏng (`==`, `!=`) trong logic xác thực, token, thanh toán, trạng thái
- [ ] `in_array()` / `array_search()` không bật chế độ strict
- [ ] SQL dựng bằng nối chuỗi thay vì prepared statement
- [ ] In dữ liệu người dùng ra mà không escape theo ngữ cảnh
- [ ] Lưu mật khẩu bằng `md5()` / `sha1()` thay cho `password_hash()`
- [ ] Truyền dữ liệu không tin cậy vào `unserialize()`
- [ ] PHP 8.2+ dùng dynamic property thay cho property đã khai báo
- [ ] Giấu lỗi bằng `@` hoặc nuốt trong khối `catch` rỗng
- [ ] Upload file dùng tên do client gửi, hoặc thiếu kiểm tra MIME/kích thước

Hướng dẫn đầy đủ: [php.md](languages/php.md).

## Ruby / Rails

- [ ] Điều kiện giả định `0`, `""`, `[]` là falsey
- [ ] Giá trị mặc định Hash/Array mutable dùng chung giữa các phần tử (`Hash.new([])`, `Array.new(3, [])`)
- [ ] Coi giá trị trả về của bang method là object đã biến đổi
- [ ] `rescue` trần hoặc quá rộng che lỗi không liên quan, hoặc lộ `error.message`
- [ ] `send`, `constantize`, `eval` động hoặc mảnh SQL do người dùng kiểm soát
- [ ] Truyền dữ liệu không tin cậy vào `Marshal.load`, nạp YAML không an toàn, hoặc lệnh shell có nội suy
- [ ] Strong parameters dùng `permit!`, `to_unsafe_h`, hoặc allowlist là hash rỗng
- [ ] Mảng lồng trong `params.expect` dùng dạng phẳng thay cho dạng bắt buộc `[[...]]`
- [ ] Truy vấn Active Record nội suy giá trị hoặc định danh động vào SQL
- [ ] `Model.find(params[:id])` nạp bản ghi trước khi giới hạn theo chủ sở hữu hoặc policy (IDOR)
- [ ] `redirect_to` nhận URL do người dùng kiểm soát với `allow_other_host: true` (open redirect)
- [ ] Thay đổi trạng thái qua phiên trình duyệt bỏ qua bảo vệ CSRF hoặc dùng cờ cookie phiên không an toàn
- [ ] Truy cập association trong vòng lặp gây N+1
- [ ] Validation ở model không có ràng buộc CSDL tương ứng cho bất biến quan trọng
- [ ] `update_all` / `delete_all` bỏ qua callback và validation ngoài dự kiến
- [ ] Ghi hàng loạt làm lệch `counter_cache` mà không đối soát lại
- [ ] Active Job thử lại gây lặp thanh toán, email hoặc side effect bên ngoài
- [ ] Đối số job dạng GlobalID bị xóa trước khi deserialize
- [ ] Transaction chứa side effect bên ngoài không rollback được
- [ ] Request tạo/thanh toán khi thử lại có thể lặp việc đã commit vì thiếu idempotency key

Hướng dẫn đầy đủ: [ruby.md](languages/ruby.md).

## Swift

Hướng dẫn đầy đủ: [swift.md](languages/swift.md).

- [ ] Force-unwrap (`!`) hoặc `try!` khi unwrap an toàn được
- [ ] Closure giữ `self` mạnh, thiếu `[weak self]` (retain cycle)
- [ ] Dùng kiểu tham chiếu (`class`) khi cần kiểu giá trị (`struct`)
- [ ] Nuốt lỗi thay vì truyền qua `throws` / `Result`
- [ ] Data race qua ranh giới đồng thời (thiếu `Sendable`, `@MainActor`, actor isolation)
- [ ] `Task {}` kiểu fire-and-forget, không bao giờ hủy hoặc bị rò rỉ
- [ ] Dùng `@ObservedObject` khi cần `@StateObject` để sở hữu
- [ ] Implicitly unwrapped optional (`var x: T!`) ngoài IBOutlet
- [ ] Quyền truy cập quá rộng (`public` / `open` khi `internal` là đủ)

## Dart / Flutter

Hướng dẫn đầy đủ: [dart.md](languages/dart.md).

- [ ] Thiếu `const` trên cây widget tĩnh, hoặc dùng helper `_buildFoo()` thay vì tách widget
- [ ] Dùng `!` / `as` / `late` không ràng buộc để né null safety
- [ ] Việc nặng (`jsonDecode`, xử lý ảnh, mã hóa) chạy trên UI isolate
- [ ] Tạo `Future` hoặc `Stream` bên trong `build` (instance mới mỗi lần rebuild)
- [ ] Dùng `setState` / `BuildContext` sau `await` mà không kiểm tra `mounted` / `context.mounted`
- [ ] `ref.watch` / `context.watch` trong callback; `read` trong `build` (hoặc ngược lại)
- [ ] `BlocProvider.value` / `ChangeNotifierProvider.value` nhận instance mới tạo trong `build` (dùng `create`; `value` không dispose)
- [ ] `BlocProvider(create: ...)` giữ `id` cũ: thiếu remount bằng `ValueKey(id)` hoặc nạp lại trong `didUpdateWidget` (`UniqueKey()` remount mỗi lần rebuild)
- [ ] `invokeMethod` của platform channel không xử lý `PlatformException`
- [ ] Phần tử danh sách giữ `State` thiếu `ValueKey` ổn định (hoặc dùng `UniqueKey()` trong `build`)
- [ ] `TextEditingController` / `AnimationController` / `StreamSubscription` không dispose

## C

- [ ] Tràn con trỏ/buffer (overflow hoặc underflow)
- [ ] Undefined behavior (use-after-free, double-free, deref null)
- [ ] Không xử lý lỗi sau cấp phát (`malloc` có thể trả `NULL`)
- [ ] Tràn số nguyên khi tính kích thước
- [ ] Rò rỉ tài nguyên (thiếu `free`, `fclose`...)
- [ ] Hàm/biến chỉ dùng trong file thiếu `static`

Hướng dẫn đầy đủ: [c.md](languages/c.md).

## C++

- [ ] Thiếu RAII wrapper cho tài nguyên
- [ ] Vi phạm Rule of 0/3/5 (destructor, copy, move)
- [ ] Lỗi exception safety (thiếu `noexcept` ở chỗ phù hợp)
- [ ] Dangling reference từ iterator hoặc reference trả về
- [ ] Sao chép thừa (thiếu `std::move` hoặc truyền tham chiếu)

Hướng dẫn đầy đủ: [cpp.md](languages/cpp.md).

## SQL

- [ ] Nối chuỗi để dựng truy vấn (nguy cơ SQL injection): dùng truy vấn tham số hóa
- [ ] Thiếu index trên cột dùng để lọc/join
- [ ] `SELECT *` thay vì liệt kê cột cần dùng
- [ ] Mẫu truy vấn N+1
- [ ] Thiếu `LIMIT` trên bảng lớn
- [ ] So sánh `NULL` sai (`IS NULL` với `= NULL`)
- [ ] Thiếu transaction cho các thao tác liên quan nhau
- [ ] Chọn sai kiểu JOIN
- [ ] Collation / phân biệt hoa thường khác nhau giữa các CSDL (mặc định MySQL khác Postgres)
- [ ] Sai ngày giờ và múi giờ (timestamp không múi giờ, `NOW()` theo giờ máy chủ, DST)

Phòng chống SQL injection: [sql-injection.md](sql-injection.md), [security.md](security.md).

## Thiết kế API

- [ ] Đặt tên resource không nhất quán
- [ ] Sai HTTP method (POST cho thao tác idempotent)
- [ ] Endpoint danh sách không phân trang
- [ ] Sai status code
- [ ] Thiếu rate limiting
- [ ] Thiếu validation và làm sạch dữ liệu vào
- [ ] Chỉ tin vào validation phía client

## Test

- [ ] Test chi tiết implementation thay vì hành vi
- [ ] Thiếu test cho điều kiện biên
- [ ] Test flaky (kết quả không ổn định)
- [ ] Test phụ thuộc dịch vụ bên ngoài (không mock)
- [ ] Thiếu test âm (trường hợp lỗi)
- [ ] Phần chuẩn bị test quá phức tạp

# C++

Dùng khi review code C++. File tập trung vào an toàn bộ nhớ, vòng đời object, thiết kế API, tính năng hiện đại và hiệu năng. Ví dụ giả định C++17/20/23.

## Quyền sở hữu và RAII

### Ưu tiên RAII và smart pointer

Dùng RAII để thể hiện quyền sở hữu. Mặc định dùng `std::unique_ptr`, chỉ dùng `std::shared_ptr` khi vòng đời thật sự chia sẻ.

```cpp
// ❌ Sai: new/delete thủ công kèm return sớm
Foo* make_foo() {
    Foo* foo = new Foo();
    if (!foo->Init()) {
        delete foo;
        return nullptr;
    }
    return foo;
}

// ✅ Đúng: RAII với unique_ptr
std::unique_ptr<Foo> make_foo() {
    auto foo = std::make_unique<Foo>();
    if (!foo->Init()) {
        return {};
    }
    return foo;
}
```

### Bọc tài nguyên C

```cpp
// ✅ Đúng: bọc FILE* bằng unique_ptr
using FilePtr = std::unique_ptr<FILE, decltype(&fclose)>;

FilePtr open_file(const char* path) {
    return FilePtr(fopen(path, "rb"), &fclose);
}
```

### Cách viết RAII đúng

```cpp
// ✅ Đúng: class RAII bọc file descriptor POSIX
class Fd {
    int fd_ = -1;
public:
    explicit Fd(int fd) : fd_(fd) {}
    ~Fd() { if (fd_ >= 0) ::close(fd_); }

    Fd(const Fd&) = delete;
    Fd& operator=(const Fd&) = delete;
    Fd(Fd&& o) noexcept : fd_(std::exchange(o.fd_, -1)) {}
    Fd& operator=(Fd&& o) noexcept {
        if (this != &o) {
            if (fd_ >= 0) ::close(fd_);
            fd_ = std::exchange(o.fd_, -1);
        }
        return *this;
    }

    int get() const { return fd_; }
    int release() { return std::exchange(fd_, -1); }
};
```

### Không trộn kiểu sở hữu

```cpp
// ❌ Sai: new thô + container chứa con trỏ thô, ai delete?
std::vector<Widget*> widgets;
widgets.push_back(new Widget());
// Khi nào gọi delete? Không rõ.

// ✅ Đúng: container chứa unique_ptr
std::vector<std::unique_ptr<Widget>> widgets;
widgets.push_back(std::make_unique<Widget>());
// Tự dọn khi vector bị hủy.
```

## Chọn smart pointer

### Bảng quyết định

| Tình huống | Con trỏ | Lý do |
|------------|---------|-------|
| Một chủ sở hữu | `unique_ptr` | Không tốn chi phí, sở hữu rõ ràng |
| Sở hữu chung (ít chủ) | `shared_ptr` | Đếm tham chiếu, refcount thread-safe |
| Quan sát không sở hữu | `weak_ptr` | Phá vòng tham chiếu, kiểm tra còn sống |
| Tham chiếu không bao giờ null | tham chiếu thô `T&` | Không sở hữu, không null được |
| Quan sát có thể null | con trỏ thô `T*` | Không sở hữu, có thể null |

### Không dùng shared_ptr khi unique_ptr là đủ

```cpp
// ❌ Sai: sở hữu chung không cần thiết
class Window {
    std::shared_ptr<Renderer> renderer_;
public:
    Window() : renderer_(std::make_shared<Renderer>()) {}
};

// ✅ Đúng: chủ duy nhất dùng unique_ptr
class Window {
    std::unique_ptr<Renderer> renderer_;
public:
    Window() : renderer_(std::make_unique<Renderer>()) {}
};
```

### Phá vòng tham chiếu bằng weak_ptr

```cpp
// ❌ Sai: vòng tham chiếu → rò rỉ bộ nhớ
struct Node {
    std::shared_ptr<Node> parent;
    std::shared_ptr<Node> child;
};

// ✅ Đúng: weak_ptr cho tham chiếu ngược
struct Node {
    std::weak_ptr<Node> parent;    // tham chiếu ngược, không sở hữu
    std::shared_ptr<Node> child;   // tham chiếu xuôi, sở hữu
};
```

## Vòng đời và tham chiếu

### Tránh tham chiếu và view treo

`std::string_view` và `std::span` không sở hữu dữ liệu. Bảo đảm chủ sở hữu sống lâu hơn view.

```cpp
// ❌ Sai: trả string_view tới object tạm
std::string_view bad_view() {
    std::string s = make_name();
    return s; // treo
}

// ✅ Đúng: trả string có sở hữu
std::string good_name() {
    return make_name();
}

// ✅ Đúng: view gắn với dữ liệu bên gọi sở hữu
std::string_view good_view(const std::string& s) {
    return s;
}
```

### Capture của lambda

```cpp
// ❌ Sai: capture tham chiếu rồi lambda thoát khỏi phạm vi
std::function<void()> make_task() {
    int value = 42;
    return [&]() { use(value); }; // treo
}

// ✅ Đúng: capture theo giá trị
std::function<void()> make_task() {
    int value = 42;
    return [value]() { use(value); };
}
```

### Bẫy kéo dài vòng đời object tạm

```cpp
// ❌ Sai: tham chiếu gắn vào object tạm đã bị hủy
const std::string& name = get_name();  // object tạm hủy cuối câu lệnh
use(name);  // tham chiếu treo

// ✅ Đúng: lưu giá trị
std::string name = get_name();
use(name);
```

## Ngữ nghĩa copy và move

### Quy tắc 0/3/5

Ưu tiên quy tắc 0 bằng cách dùng kiểu RAII. Nếu class sở hữu tài nguyên, tự định nghĩa hoặc xóa thao tác copy và move.

```cpp
// ❌ Sai: sở hữu thô với copy mặc định
struct Buffer {
    int* data;
    size_t size;
    explicit Buffer(size_t n) : data(new int[n]), size(n) {}
    ~Buffer() { delete[] data; }
    // copy ctor/assign sinh ngầm -> double delete
};

// ✅ Đúng: quy tắc 0 với std::vector
struct Buffer {
    std::vector<int> data;
    explicit Buffer(size_t n) : data(n) {}
};
```

### Xóa copy không mong muốn

```cpp
struct Socket {
    Socket() = default;
    ~Socket() { close(); }

    Socket(const Socket&) = delete;
    Socket& operator=(const Socket&) = delete;
    Socket(Socket&&) noexcept = default;
    Socket& operator=(Socket&&) noexcept = default;
};
```

### Dùng std::move tường minh

```cpp
// ❌ Sai: copy thay vì move
std::string name = get_name();
data_.push_back(name);  // copy

// ✅ Đúng: move khi không còn cần nguồn
std::string name = get_name();
data_.push_back(std::move(name));
```

## Đúng const và thiết kế API

### Dùng const và explicit

```cpp
class User {
public:
    const std::string& name() const { return name_; }
    void set_name(std::string name) { name_ = std::move(name); }

private:
    std::string name_;
};

struct Millis {
    explicit Millis(int v) : value(v) {}
    int value;
};
```

### Tránh object slicing

```cpp
struct Shape { virtual ~Shape() = default; };
struct Circle : Shape { void draw() const; };

// ❌ Sai: cắt Circle thành Shape
void draw(Shape shape);

// ✅ Đúng: truyền tham chiếu
void draw(const Shape& shape);
```

### Dùng override và final

```cpp
struct Base {
    virtual void run() = 0;
};

struct Worker final : Base {
    void run() override {}
};
```

## Xử lý lỗi và exception safety

### Ưu tiên RAII để dọn dẹp

```cpp
// ✅ Đúng: RAII dọn dẹp khi có exception
void process() {
    std::vector<int> data = load_data(); // dọn dẹp an toàn
    do_work(data);
}
```

### Không ném exception từ destructor

```cpp
struct File {
    ~File() noexcept { close(); }
    void close();
};
```

### Dùng kiểu kết quả cho lỗi thông thường

```cpp
// ✅ C++23: std::expected
#include <expected>

std::expected<int, ParseError> parse_int(std::string_view s) {
    try {
        return std::stoi(std::string(s));
    } catch (const std::invalid_argument&) {
        return std::unexpected(ParseError::InvalidFormat);
    } catch (const std::out_of_range&) {
        return std::unexpected(ParseError::OutOfRange);
    }
}

// ✅ Trước C++23: std::optional
std::optional<int> parse_int(const std::string& s) {
    try {
        return std::stoi(s);
    } catch (...) {
        return std::nullopt;
    }
}
```

### Các mức exception safety

- **Không ném (no-throw)**: `noexcept`, áp dụng cho destructor, swap, thao tác move.
- **Bảo đảm mạnh (strong)**: thao tác thành công hoặc trạng thái giữ nguyên. Dùng idiom copy-and-swap.
- **Bảo đảm cơ bản (basic)**: khi có exception, không rò rỉ tài nguyên, object ở trạng thái hợp lệ (có thể đã đổi).

```cpp
// ✅ Đúng: bảo đảm mạnh qua copy-and-swap
void Container::push_back(const Item& item) {
    Container tmp(*this);     // copy
    tmp.push_back_impl(item); // có thể ném, nhưng tmp chỉ là bản sao
    swap(*this, tmp);         // swap noexcept
}
```

## Tính năng C++20/23

### Concepts (C++20)

```cpp
// ❌ Sai: SFINAE rườm rà
template <typename T, std::enable_if_t<std::is_integral_v<T>, int> = 0>
T gcd(T a, T b) {
    while (b) { a %= b; std::swap(a, b); }
    return a;
}

// ✅ Đúng: concepts dễ đọc, ghép được
template <std::integral T>
T gcd(T a, T b) {
    while (b) { a %= b; std::swap(a, b); }
    return a;
}

// ✅ Tự định nghĩa concept
template <typename T>
concept Printable = requires(T t, std::ostream& os) {
    { os << t } -> std::convertible_to<std::ostream&>;
};

void log(const Printable auto& value) {
    std::cout << "[LOG] " << value << '\n';
}
```

### Ranges và views (C++20)

```cpp
#include <ranges>
#include <vector>
#include <numeric>

// ✅ Đúng: pipeline range ghép được
std::vector<int> scores = {85, 92, 67, 73, 98, 55};

auto top_scores = scores
    | std::views::filter([](int s) { return s >= 80; })
    | std::views::transform([](int s) { return s * 1.1; })  // cộng điểm
    | std::views::take(3);

// Duyệt mà không cấp phát container trung gian
for (double s : top_scores) {
    std::cout << s << ' ';
}
```

### Modules (C++20)

```cpp
// ✅ Đơn vị interface của module (math.cppm)
export module math;

export int add(int a, int b) { return a + b; }
export constexpr double pi = 3.14159265358979;

// ✅ Đơn vị implementation của module (math_impl.cpp)
module math;

int internal_helper() { /* không export */ }

// Bên dùng:
import math;
int result = add(1, 2);
```

📚 Công cụ hỗ trợ modules chưa ổn định. Kiểm tra hệ thống build (CMake 3.28+, MSVC 17.x, Clang 16+) có hỗ trợ trước khi áp dụng. Header vẫn là lựa chọn mặc định an toàn.

### Deducing this (C++23)

```cpp
// ❌ Sai: CRTP rườm rà cho đa hình tĩnh
template <typename Derived>
struct Base {
    void call() { static_cast<Derived*>(this)->impl(); }
};

// ✅ Đúng: tham số object tường minh của C++23
struct Widget {
    template <typename Self>
    void log(this Self&& self) {
        // self là Widget& hoặc Widget&& tùy ngữ cảnh gọi
        std::cout << self.name << '\n';
    }
    std::string name;
};
```

## constexpr và consteval

### Khi nào dùng constexpr, khi nào dùng consteval

- `constexpr`: tính được lúc biên dịch *hoặc* lúc chạy.
- `consteval`: **bắt buộc** tính lúc biên dịch (immediate function).

```cpp
// ✅ constexpr: tính lúc biên dịch khi được, ngược lại tính lúc chạy
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}

constexpr int c = factorial(5);  // lúc biên dịch
int r = factorial(argc);          // lúc chạy

// ✅ consteval: ép tính lúc biên dịch
consteval int forced_compiletime(int n) {
    return n * n;
}

constexpr int v = forced_compiletime(42);  // OK
// int v2 = forced_compiletime(argc);      // Lỗi: không phải biểu thức hằng
```

### Tính lúc biên dịch để tăng hiệu năng

```cpp
// ✅ Đúng: bảng tra sinh lúc biên dịch
constexpr auto make_crc_table() {
    std::array<uint32_t, 256> table{};
    for (uint32_t i = 0; i < 256; ++i) {
        uint32_t crc = i;
        for (int j = 0; j < 8; ++j) {
            crc = (crc >> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
        table[i] = crc;
    }
    return table;
}

static constexpr auto crc_table = make_crc_table();

// Dùng lúc chạy, không tốn chi phí khởi tạo
uint32_t crc32(const uint8_t* data, size_t len) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc = (crc >> 8) ^ crc_table[(crc ^ data[i]) & 0xFF];
    }
    return ~crc;
}
```

### constinit để bảo đảm khởi tạo tĩnh

```cpp
// ✅ Đúng: tránh lỗi thứ tự khởi tạo tĩnh (static initialization order fiasco)
constinit int global_counter = 0;  // bảo đảm khởi tạo tĩnh, không động
```

## Đồng thời

### Bảo vệ dữ liệu chia sẻ

```cpp
// ❌ Sai: data race
int counter = 0;
void inc() { counter++; }

// ✅ Đúng: atomic
std::atomic<int> counter{0};
void inc() { counter.fetch_add(1, std::memory_order_relaxed); }
```

### Dùng lock RAII

```cpp
std::mutex mu;
std::vector<int> data;

void add(int v) {
    std::lock_guard<std::mutex> lock(mu);
    data.push_back(v);
}
```

### Ưu tiên std::jthread thay std::thread (C++20)

```cpp
// ❌ Sai: std::thread phải join thủ công
void run() {
    std::thread t([]{ do_work(); });
    // quên join → std::terminate
}

// ✅ Đúng: jthread tự join khi hủy
void run() {
    std::jthread t([](std::stop_token st) {
        while (!st.stop_requested()) {
            do_work();
        }
    });
    // tự join; stop token cho phép hủy hợp tác
}
```

### Structured concurrency với std::execution (C++26)

Tới C++23, dùng `std::jthread` kèm `std::stop_token` để hủy hợp tác. Thư viện `std::execution` (P2300) dự kiến có trong C++26.

## Hiệu năng và cấp phát

### Tránh cấp phát lặp lại

```cpp
// ❌ Sai: cấp phát lại nhiều lần
std::vector<int> build(int n) {
    std::vector<int> out;
    for (int i = 0; i < n; ++i) {
        out.push_back(i);
    }
    return out;
}

// ✅ Đúng: reserve trước
std::vector<int> build(int n) {
    std::vector<int> out;
    out.reserve(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i) {
        out.push_back(i);
    }
    return out;
}
```

### Nối chuỗi

```cpp
// ❌ Sai: cấp phát lặp lại
std::string join(const std::vector<std::string>& parts) {
    std::string out;
    for (const auto& p : parts) {
        out += p;
    }
    return out;
}

// ✅ Đúng: reserve tổng kích thước
std::string join(const std::vector<std::string>& parts) {
    size_t total = 0;
    for (const auto& p : parts) {
        total += p.size();
    }
    std::string out;
    out.reserve(total);
    for (const auto& p : parts) {
        out += p;
    }
    return out;
}
```

### Small Buffer Optimization (SBO)

```cpp
// ✅ Đúng: tránh heap cho dữ liệu nhỏ
void process(const char* name) {
    // Tên ngắn dùng stack, chỉ tên dài mới dùng heap
    std::string buf;
    buf.reserve(64);  // thường vẫn nằm trên stack nhờ SSO
    buf = name;
    // ...
}
```

### Dùng std::span cho view không copy

```cpp
// ❌ Sai: copy vector
void process(std::vector<int> data);

// ✅ Đúng: view không sở hữu, dùng được với vector, array, mảng C
void process(std::span<const int> data);

std::vector<int> v = {1, 2, 3};
process(v);             // không copy
int arr[] = {4, 5, 6};
process(arr);           // không copy
```

## Template và an toàn kiểu

### Ưu tiên template có ràng buộc (C++20)

```cpp
// ❌ Sai: quá chung chung
template <typename T>
T add(T a, T b) {
    return a + b;
}

// ✅ Đúng: có ràng buộc
template <typename T>
requires std::is_integral_v<T>
T add(T a, T b) {
    return a + b;
}
```

### Dùng static_assert cho bất biến

```cpp
template <typename T>
struct Packet {
    static_assert(std::is_trivially_copyable_v<T>,
        "Packet payload must be trivially copyable");
    T payload;
};
```

### Tránh code bloat do template

```cpp
// ❌ Sai: khởi tạo toàn bộ template cho mỗi T dù chỉ một method khác nhau
template <typename T>
class Service {
    void connect() { /* 100 dòng code giống hệt nhau */ }
    void process(T item) { /* riêng theo kiểu */ }
};

// ✅ Đúng: tách code không phụ thuộc kiểu ra class cơ sở không template
class ServiceBase {
protected:
    void connect() { /* 100 dòng code dùng chung */ }
};

template <typename T>
class Service : public ServiceBase {
    void process(T item) { /* riêng theo kiểu */ }
};
```

## Test

### Chọn framework

| Framework | Hợp với |
|-----------|---------|
| **Google Test (GTest)** | Dự án lớn, CI, tích hợp GMock |
| **Catch2** | Chỉ header, kiểu BDD, C++ hiện đại |
| **doctest** | Nhẹ, một header, biên dịch nhanh |

### Google Test cơ bản

```cpp
#include <gtest/gtest.h>
#include "parser.h"

TEST(ParserTest, EmptyInputReturnsNull) {
    auto token = parse("");
    EXPECT_EQ(token, nullptr);
}

TEST(ParserTest, ValidInteger) {
    auto token = parse("42");
    ASSERT_NE(token, nullptr);
    EXPECT_EQ(token->type, TokenType::Int);
    EXPECT_EQ(token->value, 42);
}

TEST(ParserTest, NegativeNumber) {
    auto token = parse("-7");
    ASSERT_NE(token, nullptr);
    EXPECT_EQ(token->value, -7);
}
```

### Test fixture

```cpp
class DatabaseTest : public ::testing::Test {
protected:
    void SetUp() override {
        db_ = std::make_unique<Database>(":memory:");
        db_->execute("CREATE TABLE users (id INTEGER, name TEXT)");
    }

    void TearDown() override {
        db_.reset();
    }

    std::unique_ptr<Database> db_;
};

TEST_F(DatabaseTest, InsertAndQuery) {
    db_->execute("INSERT INTO users VALUES (1, 'Alice')");
    auto rows = db_->query("SELECT * FROM users");
    ASSERT_EQ(rows.size(), 1);
    EXPECT_EQ(rows[0].get<std::string>("name"), "Alice");
}

TEST_F(DatabaseTest, EmptyTableReturnsNoRows) {
    auto rows = db_->query("SELECT * FROM users");
    EXPECT_TRUE(rows.empty());
}
```

### Mock bằng GMock

```cpp
#include <gmock/gmock.h>

class HttpClient {
public:
    virtual ~HttpClient() = default;
    virtual HttpResponse get(const std::string& url) = 0;
};

class MockHttpClient : public HttpClient {
public:
    MOCK_METHOD(HttpResponse, get, (const std::string& url), (override));
};

TEST(UserServiceTest, FetchesUserProfile) {
    MockHttpClient client;
    EXPECT_CALL(client, get("https://api.example.com/user/1"))
        .WillOnce(Return(HttpResponse{200, R"({"name":"Alice"})"}));

    UserService svc(&client);
    auto profile = svc.get_profile(1);
    EXPECT_EQ(profile.name, "Alice");
}
```

### Test exception safety

```cpp
TEST(AllocatorTest, ThrowsOnOverflow) {
    EXPECT_THROW(allocate(SIZE_MAX), std::bad_alloc);
}

TEST(AllocatorTest, NoLeakOnException) {
    // Chạy với ASan để xác nhận không rò rỉ khi ném exception
    try {
        auto buf = allocate(1024);
        throw std::runtime_error("simulated failure");
    } catch (...) {
        // ASan bắt mọi rò rỉ
    }
}
```

## Công cụ và kiểm tra khi build

```bash
# Cảnh báo
clang++ -Wall -Wextra -Werror -Wconversion -Wshadow -std=c++20 ...

# Sanitizer (bản debug)
clang++ -fsanitize=address,undefined -fno-omit-frame-pointer -g ...
clang++ -fsanitize=thread -fno-omit-frame-pointer -g ...

# Phân tích tĩnh
clang-tidy src/*.cpp -- -std=c++20

# Format
clang-format -i src/*.cpp include/*.h
```

### Cờ biên dịch nên dùng cho an toàn

```bash
# Chế độ nghiêm cho code mới
clang++ -std=c++20 -Wall -Wextra -Werror -Wshadow -Wconversion \
        -Wsign-conversion -Wold-style-cast -Wnon-virtual-dtor \
        -Woverloaded-virtual -Wnull-dereference -Wformat=2 \
        -fsanitize=address,undefined -fno-omit-frame-pointer
```

## Checklist

### An toàn và vòng đời

- [ ] Quyền sở hữu tường minh (RAII, mặc định `unique_ptr`)
- [ ] Không có tham chiếu hoặc view treo
- [ ] Kiểu sở hữu tài nguyên tuân thủ quy tắc 0/3/5
- [ ] Không có `new`/`delete` thô trong logic nghiệp vụ
- [ ] Destructor là `noexcept` và không ném exception
- [ ] Loại smart pointer khớp ngữ nghĩa sở hữu (unique, shared, weak)
- [ ] Không có vòng `shared_ptr` (dùng `weak_ptr` cho tham chiếu ngược)

### API và thiết kế

- [ ] Áp dụng `const` nhất quán
- [ ] Constructor có `explicit` khi cần
- [ ] Hàm ảo dùng `override`/`final`
- [ ] Không có object slicing (truyền tham chiếu hoặc con trỏ)
- [ ] Concepts ràng buộc tham số template (C++20)

### Tính năng hiện đại

- [ ] Dùng `constexpr` cho tính toán lúc biên dịch khi có lợi
- [ ] Ưu tiên ranges thay vòng lặp thủ công cho pipeline dữ liệu (C++20)
- [ ] Code mới ưu tiên `std::jthread` thay `std::thread` (C++20)
- [ ] Dùng `std::expected` để xử lý lỗi (C++23) khi có

### Đồng thời

- [ ] Dữ liệu chia sẻ được bảo vệ (mutex hoặc atomic)
- [ ] Thứ tự lấy lock nhất quán
- [ ] Không chặn khi đang giữ lock

### Hiệu năng

- [ ] Tránh cấp phát thừa (`reserve`, move, `span`)
- [ ] Tránh copy trên hot path
- [ ] Độ phức tạp thuật toán hợp lý

### Test và công cụ

- [ ] Unit test phủ nhánh thành công, nhánh lỗi và điều kiện biên
- [ ] Build sạch khi bật cảnh báo
- [ ] Chạy sanitizer trên đường code quan trọng
- [ ] Đã xử lý kết quả phân tích tĩnh (clang-tidy)

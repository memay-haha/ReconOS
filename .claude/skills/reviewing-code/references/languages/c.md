# C

Dùng khi review code C. File tập trung vào an toàn bộ nhớ, hành vi không xác định (UB, undefined behavior), tính di động, test và lập trình an toàn. Ví dụ giả định C11/C17.

## An toàn con trỏ và buffer

### Luôn truyền kích thước kèm buffer

```c
// ❌ Sai: bỏ qua kích thước đích
bool copy_name(char *dst, size_t dst_size, const char *src) {
    strcpy(dst, src);
    return true;
}

// ✅ Đúng: kiểm tra kích thước và kết thúc chuỗi
bool copy_name(char *dst, size_t dst_size, const char *src) {
    size_t len = strlen(src);
    if (len + 1 > dst_size) {
        return false;
    }
    memcpy(dst, src, len + 1);
    return true;
}
```

### Tránh API nguy hiểm

Dùng `snprintf`, `fgets` và giới hạn tường minh thay cho `gets`, `strcpy`, `sprintf`.

```c
// ❌ Sai: ghi không giới hạn
sprintf(buf, "%s", input);

// ✅ Đúng: ghi có giới hạn
snprintf(buf, buf_size, "%s", input);
```

### Chọn đúng hàm sao chép

```c
// ❌ Sai: memcpy với vùng nhớ chồng lấn
memcpy(dst, src, len);

// ✅ Đúng: memmove xử lý được chồng lấn
memmove(dst, src, len);
```

### Kiểm tra đối số con trỏ

```c
// ❌ Sai: không kiểm tra NULL
int process(char *buf, size_t len) {
    buf[0] = '\0';
    return 0;
}

// ✅ Đúng: kiểm tra trước khi dùng
int process(char *buf, size_t len) {
    if (!buf || len == 0) {
        return -EINVAL;
    }
    buf[0] = '\0';
    return 0;
}
```

### Cẩn thận với con trỏ tới con trỏ

```c
// ❌ Sai: bên gọi không phân biệt được thành công hay thất bại
void allocate(int **out) {
    *out = malloc(sizeof(int));
}

// ✅ Đúng: trả mã trạng thái, chỉ gán đầu ra khi thành công
int allocate(int **out) {
    if (!out) return -EINVAL;
    int *p = malloc(sizeof(int));
    if (!p) return -ENOMEM;
    *out = p;
    return 0;
}
```

## Quyền sở hữu và quản lý tài nguyên

### Một lần cấp phát, một lần giải phóng

Theo dõi quyền sở hữu và dọn dẹp trên mọi nhánh lỗi.

```c
// ✅ Đúng: nhãn cleanup tránh rò rỉ
int load_file(const char *path) {
    int rc = -1;
    FILE *f = NULL;
    char *buf = NULL;

    f = fopen(path, "rb");
    if (!f) {
        goto cleanup;
    }
    buf = malloc(4096);
    if (!buf) {
        goto cleanup;
    }

    if (fread(buf, 1, 4096, f) == 0) {
        goto cleanup;
    }

    rc = 0;

cleanup:
    free(buf);
    if (f) {
        fclose(f);
    }
    return rc;
}
```

### Ghi rõ việc chuyển quyền sở hữu

```c
// ✅ Đúng: comment nói rõ bên gọi nhận quyền sở hữu
// Bên gọi phải free() buffer trả về.
char *read_line(FILE *f);

// ✅ Đúng: comment nói rõ hàm không nhận quyền sở hữu
// Hàm chỉ mượn `buf`; bên gọi giữ quyền sở hữu.
int parse_header(const char *buf, size_t len, struct Header *out);
```

### Giải phóng đúng một lần, gán NULL sau đó

```c
// ❌ Sai: có thể double free
void destroy(struct Cache *c) {
    free(c->entries);
    // bên gọi có thể gọi destroy() lần nữa → double free
}

// ✅ Đúng: gán NULL sau free để chặn double free
void destroy(struct Cache *c) {
    if (!c) return;
    free(c->entries);
    c->entries = NULL;
    c->count = 0;
}
```

## Bẫy hành vi không xác định

### Tràn số nguyên có dấu

Tràn số có dấu là UB trong C; số không dấu thì quay vòng.

```c
// ❌ Sai: tràn số có dấu là UB
int sum = INT_MAX + 1;  // hành vi không xác định

// ✅ Đúng: kiểm tra trước khi tràn
if (a > 0 && b > INT_MAX - a) {
    return -EOVERFLOW;
}
int sum = a + b;
```

### Con trỏ treo (dangling pointer)

```c
// ❌ Sai: trả con trỏ tới mảng cục bộ
char *greet(void) {
    char buf[64];
    snprintf(buf, sizeof(buf), "hello");
    return buf;  // UB: buf mất khi hàm trả về
}

// ✅ Đúng: bên gọi cấp buffer, hoặc dùng vùng nhớ tĩnh
void greet(char *out, size_t out_size) {
    snprintf(out, out_size, "hello");
}
```

### Biến chưa khởi tạo

```c
// ❌ Sai: x có thể mang giá trị bất kỳ
int x;
if (x > 0) { /* UB: đọc biến tự động chưa khởi tạo */ }

// ✅ Đúng: luôn khởi tạo
int x = 0;
if (x > 0) { /* xác định rõ */ }
```

### Vi phạm sequence point

```c
// ❌ Sai: không xác định thứ tự tính toán toán hạng
int i = 0;
int a[] = { i++, i++ };  // UB: sửa hai lần không có sequence point

// ❌ Sai: vừa sửa vừa đọc không có sequence point
int j = i + i++;  // UB

// ✅ Đúng: tách thành câu lệnh riêng
int a0 = i++;
int a1 = i++;
int a[] = { a0, a1 };
```

### Vi phạm strict aliasing

```c
// ❌ Sai: vi phạm strict aliasing
float f = 3.14f;
int i = *(int *)&f;  // UB

// ✅ Đúng: dùng memcpy hoặc union (C11 cho phép type-punning qua union)
int i;
memcpy(&i, &f, sizeof(i));

// ✅ Cũng chấp nhận được trong C11:
union { float f; int i; } u;
u.f = 3.14f;
int i = u.i;
```

### Phép dịch bit

```c
// ❌ Sai: dịch số âm hoặc >= độ rộng kiểu là UB
int x = 1 << 32;     // UB nếu int 32-bit
int y = 1 << -1;     // UB

// ✅ Đúng: kiểm tra số bit dịch
if (shift >= 0 && shift < (int)(sizeof(int) * CHAR_BIT)) {
    int result = 1 << shift;
}
```

## Kiểu số nguyên và tràn số

### Tránh bất ngờ giữa có dấu và không dấu

```c
// ❌ Sai: số âm chuyển thành size_t rất lớn
int len = -1;
size_t n = len;  // quay vòng thành SIZE_MAX

// ✅ Đúng: kiểm tra trước khi chuyển
if (len < 0) {
    return -1;
}
size_t n = (size_t)len;
```

### Kiểm tra tràn khi tính kích thước

```c
// ❌ Sai: phép nhân có thể tràn
size_t bytes = count * sizeof(Item);

// ✅ Đúng: kiểm tra trước khi nhân
if (count > SIZE_MAX / sizeof(Item)) {
    return NULL;
}
size_t bytes = count * sizeof(Item);
```

### Dùng kiểu độ rộng cố định cho giao thức nhị phân

```c
// ❌ Sai: kích thước int thay đổi theo nền tảng
struct PacketHeader {
    int type;
    int length;
};

// ✅ Đúng: độ rộng tường minh cho định dạng truyền
#include <stdint.h>
struct PacketHeader {
    uint32_t type;
    uint32_t length;
};
```

### Cẩn thận với nâng kiểu ngầm

```c
// ❌ Sai: uint8_t nâng lên int khi tính, rồi bị cắt
uint8_t a = 200, b = 100;
uint8_t sum = a + b;  // cắt: 300 → 44

// ✅ Đúng: ghi rõ độ rộng
uint16_t sum = (uint16_t)a + (uint16_t)b;  // 300
```

## Xử lý lỗi

### Luôn kiểm tra giá trị trả về

```c
// ❌ Sai: bỏ qua lỗi
fread(buf, 1, size, f);

// ✅ Đúng: xử lý lỗi
size_t read = fread(buf, 1, size, f);
if (read != size && ferror(f)) {
    return -1;
}
```

### Contract lỗi nhất quán

- Dùng một quy ước rõ ràng: 0 là thành công, số âm là thất bại.
- Ghi rõ quy tắc sở hữu khi thành công và khi thất bại.
- Nếu dùng `errno`, chỉ gán khi thật sự thất bại.

```c
// ✅ Đúng: contract lỗi rõ ràng kèm errno
// Trả 0 khi thành công, -1 khi thất bại (gán errno).
// Khi thất bại, *out giữ nguyên.
int parse_int(const char *s, int *out);
```

### Không dựa vào errno qua nhiều lời gọi hàm

```c
// ❌ Sai: errno có thể bị lời gọi trung gian ghi đè
errno = 0;
long val = strtol(s, &end, 10);
log_debug("parsed: %ld", val);  // có thể đổi errno!
if (errno != 0) { /* không tin cậy */ }

// ✅ Đúng: lưu errno ngay
errno = 0;
long val = strtol(s, &end, 10);
int saved_errno = errno;
log_debug("parsed: %ld", val);
if (saved_errno != 0) { /* tin cậy */ }
```

## Đồng thời

### volatile không phải cơ chế đồng bộ

```c
// ❌ Sai: data race
volatile int stop = 0;
void worker(void) {
    while (!stop) { /* ... */ }
}

// ✅ Đúng: atomic của C11
_Atomic int stop = 0;
void worker(void) {
    while (!atomic_load(&stop)) { /* ... */ }
}
```

### Dùng mutex cho trạng thái chia sẻ

Bảo vệ dữ liệu chia sẻ bằng `pthread_mutex_t` hoặc tương đương. Không giữ lock khi làm I/O.

```c
// ✅ Đúng: mutex với lock/unlock thành cặp
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static int g_counter = 0;

void increment(void) {
    pthread_mutex_lock(&g_lock);
    g_counter++;
    pthread_mutex_unlock(&g_lock);
}
```

### Tránh lỗi thứ tự lock

```c
// ❌ Sai: thứ tự lock không nhất quán → deadlock
// Thread 1: lock(A); lock(B);
// Thread 2: lock(B); lock(A);

// ✅ Đúng: luôn lấy lock theo cùng một thứ tự
// Mọi thread: lock(A); lock(B);
```

## Macro và tiền xử lý

### Đặt đối số trong ngoặc, cẩn thận side effect

```c
// ❌ Sai: macro gây side effect
#define MIN(a, b) ((a) < (b) ? (a) : (b))
int x = MIN(i++, j++);  // đối số bị tính hai lần

// ✅ Đúng: dùng hàm static inline
static inline int min_int(int a, int b) {
    return a < b ? a : b;
}
```

### Macro nhiều câu lệnh

```c
// ❌ Sai: hỏng khi đặt trong if-else không có ngoặc nhọn
#define LOG_AND_RETURN(msg) \
    fprintf(stderr, "%s\n", msg); \
    return -1

// ✅ Đúng: idiom do { ... } while(0)
#define LOG_AND_RETURN(msg) do { \
    fprintf(stderr, "%s\n", msg); \
    return -1; \
} while (0)
```

### Include guard

```c
// ✅ Đúng: include guard truyền thống
#ifndef MY_HEADER_H
#define MY_HEADER_H
// ... khai báo ...
#endif /* MY_HEADER_H */

// ✅ Cũng chấp nhận được (không chuẩn nhưng được hỗ trợ rộng):
#pragma once
```

## Thiết kế API và const

### Đúng const và có kích thước

```c
// ✅ Đúng: kích thước tường minh và đầu vào là const
int hash_bytes(const uint8_t *data, size_t len, uint8_t *out);
```

### Ghi rõ con trỏ có được NULL không

Ghi rõ con trỏ nào được phép NULL. Khi có thể, trả mã lỗi thay vì trả NULL.

```c
// ✅ Đúng: ghi contract trong header
// @param name  Khác NULL, chuỗi kết thúc bằng NUL.
// @param out   Con trỏ đầu ra khác NULL.
// @return 0 khi thành công, -EINVAL nếu name hoặc out là NULL.
int lookup(const char *name, struct Result *out);
```

### Kiểu mờ (opaque type) để đóng gói

```c
// ✅ Đúng: header chỉ lộ con trỏ
typedef struct Parser Parser;

Parser *parser_create(const char *input);
int parser_next(Parser *p, struct Token *out);
void parser_destroy(Parser *p);
```

## Lập trình an toàn

Các lỗi trong mục này thường là P0: tràn buffer, format string, TOCTOU dẫn tới lỗ hổng bảo mật.

### CERT C: chống tràn buffer

```c
// ❌ Sai: strncpy không bảo đảm kết thúc bằng NUL
char dst[32];
strncpy(dst, src, sizeof(dst));  // src >= 32 byte thì dst không có NUL!

// ✅ Đúng: tự thêm NUL sau strncpy
char dst[32];
strncpy(dst, src, sizeof(dst) - 1);
dst[sizeof(dst) - 1] = '\0';

// ✅ Tốt hơn: dùng snprintf để sao chép chuỗi có giới hạn
char dst[32];
snprintf(dst, sizeof(dst), "%s", src);
```

### Lỗ hổng format string

```c
// ❌ Sai: người dùng kiểm soát format string
printf(user_input);  // user_input = "%x %x %x" thì đọc được stack

// ✅ Đúng: luôn dùng format literal
printf("%s", user_input);
```

### Tràn số nguyên khi cấp phát

```c
// ❌ Sai: count * size có thể tràn trước khi tới malloc
void *items = malloc(count * sizeof(Item));

// ✅ Đúng: kiểm tra tràn
if (count != 0 && SIZE_MAX / count < sizeof(Item)) {
    errno = ENOMEM;
    return NULL;
}
void *items = malloc(count * sizeof(Item));

// ✅ Cũng đúng: dùng calloc (tự kiểm tra bên trong)
Item *items = calloc(count, sizeof(Item));
```

### Kiểm tra độ dài từ đầu vào bên ngoài

```c
// ❌ Sai: tin độ dài khai báo trong header
struct Msg { uint32_t len; char data[]; };
void handle(struct Msg *m) {
    char buf[256];
    memcpy(buf, m->data, m->len);  // kẻ tấn công kiểm soát m->len
}

// ✅ Đúng: kiểm tra trước khi dùng
int handle(struct Msg *m, size_t total_size) {
    if (m->len > total_size - sizeof(struct Msg)) {
        return -EINVAL;
    }
    char buf[256];
    if (m->len > sizeof(buf)) {
        return -E2BIG;
    }
    memcpy(buf, m->data, m->len);
    return 0;
}
```

### Tránh race TOCTOU

```c
// ❌ Sai: kiểm tra rồi mới dùng là race (TOCTOU)
if (access(path, R_OK) == 0) {
    FILE *f = fopen(path, "r");  // file có thể đổi giữa access() và fopen()
}

// ✅ Đúng: thử mở rồi kiểm tra kết quả
FILE *f = fopen(path, "r");
if (!f) {
    // xử lý lỗi (ENOENT, EACCES...)
}
```

### File tạm an toàn

```c
// ❌ Sai: tên đoán trước được
char path[] = "/tmp/myapp_XXXXXX";
FILE *f = fopen(path, "w");  // đoán được tên, có race

// ✅ Đúng: mkstemp tạo và mở nguyên tử
char tmpl[] = "/tmp/myapp_XXXXXX";
int fd = mkstemp(tmpl);
if (fd < 0) { /* xử lý lỗi */ }
FILE *f = fdopen(fd, "w");
```

## Tính di động đa nền tảng

### Điều kiện tiền xử lý

```c
// ❌ Sai: #ifdef lồng nhau rối rắm
#ifdef _WIN32
    #ifdef _WIN64
        // Windows 64-bit
    #else
        // Windows 32-bit
    #endif
#else
    #ifdef __linux__
        // Linux
    #endif
#endif

// ✅ Đúng: trừu tượng hóa sau macro nền tảng
#if defined(PLATFORM_WINDOWS)
    #include "platform_win.h"
#elif defined(PLATFORM_LINUX)
    #include "platform_linux.h"
#elif defined(PLATFORM_MACOS)
    #include "platform_macos.h"
#else
    #error "Unsupported platform"
#endif
```

### Thứ tự byte (endianness)

```c
// ❌ Sai: giả định little-endian
uint32_t read_u32(const uint8_t *buf) {
    return *(const uint32_t *)buf;  // lỗi căn lề và endianness
}

// ✅ Đúng: xử lý thứ tự byte tường minh
static inline uint32_t read_u32_le(const uint8_t *buf) {
    return (uint32_t)buf[0]
         | ((uint32_t)buf[1] << 8)
         | ((uint32_t)buf[2] << 16)
         | ((uint32_t)buf[3] << 24);
}

static inline uint32_t read_u32_be(const uint8_t *buf) {
    return ((uint32_t)buf[0] << 24)
         | ((uint32_t)buf[1] << 16)
         | ((uint32_t)buf[2] << 8)
         | (uint32_t)buf[3];
}
```

### Truy cập có tính tới căn lề

```c
// ❌ Sai: truy cập lệch căn lề là UB trên nhiều kiến trúc
uint32_t val = *(const uint32_t *)ptr;

// ✅ Đúng: memcpy an toàn với mọi căn lề
uint32_t val;
memcpy(&val, ptr, sizeof(val));
```

### Tránh phần mở rộng riêng nền tảng trong code di động

```c
// ❌ Sai: phần mở rộng GCC trong code dùng chung
typeof(x) y = x;

// ✅ Đúng: dùng C chuẩn hoặc cô lập phần mở rộng
// Trong header riêng nền tảng:
#ifdef __GNUC__
    #define TYPEOF(x) typeof(x)
#else
    #define TYPEOF(x) decltype(x)  /* C++23 hoặc riêng trình biên dịch */
#endif
```

### Phát hiện tính năng, không phát hiện nền tảng

```c
// ❌ Sai: giả định có POSIX vì là Linux
#ifdef __linux__
    #include <sys/mman.h>
#endif

// ✅ Đúng: kiểm tra tính năng qua CMake/configure
#ifdef HAVE_MMAP
    #include <sys/mman.h>
#endif
```

## Test

### Chọn framework test

| Framework | Dùng cho | Ghi chú |
|-----------|----------|---------|
| **Unity** | Nhúng, bare-metal | Một file, không phụ thuộc, tương thích C89 |
| **CUnit** | Desktop, CI | Assertion phong phú hơn, xuất HTML/XML |
| **CMocka** | Code mức hệ thống | Mock qua con trỏ hàm, chạy được với `setjmp`/`longjmp` |

### Cấu trúc test cơ bản với Unity

```c
#include "unity.h"
#include "parser.h"

void setUp(void) { /* chạy trước mỗi test */ }
void tearDown(void) { /* chạy sau mỗi test */ }

void test_parse_empty_string_returns_null(void) {
    struct Token *t = parse("");
    TEST_ASSERT_NULL(t);
}

void test_parse_valid_integer(void) {
    struct Token *t = parse("42");
    TEST_ASSERT_NOT_NULL(t);
    TEST_ASSERT_EQUAL_INT(TOKEN_INT, t->type);
    TEST_ASSERT_EQUAL_INT(42, t->value);
    token_free(t);
}

void test_parse_negative_number(void) {
    struct Token *t = parse("-7");
    TEST_ASSERT_NOT_NULL(t);
    TEST_ASSERT_EQUAL_INT(-7, t->value);
    token_free(t);
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_parse_empty_string_returns_null);
    RUN_TEST(test_parse_valid_integer);
    RUN_TEST(test_parse_negative_number);
    return UNITY_END();
}
```

### Cô lập test: mock lời gọi hệ thống

```c
// ✅ Đúng: inject phụ thuộc để test được
// Mã production:
struct FileOps {
    int (*read)(void *buf, size_t size, void *ctx);
    void *ctx;
};

int load_config(const struct FileOps *ops, struct Config *out);

// Mã test:
static int mock_read(void *buf, size_t size, void *ctx) {
    const char *data = (const char *)ctx;
    size_t len = strlen(data);
    if (len < size) size = len;
    memcpy(buf, data, size);
    return (int)size;
}

void test_load_config_with_mock(void) {
    const char *fake_data = "key=value\n";
    struct FileOps ops = { .read = mock_read, .ctx = (void *)fake_data };
    struct Config cfg;
    int rc = load_config(&ops, &cfg);
    TEST_ASSERT_EQUAL_INT(0, rc);
    TEST_ASSERT_EQUAL_STRING("value", cfg.key);
}
```

### Kiểm tra rò rỉ bộ nhớ bằng sanitizer

```bash
# Chạy test với AddressSanitizer
cc -fsanitize=address -fno-omit-frame-pointer -g -o test_runner tests/*.c src/*.c
./test_runner

# Chạy test với Valgrind
cc -g -O0 -o test_runner tests/*.c src/*.c
valgrind --leak-check=full --error-exitcode=1 ./test_runner
```

```c
// ✅ Đúng: test để chắc nhánh lỗi không rò rỉ
void test_parse_invalid_frees_resources(void) {
    // Valgrind/ASan bắt mọi rò rỉ từ lời gọi này
    struct Token *t = parse("not_a_number");
    TEST_ASSERT_NULL(t);
    // Nếu parse() cấp phát trạng thái nội bộ mà quên free khi lỗi,
    // sanitizer sẽ báo.
}
```

### Test điều kiện biên có hệ thống

```c
void test_edge_cases(void) {
    // Input độ dài 0
    TEST_ASSERT_EQUAL_INT(-EINVAL, process(NULL, 0));

    // Input hợp lệ lớn nhất
    char buf[256];
    memset(buf, 'a', sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';
    TEST_ASSERT_EQUAL_INT(0, process(buf, sizeof(buf) - 1));

    // Vượt giới hạn một byte
    TEST_ASSERT_EQUAL_INT(-E2BIG, process(buf, sizeof(buf)));
}
```

## Công cụ và kiểm tra khi build

```bash
# Cảnh báo
clang -Wall -Wextra -Werror -Wconversion -Wshadow -std=c11 ...

# Sanitizer (bản debug)
clang -fsanitize=address,undefined -fno-omit-frame-pointer -g ...
clang -fsanitize=thread -fno-omit-frame-pointer -g ...

# Phân tích tĩnh
clang-tidy src/*.c -- -std=c11
cppcheck --enable=warning,performance,portability src/

# Format
clang-format -i src/*.c include/*.h
```

### Pipeline CI

```bash
# Pipeline CI điển hình cho dự án C
clang -Wall -Wextra -Werror -std=c11 -c src/*.c        # biên dịch với cảnh báo nghiêm
clang -fsanitize=address,undefined -g -o test test/*.c src/*.c  # bản build có sanitizer
./test                                                   # chạy test
valgrind --leak-check=full --error-exitcode=1 ./test    # kiểm tra bộ nhớ
cppcheck --error-exitcode=1 --enable=all src/            # phân tích tĩnh
```

## Checklist

### Bộ nhớ và UB

- [ ] Mọi buffer có tham số kích thước tường minh
- [ ] Không truy cập ngoài ranh giới, không tính con trỏ vượt quá object
- [ ] Không use-after-free, không đọc biến chưa khởi tạo
- [ ] Tuân thủ quy tắc tràn số có dấu và phép dịch bit
- [ ] Tuân thủ strict aliasing
- [ ] Tuân thủ quy tắc sequence point

### Lập trình an toàn

- [ ] Không có lỗ hổng format string (đầu vào người dùng không làm format)
- [ ] Kích thước cấp phát có kiểm tra tràn (`count * size`)
- [ ] Không có race TOCTOU khi thao tác file
- [ ] Độ dài từ đầu vào bên ngoài được kiểm tra trước khi dùng
- [ ] File tạm dùng `mkstemp` hoặc tương đương

### API và thiết kế

- [ ] Quy tắc sở hữu được ghi rõ và nhất quán
- [ ] Input áp dụng đúng `const`
- [ ] Contract lỗi rõ ràng và nhất quán
- [ ] Ghi rõ con trỏ nào được NULL
- [ ] Dùng kiểu mờ để đóng gói

### Tính di động

- [ ] Không truy cập bộ nhớ lệch căn lề
- [ ] Xử lý thứ tự byte tường minh cho định dạng truyền và nhị phân
- [ ] Giao thức nhị phân dùng kiểu độ rộng cố định
- [ ] Code riêng nền tảng cô lập sau macro tính năng

### Đồng thời

- [ ] Không có data race trên trạng thái chia sẻ
- [ ] Không dùng `volatile` để đồng bộ
- [ ] Giữ lock trong thời gian ngắn nhất
- [ ] Thứ tự lấy lock nhất quán

### Test và công cụ

- [ ] Unit test phủ nhánh thành công, nhánh lỗi và điều kiện biên
- [ ] Build sạch khi bật cảnh báo (`-Wall -Wextra -Werror`)
- [ ] Chạy sanitizer (ASan, UBSan) trên đường code quan trọng
- [ ] Valgrind hoặc ASan xác nhận không rò rỉ bộ nhớ
- [ ] Đã xử lý kết quả phân tích tĩnh

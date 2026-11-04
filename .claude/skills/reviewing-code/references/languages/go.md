# Go

Dùng khi review code Go. Checklist dựa trên hướng dẫn chính thức của Go, Effective Go và thực hành phổ biến của cộng đồng. Bản tóm tắt nhanh nằm ở mục Checklist cuối file.

## 1. Xử lý lỗi

Nguyên tắc chung và ví dụ ở ngôn ngữ khác: xem [error-handling.md](../error-handling.md).

### 1.1 Không bao giờ bỏ qua lỗi

```go
// ❌ Sai: bỏ qua lỗi
result, _ := SomeFunction()

// ✅ Đúng: xử lý lỗi
result, err := SomeFunction()
if err != nil {
    return fmt.Errorf("some function failed: %w", err)
}
```

### 1.2 Bọc lỗi và thêm ngữ cảnh

```go
// ❌ Sai: mất ngữ cảnh
if err != nil {
    return err
}

// ❌ Sai: dùng %v làm mất chuỗi lỗi
if err != nil {
    return fmt.Errorf("failed: %v", err)
}

// ✅ Đúng: dùng %w để giữ chuỗi lỗi
if err != nil {
    return fmt.Errorf("failed to process user %d: %w", userID, err)
}
```

### 1.3 Dùng errors.Is và errors.As

```go
// ❌ Sai: so sánh trực tiếp (không xử lý được lỗi đã bọc)
if err == sql.ErrNoRows {
    // ...
}

// ✅ Đúng: errors.Is (hỗ trợ chuỗi lỗi)
if errors.Is(err, sql.ErrNoRows) {
    return nil, ErrNotFound
}

// ✅ Đúng: errors.As để lấy ra kiểu lỗi cụ thể
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    log.Printf("path error: %s", pathErr.Path)
}
```

### 1.4 Kiểu lỗi tự định nghĩa

```go
// ✅ Nên: định nghĩa sentinel error
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)

// ✅ Nên: lỗi tự định nghĩa có ngữ cảnh
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation error on %s: %s", e.Field, e.Message)
}
```

### 1.5 Mỗi lỗi chỉ xử lý một lần

```go
// ❌ Sai: vừa ghi log vừa trả về (xử lý trùng)
if err != nil {
    log.Printf("error: %v", err)
    return err
}

// ✅ Đúng: chỉ trả về, để bên gọi quyết định
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}

// ✅ Hoặc: chỉ ghi log và xử lý (không trả về)
if err != nil {
    log.Printf("non-critical error: %v", err)
    // tiếp tục chạy logic dự phòng
}
```

## 2. Đồng thời và goroutine

Mẫu đồng thời chung và ví dụ ở ngôn ngữ khác: xem [concurrency.md](../concurrency.md).

### 2.1 Tránh rò rỉ goroutine

```go
// ❌ Sai: goroutine không bao giờ thoát
func bad() {
    ch := make(chan int)
    go func() {
        val := <-ch // chặn mãi, không ai gửi
        fmt.Println(val)
    }()
    // hàm trả về, goroutine bị rò rỉ
}

// ✅ Đúng: dùng context hoặc done channel
func good(ctx context.Context) {
    ch := make(chan int)
    go func() {
        select {
        case val := <-ch:
            fmt.Println(val)
        case <-ctx.Done():
            return // thoát gọn
        }
    }()
}
```

### 2.2 Quy ước dùng channel

```go
// ❌ Sai: gửi vào nil channel (chặn vĩnh viễn)
var ch chan int
ch <- 1 // chặn vĩnh viễn

// ❌ Sai: gửi vào channel đã đóng (panic)
close(ch)
ch <- 1 // panic

// ✅ Đúng: bên gửi đóng channel
func producer(ch chan<- int) {
    defer close(ch) // bên gửi chịu trách nhiệm đóng
    for i := 0; i < 10; i++ {
        ch <- i
    }
}

// ✅ Đúng: bên nhận phát hiện channel đã đóng
for val := range ch {
    process(val)
}
// hoặc
val, ok := <-ch
if !ok {
    // channel đã đóng
}
```

### 2.3 Dùng sync.WaitGroup

```go
// ❌ Sai: gọi Add bên trong goroutine
var wg sync.WaitGroup
for i := 0; i < 10; i++ {
    go func() {
        wg.Add(1) // race condition
        defer wg.Done()
        work()
    }()
}
wg.Wait()

// ✅ Đúng: gọi Add trước khi khởi động goroutine
var wg sync.WaitGroup
for i := 0; i < 10; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        work()
    }()
}
wg.Wait()
```

### 2.4 Tránh capture biến vòng lặp (Go < 1.22)

```go
// ❌ Sai (Go < 1.22): capture biến vòng lặp
for _, item := range items {
    go func() {
        process(item) // mọi goroutine có thể dùng cùng một item
    }()
}

// ✅ Đúng: truyền tham số
for _, item := range items {
    go func(it Item) {
        process(it)
    }(item)
}

// ✅ Go 1.22+: hành vi mặc định đã sửa, mỗi vòng lặp tạo biến mới
```

### 2.5 Mẫu worker pool

```go
// ✅ Nên: giới hạn số việc chạy đồng thời
func processWithWorkerPool(ctx context.Context, items []Item, workers int) error {
    jobs := make(chan Item, len(items))
    results := make(chan error, len(items))

    // khởi động worker
    for w := 0; w < workers; w++ {
        go func() {
            for item := range jobs {
                results <- process(item)
            }
        }()
    }

    // gửi việc
    for _, item := range items {
        jobs <- item
    }
    close(jobs)

    // thu kết quả
    for range items {
        if err := <-results; err != nil {
            return err
        }
    }
    return nil
}
```

## 3. Dùng context

### 3.1 Context là tham số đầu tiên

```go
// ❌ Sai: context không phải tham số đầu
func Process(data []byte, ctx context.Context) error

// ❌ Sai: lưu context trong struct
type Service struct {
    ctx context.Context // không làm vậy
}

// ✅ Đúng: context là tham số đầu, đặt tên ctx
func Process(ctx context.Context, data []byte) error
```

### 3.2 Truyền tiếp, không tạo context gốc mới

```go
// ❌ Sai: tạo context gốc mới giữa chuỗi gọi
func middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := context.Background() // mất context của request
        process(ctx)
        next.ServeHTTP(w, r)
    })
}

// ✅ Đúng: lấy từ request rồi truyền tiếp
func middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        ctx = context.WithValue(ctx, key, value)
        process(ctx)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### 3.3 Luôn gọi hàm cancel

```go
// ❌ Sai: không gọi cancel
ctx, cancel := context.WithTimeout(parentCtx, 5*time.Second)
// thiếu cancel(), có thể rò rỉ tài nguyên

// ✅ Đúng: dùng defer để chắc chắn gọi
ctx, cancel := context.WithTimeout(parentCtx, 5*time.Second)
defer cancel() // vẫn phải gọi kể cả khi đã timeout
```

### 3.4 Phản hồi khi context bị hủy

```go
// ✅ Nên: kiểm tra context trong thao tác chạy lâu
func LongRunningTask(ctx context.Context) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err() // trả context.Canceled hoặc context.DeadlineExceeded
        default:
            // làm một phần nhỏ công việc
            if err := doChunk(); err != nil {
                return err
            }
        }
    }
}
```

### 3.5 Phân biệt lý do hủy

```go
// ✅ Dựa vào ctx.Err() để phân biệt lý do hủy
if err := ctx.Err(); err != nil {
    switch {
    case errors.Is(err, context.Canceled):
        log.Println("operation was canceled")
    case errors.Is(err, context.DeadlineExceeded):
        log.Println("operation timed out")
    }
    return err
}
```

## 4. Thiết kế interface

### 4.1 Nhận interface, trả struct

```go
// ❌ Không nên: nhận kiểu cụ thể
func SaveUser(db *sql.DB, user User) error

// ✅ Nên: nhận interface (giảm phụ thuộc, dễ test)
type UserStore interface {
    Save(ctx context.Context, user User) error
}

func SaveUser(store UserStore, user User) error

// ❌ Không nên: trả interface
func NewUserService() UserServiceInterface

// ✅ Nên: trả kiểu cụ thể
func NewUserService(store UserStore) *UserService
```

### 4.2 Định nghĩa interface ở phía dùng

```go
// ❌ Không nên: định nghĩa interface trong package implement
// package database
type Database interface {
    Query(ctx context.Context, query string) ([]Row, error)
    // ... 20 method
}

// ✅ Nên: định nghĩa interface tối thiểu cần dùng trong package phía dùng
// package userservice
type UserQuerier interface {
    QueryUsers(ctx context.Context, filter Filter) ([]User, error)
}
```

### 4.3 Giữ interface nhỏ và tập trung

```go
// ❌ Không nên: interface to, ôm mọi thứ
type Repository interface {
    GetUser(id int) (*User, error)
    CreateUser(u *User) error
    UpdateUser(u *User) error
    DeleteUser(id int) error
    GetOrder(id int) (*Order, error)
    CreateOrder(o *Order) error
    // ... thêm nhiều method
}

// ✅ Nên: interface nhỏ, tập trung
type UserReader interface {
    GetUser(ctx context.Context, id int) (*User, error)
}

type UserWriter interface {
    CreateUser(ctx context.Context, u *User) error
    UpdateUser(ctx context.Context, u *User) error
}

// ghép interface
type UserRepository interface {
    UserReader
    UserWriter
}
```

### 4.4 Không lạm dụng interface rỗng

```go
// ❌ Không nên: dùng interface{} quá nhiều
func Process(data interface{}) interface{}

// ✅ Nên: dùng generics (Go 1.18+)
func Process[T any](data T) T

// ✅ Nên: định nghĩa interface cụ thể
type Processor interface {
    Process() Result
}
```

## 5. Chọn kiểu receiver

### 5.1 Khi nào dùng pointer receiver

```go
// ✅ Khi cần sửa receiver
func (u *User) SetName(name string) {
    u.Name = name
}

// ✅ Receiver chứa primitive đồng bộ như sync.Mutex
type SafeCounter struct {
    mu    sync.Mutex
    count int
}

func (c *SafeCounter) Inc() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}

// ✅ Receiver là struct lớn (tránh chi phí sao chép)
type LargeStruct struct {
    Data [1024]byte
    // ...
}

func (l *LargeStruct) Process() { /* ... */ }
```

### 5.2 Khi nào dùng value receiver

```go
// ✅ Receiver là struct nhỏ, bất biến
type Point struct {
    X, Y float64
}

func (p Point) Distance(other Point) float64 {
    return math.Sqrt(math.Pow(p.X-other.X, 2) + math.Pow(p.Y-other.Y, 2))
}

// ✅ Receiver là alias của kiểu cơ bản
type Counter int

func (c Counter) String() string {
    return fmt.Sprintf("%d", c)
}

// ✅ Receiver là map, func, chan (vốn là kiểu tham chiếu)
type StringSet map[string]struct{}

func (s StringSet) Contains(key string) bool {
    _, ok := s[key]
    return ok
}
```

### 5.3 Nguyên tắc nhất quán

```go
// ❌ Không nên: trộn kiểu receiver
func (u User) GetName() string   // value receiver
func (u *User) SetName(n string) // pointer receiver

// ✅ Nên: có method nào cần pointer receiver thì dùng pointer cho tất cả
func (u *User) GetName() string { return u.Name }
func (u *User) SetName(n string) { u.Name = n }
```

## 6. Tối ưu hiệu năng

### 6.1 Cấp phát trước cho slice

```go
// ❌ Không nên: để slice tự tăng
var result []int
for i := 0; i < 10000; i++ {
    result = append(result, i) // cấp phát và sao chép nhiều lần
}

// ✅ Nên: cấp phát trước khi biết kích thước
result := make([]int, 0, 10000)
for i := 0; i < 10000; i++ {
    result = append(result, i)
}

// ✅ Hoặc khởi tạo thẳng
result := make([]int, 10000)
for i := 0; i < 10000; i++ {
    result[i] = i
}
```

### 6.2 Tránh cấp phát heap không cần thiết

```go
// ❌ Có thể escape lên heap
func NewUser() *User {
    return &User{} // escape lên heap
}

// ✅ Cân nhắc trả giá trị (nếu phù hợp)
func NewUser() User {
    return User{} // có thể cấp phát trên stack
}

// Kiểm tra escape analysis
// go build -gcflags '-m -m' ./...
```

### 6.3 Tái dùng object bằng sync.Pool

```go
// ✅ Nên: object tạo/hủy tần suất cao dùng sync.Pool
var bufferPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}

func ProcessData(data []byte) string {
    buf := bufferPool.Get().(*bytes.Buffer)
    defer func() {
        buf.Reset()
        bufferPool.Put(buf)
    }()

    buf.Write(data)
    return buf.String()
}
```

### 6.4 Tối ưu nối chuỗi

```go
// ❌ Không nên: nối bằng + trong vòng lặp
var result string
for _, s := range strings {
    result += s // mỗi lần tạo chuỗi mới
}

// ✅ Nên: dùng strings.Builder
var builder strings.Builder
for _, s := range strings {
    builder.WriteString(s)
}
result := builder.String()

// ✅ Hoặc dùng strings.Join
result := strings.Join(strings, "")
```

### 6.5 Tránh chi phí chuyển đổi interface{}

```go
// ❌ Dùng interface{} trên hot path
func process(data interface{}) {
    switch v := data.(type) { // type assertion có chi phí
    case int:
        // ...
    }
}

// ✅ Trên hot path dùng generics hoặc kiểu cụ thể
func process[T int | int64 | float64](data T) {
    // kiểu xác định lúc biên dịch, không tốn chi phí runtime
}
```

## 7. Test

### 7.1 Table-driven test

```go
// ✅ Nên: table-driven test
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive numbers", 1, 2, 3},
        {"with zero", 0, 5, 5},
        {"negative numbers", -1, -2, -3},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d",
                    tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

### 7.2 Test song song

```go
// ✅ Nên: chạy song song các test case độc lập
func TestParallel(t *testing.T) {
    tests := []struct {
        name  string
        input string
    }{
        {"test1", "input1"},
        {"test2", "input2"},
    }

    for _, tt := range tests {
        tt := tt // Go < 1.22 cần sao chép
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel() // đánh dấu chạy song song được
            result := Process(tt.input)
            // assertions...
        })
    }
}
```

### 7.3 Mock bằng interface

```go
// ✅ Định nghĩa interface để test được
type EmailSender interface {
    Send(to, subject, body string) error
}

// implementation cho production
type SMTPSender struct { /* ... */ }

// mock cho test
type MockEmailSender struct {
    SendFunc func(to, subject, body string) error
}

func (m *MockEmailSender) Send(to, subject, body string) error {
    return m.SendFunc(to, subject, body)
}

func TestUserRegistration(t *testing.T) {
    mock := &MockEmailSender{
        SendFunc: func(to, subject, body string) error {
            if to != "test@example.com" {
                t.Errorf("unexpected recipient: %s", to)
            }
            return nil
        },
    }

    service := NewUserService(mock)
    // test...
}
```

### 7.4 Hàm hỗ trợ test

```go
// ✅ Đánh dấu hàm hỗ trợ bằng t.Helper()
func assertEqual(t *testing.T, got, want interface{}) {
    t.Helper() // báo lỗi tại vị trí bên gọi
    if got != want {
        t.Errorf("got %v, want %v", got, want)
    }
}

// ✅ Dọn tài nguyên bằng t.Cleanup()
func TestWithTempFile(t *testing.T) {
    f, err := os.CreateTemp("", "test")
    if err != nil {
        t.Fatal(err)
    }
    t.Cleanup(func() {
        os.Remove(f.Name())
    })
    // test...
}
```

## 8. Bẫy thường gặp

### 8.1 Nil slice và empty slice

```go
var nilSlice []int     // nil, len=0, cap=0
emptySlice := []int{}  // khác nil, len=0, cap=0
made := make([]int, 0) // khác nil, len=0, cap=0

// ✅ Khác nhau khi encode JSON
json.Marshal(nilSlice)   // null
json.Marshal(emptySlice) // []

// ✅ Nên: cần JSON mảng rỗng thì khởi tạo rõ ràng
if slice == nil {
    slice = []int{}
}
```

### 8.2 Khởi tạo map

```go
// ❌ Sai: map chưa khởi tạo
var m map[string]int
m["key"] = 1 // panic: assignment to entry in nil map

// ✅ Đúng: khởi tạo bằng make
m := make(map[string]int)
m["key"] = 1

// ✅ Hoặc dùng literal
m := map[string]int{}
```

### 8.3 defer trong vòng lặp

```go
// ❌ Vấn đề tiềm ẩn: defer chỉ chạy khi hàm kết thúc
func processFiles(files []string) error {
    for _, file := range files {
        f, err := os.Open(file)
        if err != nil {
            return err
        }
        defer f.Close() // mọi file chỉ đóng khi hàm kết thúc
        // process...
    }
    return nil
}

// ✅ Đúng: dùng closure hoặc tách hàm
func processFiles(files []string) error {
    for _, file := range files {
        if err := processFile(file); err != nil {
            return err
        }
    }
    return nil
}

func processFile(file string) error {
    f, err := os.Open(file)
    if err != nil {
        return err
    }
    defer f.Close()
    // process...
    return nil
}
```

### 8.4 Slice dùng chung mảng nền

```go
// ❌ Vấn đề tiềm ẩn: slice dùng chung mảng nền
original := []int{1, 2, 3, 4, 5}
slice := original[1:3] // [2, 3]
slice[0] = 100         // sửa luôn original
// original thành [1, 100, 3, 4, 5]

// ✅ Đúng: cần bản độc lập thì sao chép rõ ràng
slice := make([]int, 2)
copy(slice, original[1:3])
slice[0] = 100 // không ảnh hưởng original
```

### 8.5 Rò rỉ bộ nhớ qua chuỗi con

```go
// ❌ Vấn đề tiềm ẩn: chuỗi con giữ cả mảng nền
func getPrefix(s string) string {
    return s[:10] // vẫn tham chiếu cả mảng nền của s
}

// ✅ Đúng: tạo bản độc lập (Go 1.18+)
func getPrefix(s string) string {
    return strings.Clone(s[:10])
}

// ✅ Trước Go 1.18
func getPrefix(s string) string {
    return string([]byte(s[:10]))
}
```

### 8.6 Bẫy nil của interface

```go
// ❌ Bẫy: so sánh nil với interface
type MyError struct{}
func (e *MyError) Error() string { return "error" }

func returnsError() error {
    var e *MyError = nil
    return e // error trả về khác nil
}

func main() {
    err := returnsError()
    if err != nil { // true: interface{type: *MyError, value: nil}
        fmt.Println("error:", err)
    }
}

// ✅ Đúng: trả nil rõ ràng
func returnsError() error {
    var e *MyError = nil
    if e == nil {
        return nil // trả nil rõ ràng
    }
    return e
}
```

### 8.7 So sánh thời gian

```go
// ❌ Không nên: so sánh time.Time bằng ==
if t1 == t2 { // có thể sai do khác biệt monotonic clock
    // ...
}

// ✅ Nên: dùng method Equal
if t1.Equal(t2) {
    // ...
}

// ✅ So sánh khoảng thời gian
if t1.Before(t2) || t1.After(t2) {
    // ...
}
```

## 9. Tổ chức code

### 9.1 Đặt tên package

```go
// ❌ Không nên
package common   // quá chung chung
package utils    // quá chung chung
package helpers  // quá chung chung
package models   // nhóm theo loại

// ✅ Nên: đặt tên theo chức năng
package user     // chức năng liên quan người dùng
package order    // chức năng liên quan đơn hàng
package postgres // implementation PostgreSQL
```

### 9.2 Tránh phụ thuộc vòng

```go
// ❌ Phụ thuộc vòng
// package a import package b
// package b import package a

// ✅ Cách 1: tách kiểu dùng chung ra package riêng
// package types (kiểu dùng chung)
// package a import types
// package b import types

// ✅ Cách 2: dùng interface để giảm phụ thuộc
// package a định nghĩa interface
// package b implement interface
```

### 9.3 Quy ước export

```go
// ✅ Chỉ export identifier cần thiết
type UserService struct {
    db *sql.DB // private
}

func (s *UserService) GetUser(id int) (*User, error) // public
func (s *UserService) validate(u *User) error         // private

// ✅ Package internal giới hạn quyền truy cập
// internal/database/... chỉ code trong cùng project import được
```

## 10. Công cụ và kiểm tra

### 10.1 Công cụ bắt buộc

```bash
# Định dạng (bắt buộc)
gofmt -w .
goimports -w .

# Phân tích tĩnh
go vet ./...

# Phát hiện race
go test -race ./...

# Escape analysis
go build -gcflags '-m -m' ./...
```

### 10.2 Linter nên dùng

```bash
# golangci-lint (gộp nhiều linter)
golangci-lint run

# Các kiểm tra thường dùng
# - errcheck: lỗi chưa xử lý
# - gosec: kiểm tra bảo mật
# - ineffassign: phép gán vô tác dụng
# - staticcheck: phân tích tĩnh
# - unused: code không dùng
```

### 10.3 Benchmark

```go
// ✅ Benchmark hiệu năng
func BenchmarkProcess(b *testing.B) {
    data := prepareData()
    b.ResetTimer() // đặt lại bộ đếm thời gian

    for i := 0; i < b.N; i++ {
        Process(data)
    }
}

// Chạy benchmark
// go test -bench=. -benchmem ./...
```

## Tài liệu chính thức

- [Effective Go](https://go.dev/doc/effective_go)
- [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)
- [Go Common Mistakes](https://go.dev/wiki/CommonMistakes)

## Checklist

### Bắt buộc kiểm tra

- [ ] Lỗi được xử lý đúng (không bỏ qua, có ngữ cảnh)
- [ ] Goroutine có cơ chế thoát (tránh rò rỉ)
- [ ] Context được truyền và hủy đúng
- [ ] Chọn kiểu receiver hợp lý (value / pointer)
- [ ] Code đã định dạng bằng `gofmt`

### Lỗi hay gặp

- [ ] Capture biến vòng lặp (Go < 1.22)
- [ ] Kiểm tra nil đầy đủ
- [ ] Map được khởi tạo trước khi dùng
- [ ] Dùng defer trong vòng lặp
- [ ] Che biến (shadowing)

# Zig

Dùng khi review code Zig. File tập trung vào quyền sở hữu bộ nhớ tường minh, error union, dọn dẹp bằng `defer`/`errdefer`, cách dùng `comptime`, thao tác có kiểm tra an toàn, tương tác với C và test.

## Bộ nhớ và allocator

### Làm rõ quyền sở hữu allocator

Code Zig phải để lộ chính sách cấp phát. Thư viện nên nhận `std.mem.Allocator` từ bên gọi thay vì tự tạo allocator toàn cục bên trong.

```zig
const std = @import("std");

// ❌ Sai: giấu chính sách cấp phát và vòng đời khỏi bên gọi.
fn readNamesBad() ![][]const u8 {
    var gpa = std.heap.DebugAllocator(.{}){};
    const allocator = gpa.allocator();
    return try allocator.alloc([]const u8, 10);
}

// ✅ Đúng: bên gọi chọn allocator và sở hữu bộ nhớ trả về.
fn readNames(allocator: std.mem.Allocator) ![][]const u8 {
    return try allocator.alloc([]const u8, 10);
}
```

Câu hỏi review:

- Bên gọi có biết ai sở hữu bộ nhớ đã cấp phát không?
- API có ghi rõ slice trả về có phải free không?
- Tham số allocator có được truyền tiếp thay vì bị thay bằng allocator toàn cục nội bộ không?

### Ghép cấp phát với dọn dẹp

Mỗi đường cấp phát phải có đường dọn dẹp nhìn thấy được. Tìm chỗ thiếu `defer`, thiếu `errdefer`, và container khởi tạo mà không bao giờ `deinit`.

```zig
const std = @import("std");

fn collectBad(allocator: std.mem.Allocator) ![]u8 {
    // ❌ Sai: trả slice có bộ nhớ nền bị free khi hàm thoát.
    var bad_list: std.ArrayListUnmanaged(u8) = .empty;
    defer bad_list.deinit(allocator);
    try bad_list.append(allocator, 'a');
    return bad_list.items;
}

fn collect(allocator: std.mem.Allocator) ![]u8 {
    // ✅ Đúng: `errdefer` chỉ dọn khi lỗi; thành công thì chuyển quyền sở hữu.
    var list: std.ArrayListUnmanaged(u8) = .empty;
    errdefer list.deinit(allocator);

    try list.append(allocator, 'a');
    try list.append(allocator, 'b');
    return try list.toOwnedSlice(allocator);
}
```

Câu hỏi review:

- Dọn dẹp có được đăng ký ngay sau khi lấy tài nguyên không?
- Có dùng `errdefer` khi quyền sở hữu chỉ chuyển lúc thành công không?
- Mọi lần khởi tạo container có cặp `deinit` không?

### Chọn allocator có chủ đích

Chọn allocator là một phần của thiết kế. Review nên đánh dấu chỗ dùng tràn lan allocator debug hoặc đa dụng trong khi fixed buffer, arena, page allocator hoặc allocator do bên gọi cấp khớp vòng đời hơn.

```zig
// ❌ Sai: vòng đời cấp phát rải rác qua nhiều lần free riêng lẻ.
const user = try allocator.create(User);
const events = try allocator.alloc(Event, event_count);

// ✅ Đúng: cấp phát theo phạm vi request/frame được free cùng lúc.
var arena = std.heap.ArenaAllocator.init(parent_allocator);
defer arena.deinit();
const allocator = arena.allocator();
```

Câu hỏi review:

- Cấp phát trong arena có được free ở một mốc vòng đời rõ ràng không?
- Test có dùng `std.testing.allocator` để bắt rò rỉ không?
- Thư viện có tránh tự quyết chính sách vốn thuộc về bên gọi không?

## Lỗi và dọn dẹp

### Giữ error set có ý nghĩa

Không gộp lỗi có ý nghĩa thành `anyerror` trừ khi ranh giới thật sự cần. Error set cụ thể làm rõ contract API và buộc bên gọi xử lý lỗi dự kiến.

```zig
// ❌ Sai: giấu các lỗi parse dự kiến sau `anyerror`.
fn parseDigitAny(input: []const u8) anyerror!u8 {
    if (input.len == 0) return error.EmptyInput;
    if (input[0] < '0' or input[0] > '9') return error.InvalidDigit;
    return input[0] - '0';
}

// ✅ Đúng: đặt tên các lỗi nghiệp vụ mà bên gọi cần xử lý.
const ParseError = error{
    EmptyInput,
    InvalidDigit,
};

fn parseDigit(input: []const u8) ParseError!u8 {
    if (input.len == 0) return error.EmptyInput;
    if (input[0] < '0' or input[0] > '9') return error.InvalidDigit;
    return input[0] - '0';
}
```

Câu hỏi review:

- Lỗi nghiệp vụ dự kiến có được đặt tên tường minh không?
- `anyerror` có chỉ dùng ở ranh giới tích hợp không?
- Bên gọi có giữ ngữ cảnh khi chuyển đổi lỗi không?

### Dùng `try`, `catch`, `errdefer` có chủ đích

`catch unreachable` dùng mù quáng là code smell (P2, hoặc P1 nếu che lỗi thật) trừ khi bất biến được bảo đảm cơ học. Ưu tiên lan truyền lỗi bằng `try`, chuyển đổi ở ranh giới, hoặc thêm comment cho bất biến unreachable.

```zig
// ❌ Sai: che lỗi cấp phát thật.
const buffer_bad = allocator.alloc(u8, size) catch unreachable;

// ✅ Đúng: bên gọi xử lý được OutOfMemory.
const buffer = try allocator.alloc(u8, size);
```

Câu hỏi review:

- `catch unreachable` có che lỗi I/O, cấp phát, parse hoặc đầu vào người dùng không?
- Lỗi có được chuyển đổi gần ranh giới nơi tầng trừu tượng thay đổi không?
- `errdefer` có hoàn tác thay đổi trạng thái dở dang khi lỗi không?

## Con trỏ, slice và optional

### Ưu tiên slice thay vì con trỏ kèm độ dài

Slice mang con trỏ và độ dài cùng nhau, giúp kiểm tra ranh giới và API rõ ràng hơn. Con trỏ thô kèm độ dài chỉ dành cho FFI hoặc code rất thấp tầng.

```zig
// ❌ Sai: dễ lệch con trỏ và độ dài.
fn checksumRaw(ptr: [*]const u8, len: usize) u32 {
    var sum: u32 = 0;
    for (ptr[0..len]) |byte| sum += byte;
    return sum;
}

// ✅ Đúng: một giá trị đại diện cho buffer.
fn checksum(bytes: []const u8) u32 {
    var sum: u32 = 0;
    for (bytes) |byte| sum += byte;
    return sum;
}
```

Câu hỏi review:

- API con trỏ thô có đổi thành API slice được không?
- Khả năng null có được mô hình bằng `?T` thay vì giá trị canh (sentinel) không?
- Vòng đời con trỏ có rõ ràng sau khi hàm trả về không?

### Không trả con trỏ tới dữ liệu trên stack

Review kỹ slice và con trỏ được trả về. Zig làm lộ nhiều lỗi vòng đời, nhưng người review vẫn phải kiểm tra dữ liệu trả về sống lâu hơn hàm.

```zig
// ❌ Sai: slice trả về trỏ vào bộ nhớ stack.
fn labelStack() []const u8 {
    var buf: [16]u8 = undefined;
    _ = &buf;
    return buf[0..];
}

// ✅ Đúng: bên gọi sở hữu kết quả đã cấp phát và free được.
fn label(allocator: std.mem.Allocator) ![]u8 {
    return try allocator.dupe(u8, "ready");
}
```

Câu hỏi review:

- Bộ nhớ trả về đến từ bên gọi, allocator, vùng nhớ tĩnh hay một chủ sở hữu ổn định?
- Slice có thoát ra ngoài sau khi buffer nền bị sửa hoặc free không?
- Với slice có thể sửa, alias có chủ đích và được ghi rõ không?

## Comptime và generic

### Giữ phần comptime có giới hạn và dễ đọc

`comptime` linh hoạt, nhưng code chạy lúc biên dịch mà phức tạp thì thông báo lỗi khó đọc và build chậm hơn. Ưu tiên helper generic nhỏ có contract kiểu rõ ràng.

```zig
fn RingBuffer(comptime T: type, comptime capacity: usize) type {
    // ✅ Đúng: tham số generic sai báo lỗi kèm thông báo xử lý được.
    if (capacity == 0) @compileError("capacity must be greater than zero");

    return struct {
        items: [capacity]T = undefined,
        len: usize = 0,
    };
}
```

Câu hỏi review:

- `comptime` có thực thi một bất biến thật không?
- Lỗi biên dịch có tường minh và chỉ rõ cách sửa không?
- Code reflection có tách khỏi logic runtime thông thường không?

### Tránh `anytype` quá rộng

`anytype` làm API linh hoạt nhưng cũng che giấu năng lực bắt buộc. Thêm kiểm tra comptime hoặc ưu tiên interface cụ thể khi được.

```zig
// ✅ Đúng: năng lực writer cần có thấy rõ ở chỗ gọi.
fn writeAll(writer: anytype, bytes: []const u8) !void {
    try writer.writeAll(bytes);
}
```

Câu hỏi review:

- Hình dạng yêu cầu của `anytype` có rõ từ thân hàm hoặc tài liệu không?
- Kiểu cụ thể hoặc helper nhỏ hơn có dễ review hơn không?
- Lỗi biên dịch có dễ hiểu khi truyền sai kiểu không?

## An toàn, hành vi không xác định và ép kiểu

### Coi `undefined`, `unreachable` và ép kiểu là hotspot khi review

Zig trao quyền điều khiển thấp tầng trực tiếp. Review mọi `undefined`, `unreachable`, `@ptrCast`, `@alignCast`, `@intCast` và chuyển đổi giữa con trỏ và số nguyên.

```zig
// ❌ Sai: giả định bố cục dữ liệu, thứ tự byte, độ dài, căn lề mà không chứng minh.
const header: *const Header = @ptrCast(@alignCast(bytes.ptr));

// ✅ Đúng: parse từng trường tường minh, kiểm tra độ dài trước khi đọc.
if (bytes.len < 4) return error.ShortInput;
const magic = std.mem.readInt(u16, bytes[0..2], .little);
const flags = std.mem.readInt(u16, bytes[2..4], .little);
```

Câu hỏi review:

- `undefined` có bị ghi đè trước khi đọc không?
- `unreachable` có chỉ dùng cho trạng thái bất khả, kèm giải thích gần đó khi không hiển nhiên không?
- Trước mỗi lần ép kiểu có kiểm tra bố cục, miền giá trị, căn lề, kích thước, thứ tự byte và khả năng null không?

### Ưu tiên số học có kiểm tra, trừ khi cố ý quay vòng

Toán tử quay vòng như `+%` và `-%` hữu ích, nhưng phải thể hiện lựa chọn số học modulo có chủ đích.

```zig
// ❌ Sai: quay vòng làm im lặng tràn số lẽ ra phải lộ lỗi logic.
index = index +% 1;

// ✅ Đúng: số học có kiểm tra dừng chương trình (trap) khi tràn bất ngờ.
sum += byte;

// ✅ Đúng: cố ý quay vòng cho hành vi hash modulo.
hash = hash *% 16777619;
hash = hash +% byte;
```

Câu hỏi review:

- Thuật toán có thật sự cần số học quay vòng không?
- Tràn số có báo hiệu đầu vào sai hoặc bug không?
- Thay đổi độ rộng số nguyên có tường minh và được test quanh giá trị ranh giới không?

## Tương tác với C

### Khoanh vùng ranh giới C

Giữ `@cImport`, xử lý con trỏ C và giả định ABI trong một tầng bọc. Chuyển dữ liệu C sang kiểu Zig trước khi dữ liệu đó lan khắp codebase.

```zig
const std = @import("std");

// ❌ Sai: dùng strlen của C khi không cần ranh giới C bên ngoài.
fn strlenC(input: [*:0]const u8) usize {
    const c = @cImport({
        @cInclude("string.h");
    });

    return c.strlen(input);
}

// ✅ Đúng: dùng helper thư viện chuẩn của Zig, hiểu sentinel.
fn strlenZ(input: [*:0]const u8) usize {
    return std.mem.len(input);
}
```

Câu hỏi review:

- Con trỏ C có biểu diễn bằng đúng loại con trỏ Zig không?
- Chuỗi kết thúc bằng sentinel có mô hình bằng con trỏ hoặc slice sentinel không?
- Quy tắc sở hữu và dọn dẹp của thư viện C có được ghi rõ không?
- Mã lỗi C có được chuyển thành error union của Zig gần ranh giới không?

## Test

### Dùng assertion của `std.testing` và phát hiện rò rỉ

Test có cấp phát nên dùng `std.testing.allocator` khi thực tế cho phép, để test runner báo rò rỉ.

```zig
const std = @import("std");

test "collect returns owned memory on success" {
    const allocator = std.testing.allocator;
    const names = try collect(allocator);
    defer allocator.free(names);

    try std.testing.expectEqual(@as(usize, 2), names.len);
}

test "collect handles allocation failures cleanly" {
    var failing = std.testing.FailingAllocator.init(std.testing.allocator, .{
        .fail_index = 0,
    });
    try std.testing.expectError(error.OutOfMemory, collect(failing.allocator()));
}
```

Câu hỏi review:

- Đường code cấp phát nhiều có được test phủ không?
- Nhánh lỗi có được test bằng `std.testing.expectError` không?
- Test có phủ kích thước ranh giới như đầu vào rỗng, một phần tử, dung lượng tối đa, encoding không hợp lệ không?

### Test theo build mode và target khi liên quan

Hành vi có thể khác nhau giữa các chế độ an toàn, target và ABI. Với code thấp tầng, hỏi PR đã test với target và chế độ tối ưu dự định chưa.

Câu hỏi review:

- Code có dựa vào kiểm tra an toàn chỉ có ở bản debug không?
- Code bố cục packed/aligned/extern có test theo target không?
- Giả định về endian, độ rộng con trỏ và ABI có được test hoặc ghi rõ không?

## Style và thiết kế API

### Theo quy ước đặt tên của Zig

Lấy style guide chính thức làm chuẩn: `TitleCase` cho kiểu, `camelCase` cho hàm, `snake_case` cho biến. Tránh từ thừa như `Value`, `Data`, `Manager`, `State` khi namespace bao quanh đã mang nghĩa đó.

```zig
// ❌ Sai: namespace lặp lại và tên kiểu mơ hồ.
pub const json_bad = struct {
    pub const JsonValueManager = struct {};
};

// ✅ Đúng: tên có nghĩa trong namespace đầy đủ.
pub const json = struct {
    pub const Value = union(enum) {};
};
```

Câu hỏi review:

- Tên đầy đủ (kèm namespace) có đọc tự nhiên không?
- Tên file và thư mục có nhất quán với style guide không?
- Có tránh khai báo bắt đầu bằng gạch dưới, trừ khi theo quy ước bên ngoài không?
- API công khai có doc comment ở chỗ cần không?

### Giữ API công khai nhỏ

Module Zig thường lộ khai báo trực tiếp từ file và struct. Review khai báo công khai để tìm chỗ export ngoài ý muốn.

Câu hỏi review:

- Khai báo này có nên là `pub` không?
- API công khai đã đủ ổn định để lộ ra chưa?
- Chi tiết implementation có được giấu sau bề mặt nhỏ hơn không?

## Tài liệu chính thức

- [Zig 0.16.0 Language Reference](https://ziglang.org/documentation/0.16.0/)
- [Zig 0.16.0 Standard Library documentation](https://ziglang.org/documentation/0.16.0/std/)
- [Zig 0.16.0 Style Guide](https://ziglang.org/documentation/0.16.0/#Style-Guide)
- [Choosing an Allocator](https://ziglang.org/documentation/0.16.0/#Choosing-an-Allocator)

## Checklist

### Bộ nhớ và vòng đời

- [ ] Quyền sở hữu allocator tường minh.
- [ ] Mỗi lần cấp phát có `free`, `deinit`, `defer` hoặc `errdefer` tương ứng.
- [ ] Slice và con trỏ trả về sống lâu hơn hàm.
- [ ] Cấp phát arena hoặc tạm thời có mốc vòng đời rõ ràng.

### Lỗi và dọn dẹp

- [ ] Lỗi dự kiến dùng error set cụ thể khi thực tế cho phép.
- [ ] `catch unreachable` không che lỗi runtime thật.
- [ ] Khởi tạo dở dang được hoàn tác bằng `errdefer`.
- [ ] Chuyển đổi lỗi diễn ra ở ranh giới trừu tượng.

### Con trỏ và an toàn

- [ ] Con trỏ thô có lý do; buffer thông thường dùng slice.
- [ ] Ép kiểu có kiểm tra kích thước, miền giá trị, căn lề và khả năng null.
- [ ] Không đọc `undefined` trước khi khởi tạo.
- [ ] Số học quay vòng có chủ đích và có test.

### Comptime và thiết kế API

- [ ] Logic `comptime` thực thi bất biến hữu ích.
- [ ] Cách dùng `anytype` có kỳ vọng rõ ràng.
- [ ] Khai báo công khai có chủ đích.
- [ ] Tên theo quy ước style của Zig.

### Tương tác C và tính di động

- [ ] Ranh giới C cô lập sau tầng bọc.
- [ ] Quy tắc sở hữu và dọn dẹp của C được ghi rõ.
- [ ] Giả định về target, endian, độ rộng con trỏ và ABI được test hoặc ghi rõ.

### Test

- [ ] Code cấp phát nhiều dùng `std.testing.allocator` trong test.
- [ ] Nhánh lỗi dùng `std.testing.expectError`.
- [ ] Phủ các điều kiện biên.
- [ ] Đã tính tới build mode và target liên quan.

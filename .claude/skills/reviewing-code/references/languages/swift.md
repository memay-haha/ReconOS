# Swift

Dùng khi review code Swift hiện đại (5.9+/6), gồm SwiftUI, Swift Concurrency và Swift API Design Guidelines. Checklist nhanh nằm ở mục cuối.

## 1. Optional và unwrap

### 1.1 Tránh force-unwrap

```swift
// ❌ Sai: crash lúc chạy nếu nil
let name = user.name!
let url = URL(string: urlString)!

// ✅ Đúng: gắn bằng guard let / if let
guard let name = user.name else {
    return
}

if let url = URL(string: urlString) {
    load(url)
}
```

### 1.2 Dùng nil-coalescing cho giá trị mặc định

```swift
// ❌ Sai: dài dòng, dễ crash
let count: Int
if let c = dictionary["count"] {
    count = c
} else {
    count = 0
}

// ✅ Đúng: nil-coalescing
let count = dictionary["count"] ?? 0
```

### 1.3 Ưu tiên guard let để thoát sớm

```swift
// ❌ Sai: lồng sâu (kim tự tháp)
func process(_ input: String?) {
    if let input = input {
        if let value = Int(input) {
            if value > 0 {
                handle(value)
            }
        }
    }
}

// ✅ Đúng: guard giữ nhánh thành công không thụt lề
func process(_ input: String?) {
    guard let input,
          let value = Int(input),
          value > 0 else {
        return
    }
    handle(value)
}
```

### 1.4 Tránh implicitly unwrapped optional

```swift
// ❌ Sai: T! là force-unwrap ẩn ở mỗi lần truy cập
class ViewModel {
    var service: NetworkService!
}

// ✅ Đúng: inject phụ thuộc không optional
class ViewModel {
    private let service: NetworkService

    init(service: NetworkService) {
        self.service = service
    }
}
```

### 1.5 Dùng optional chaining và map/flatMap

```swift
// ❌ Sai: unwrap thủ công chỉ để biến đổi
var initial: String?
if let name = user.name {
    initial = String(name.prefix(1))
}

// ✅ Đúng: optional chaining + map
let initial = user.name.map { String($0.prefix(1)) }

// ✅ Đúng: flatMap để tránh optional lồng hai tầng
let port: Int? = components.port.flatMap { Int(exactly: $0) }
```

## 2. Quản lý bộ nhớ và retain cycle

### 2.1 Dùng `[weak self]` trong escaping closure

```swift
// ❌ Sai: closure giữ mạnh self, tạo retain cycle
class ImageLoader {
    var onComplete: (() -> Void)?

    func load() {
        service.fetch { data in
            self.cache = data   // closure giữ self
            self.onComplete?()
        }
    }
}

// ✅ Đúng: capture yếu self rồi guard
class ImageLoader {
    var onComplete: (() -> Void)?

    func load() {
        service.fetch { [weak self] data in
            guard let self else { return }
            self.cache = data
            self.onComplete?()
        }
    }
}
```

### 2.2 weak hay unowned

```swift
// ✅ Dùng weak khi tham chiếu có thể hợp lệ trở thành nil
class Controller {
    weak var delegate: ControllerDelegate?
}

// ✅ Chỉ dùng unowned khi object được capture chắc chắn sống lâu hơn
//    closure (ví dụ self sở hữu chặt closure).
//    unowned crash nếu truy cập sau khi object đã giải phóng.
class Owner {
    lazy var describe: () -> String = { [unowned self] in
        self.name
    }
    let name = "owner"
}

// ❌ Sai: unowned cho thứ có thể sống lâu hơn self -> crash
networkClient.onResponse = { [unowned self] in self.update() }
// Ở đây nên dùng [weak self], vì onResponse có thể chạy sau khi self đã mất.
```

### 2.3 Phá retain cycle của delegate

```swift
// ❌ Sai: delegate mạnh giữ cả hai object sống mãi
protocol DataSourceDelegate: AnyObject {}

class DataSource {
    var delegate: DataSourceDelegate?   // mặc định là mạnh
}

// ✅ Đúng: delegate phải weak (và protocol ràng buộc AnyObject)
class DataSource {
    weak var delegate: DataSourceDelegate?
}
```

### 2.4 Closure lưu thành thuộc tính

```swift
// ❌ Sai: closure lưu trữ capture mạnh self -> vòng vĩnh viễn
class Timer {
    var tick: (() -> Void)!
    func configure() {
        tick = { self.count += 1 }
    }
    var count = 0
}

// ✅ Đúng: capture yếu cho closure lưu trữ có tham chiếu self
class Timer {
    var tick: (() -> Void)?
    func configure() {
        tick = { [weak self] in self?.count += 1 }
    }
    var count = 0
}
```

## 3. Kiểu giá trị và kiểu tham chiếu

### 3.1 Mặc định dùng struct

```swift
// ✅ Dùng struct cho dữ liệu, model có ngữ nghĩa giá trị
struct Coordinate {
    var latitude: Double
    var longitude: Double
}

// Bản sao độc lập; không có trạng thái sửa được dùng chung, dùng an toàn từ nhiều thread.
var a = Coordinate(latitude: 1, longitude: 2)
var b = a
b.latitude = 99   // a không đổi
```

### 3.2 Dùng class cho định danh hoặc trạng thái chia sẻ

```swift
// ✅ Dùng class khi instance có định danh, hoặc phải chia sẻ/sửa qua tham chiếu,
//    hoặc khi cần kế thừa, tương tác Objective-C.
final class DatabaseConnection {
    private(set) var isOpen = false
    func open() { isOpen = true }
}

// Hai tham chiếu trỏ cùng một kết nối.
let conn1 = DatabaseConnection()
let conn2 = conn1
conn1.open()
// conn2.isOpen == true
```

### 3.3 Đánh dấu final khi không có class con

```swift
// ❌ Sai: vô tình mở cho kế thừa (dispatch chậm hơn, API dễ vỡ)
class UserViewModel {}

// ✅ Đúng: final cho phép dispatch tĩnh và thể hiện ý định
final class UserViewModel {}
```

### 3.4 Cẩn thận kiểu tham chiếu nằm trong struct

```swift
// ❌ Bất ngờ: copy struct vẫn dùng chung instance class bên trong
final class Box { var value = 0 }
struct Container { var box = Box() }

var x = Container()
var y = x
y.box.value = 42   // x.box.value cũng là 42 (tham chiếu chung!)

// ✅ Đúng: dùng ngữ nghĩa giá trị xuyên suốt, hoặc copy-on-write có chủ đích
struct Container {
    var value = 0   // kiểu giá trị thuần, bản sao độc lập
}
```

## 4. Xử lý lỗi

Nguyên tắc chung: [error-handling.md](../error-handling.md).

### 4.1 Tránh `try!` và `try?`

```swift
// ❌ Sai: try! crash với mọi lỗi ném ra
let data = try! Data(contentsOf: url)

// ❌ Thường sai: try? lặng lẽ bỏ lỗi và nguyên nhân
let data = try? Data(contentsOf: url)   // data là nil, mất "vì sao"

// ✅ Đúng: lan truyền hoặc xử lý bằng do-catch
do {
    let data = try Data(contentsOf: url)
    process(data)
} catch {
    log.error("failed to read \(url): \(error)")
}
```

### 4.2 Định nghĩa kiểu lỗi có ý nghĩa

```swift
// ✅ Nên dùng: enum Error mô tả chính xác các kiểu thất bại
enum NetworkError: Error {
    case invalidURL
    case unauthorized
    case server(statusCode: Int)
    case decoding(underlying: Error)
}

func fetch(_ path: String) throws -> Data {
    guard let url = URL(string: path) else {
        throw NetworkError.invalidURL
    }
    // ...
}
```

### 4.3 Dùng Result cho kết quả lưu trữ hoặc trì hoãn

```swift
// ✅ Result hữu ích ở ranh giới callback hoặc khi cần lưu kết quả
func load(completion: @escaping (Result<User, NetworkError>) -> Void) {
    // completion(.success(user)) hoặc completion(.failure(.unauthorized))
}

// ✅ Chuyển qua lại giữa Result và throws khi cần
let user = try result.get()
```

### 4.4 Typed throws (Swift 6)

```swift
// ✅ Typed throws giới hạn kiểu lỗi khi đã biết đầy đủ.
//    Dùng cho miền lỗi đóng, liệt kê đủ; với API thư viện có thể
//    thêm case lỗi mới, ưu tiên `throws` không kiểu.
func parse(_ raw: String) throws(ParsingError) -> Token {
    guard let token = Token(raw) else {
        throw ParsingError.malformed
    }
    return token
}

do {
    let token = try parse(input)
} catch {
    // `error` được biết tĩnh là ParsingError
    handle(error)
}
```

### 4.5 Không catch rồi ném lại vô ích

```swift
// ❌ Sai: catch không thêm gì mà còn làm mờ trace
do {
    try work()
} catch {
    throw error   // vô nghĩa
}

// ✅ Đúng: chỉ catch để thêm ngữ cảnh hoặc phục hồi
do {
    try work()
} catch {
    throw AppError.workFailed(underlying: error)
}
```

## 5. Swift Concurrency

Mẫu đồng thời chung: [concurrency.md](../concurrency.md).

### 5.1 Ưu tiên async/await thay callback lồng nhau

```swift
// ❌ Sai: kim tự tháp callback, xử lý lỗi rải rác
func loadProfile(completion: @escaping (Result<Profile, Error>) -> Void) {
    fetchUser { userResult in
        switch userResult {
        case .success(let user):
            fetchAvatar(user) { avatarResult in /* ... */ }
        case .failure(let error):
            completion(.failure(error))
        }
    }
}

// ✅ Đúng: async/await tuyến tính
func loadProfile() async throws -> Profile {
    let user = try await fetchUser()
    let avatar = try await fetchAvatar(user)
    return Profile(user: user, avatar: avatar)
}
```

### 5.2 Dùng `@MainActor` cho trạng thái UI

```swift
// ❌ Sai: sửa trạng thái UI từ ngữ cảnh nền (data race / crash)
func refresh() async {
    let items = try? await api.load()
    self.items = items ?? []   // có thể chạy ngoài main thread
}

// ✅ Đúng: cô lập kiểu phục vụ UI vào main actor
@MainActor
final class FeedViewModel: ObservableObject {
    @Published var items: [Item] = []

    func refresh() async {
        let loaded = (try? await api.load()) ?? []
        items = loaded   // bảo đảm chạy trên main actor
    }
}
```

### 5.3 Bảo vệ trạng thái sửa được bằng actor

```swift
// ❌ Sai: trạng thái sửa được dùng chung không đồng bộ (data race)
final class Counter {
    var value = 0
    func increment() { value += 1 }
}

// ✅ Đúng: actor tuần tự hóa truy cập vào trạng thái riêng
actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}

let counter = Counter()
await counter.increment()   // truy cập được await và tuần tự hóa
```

### 5.4 Cho kiểu dùng chung tuân thủ Sendable

```swift
// ❌ Sai: truyền class không Sendable qua actor (lỗi ở Swift 6)
final class Config {        // sửa được, không Sendable
    var retries = 3
}

// ✅ Đúng: kiểu dùng chung phải Sendable (lý tưởng là kiểu giá trị bất biến)
struct Config: Sendable {
    let retries: Int
}

// ✅ Với kiểu tham chiếu, dùng final + thuộc tính lưu trữ bất biến,
//    hoặc @unchecked Sendable chỉ khi tự đồng bộ thủ công.
final class Cache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
    // mọi truy cập đều qua lock
}
```

### 5.5 Xử lý hủy task

```swift
// ❌ Sai: bỏ qua hủy, vẫn chạy sau khi view đã mất
func search(_ query: String) async -> [Result] {
    var results: [Result] = []
    for page in 0..<100 {
        results += await fetchPage(query, page)   // không bao giờ dừng
    }
    return results
}

// ✅ Đúng: kiểm tra hủy theo kiểu hợp tác
func search(_ query: String) async throws -> [Result] {
    var results: [Result] = []
    for page in 0..<100 {
        try Task.checkCancellation()
        results += try await fetchPage(query, page)
    }
    return results
}
```

### 5.6 Không để task fire-and-forget rò rỉ

```swift
// ❌ Sai: Task không cấu trúc, không giữ handle, không bao giờ hủy
final class ViewModel {
    func onAppear() {
        Task {
            await self.stream()   // chạy mãi kể cả khi màn hình đã đóng
        }
    }
}

// ✅ Đúng: giữ handle và hủy (hoặc dùng .task trong SwiftUI)
final class ViewModel {
    private var streamTask: Task<Void, Never>?

    func onAppear() {
        streamTask = Task { [weak self] in
            await self?.stream()
        }
    }

    func onDisappear() {
        streamTask?.cancel()
    }
}
```

### 5.7 Dùng structured concurrency để chạy song song

```swift
// ❌ Sai: await tuần tự trong khi có thể chạy đồng thời
let a = await loadA()
let b = await loadB()   // chờ A xong trước

// ✅ Đúng: async let chạy đồng thời
async let a = loadA()
async let b = loadB()
let (resultA, resultB) = await (a, b)

// ✅ Với số task con thay đổi, dùng task group
try await withThrowingTaskGroup(of: Item.self) { group in
    for id in ids {
        group.addTask { try await fetch(id) }
    }
    for try await item in group {
        store(item)
    }
}
```

## 6. SwiftUI

### 6.1 Chọn đúng state wrapper

```swift
// ✅ @State: trạng thái kiểu giá trị đơn giản do view này sở hữu
struct Toggle: View {
    @State private var isOn = false
    var body: some View { /* ... */ }
}

// ✅ @StateObject: view tự tạo và sở hữu model kiểu tham chiếu
struct ProfileScreen: View {
    @StateObject private var model = ProfileViewModel()
    var body: some View { /* ... */ }
}

// ✅ @ObservedObject: model do nơi khác sở hữu và truyền vào
struct ProfileHeader: View {
    @ObservedObject var model: ProfileViewModel
    var body: some View { /* ... */ }
}

// ✅ @Binding: tham chiếu hai chiều tới trạng thái do view cha sở hữu
struct SearchField: View {
    @Binding var text: String
    var body: some View { /* ... */ }
}
```

### 6.2 `@StateObject` hay `@ObservedObject`

```swift
// ❌ Sai: @ObservedObject cho object do chính view tạo.
//    SwiftUI có thể tạo lại view, khởi tạo lại model và
//    mất trạng thái sau mỗi lần render lại.
struct CounterView: View {
    @ObservedObject var model = CounterModel()   // bị tạo lại bất ngờ
}

// ✅ Đúng: @StateObject gắn vòng đời model với view
struct CounterView: View {
    @StateObject private var model = CounterModel()
}
```

### 6.3 Giữ định danh view

```swift
// ❌ Sai: id theo chỉ số dùng lại định danh khi mảng đổi thứ tự,
//    gây animation sai và trạng thái cũ.
ForEach(0..<items.count, id: \.self) { i in
    ItemRow(item: items[i])
}

// ✅ Đúng: dùng định danh ổn định, duy nhất
ForEach(items) { item in   // Item: Identifiable
    ItemRow(item: item)
}

// ✅ Dùng .id(...) để chủ động reset trạng thái view
ProfileView(user: user)
    .id(user.id)   // mỗi người dùng một định danh mới -> trạng thái mới
```

### 6.4 Tránh render thừa

```swift
// ❌ Sai: một body khổng lồ render lại toàn bộ khi có bất kỳ thay đổi nào
struct Dashboard: View {
    @ObservedObject var model: DashboardModel
    var body: some View {
        VStack {
            // header + biểu đồ nặng + danh sách cùng tính lại
        }
    }
}

// ✅ Đúng: tách subview để chỉ phần bị ảnh hưởng render lại.
//    Mỗi view con chỉ quan sát trạng thái view đó cần.
struct Dashboard: View {
    var body: some View {
        VStack {
            HeaderView()
            ChartView()
            ItemList()
        }
    }
}
```

### 6.5 Chạy việc bất đồng bộ bằng `.task`

```swift
// ❌ Sai: khởi động việc trong onAppear mà không hủy
.onAppear {
    Task { await model.load() }   // không bị hủy khi view biến mất
}

// ✅ Đúng: .task gắn với vòng đời view và tự hủy
.task {
    await model.load()
}

// ✅ Chạy lại khi đầu vào đổi
.task(id: query) {
    await model.search(query)
}
```

## 7. Protocol và generic

### 7.1 Thiết kế hướng protocol

```swift
// ✅ Ghép hành vi bằng protocol và implementation mặc định
protocol Identifiable2 {
    var id: String { get }
}

protocol Describable {
    var description: String { get }
}

extension Describable {
    var description: String { "no description" }   // mặc định
}
```

### 7.2 Ưu tiên `some` thay `any`

```swift
// ❌ Chậm hơn: `any` là hộp existential, dispatch động
func makeShape() -> any Shape { Circle() }

// ✅ Nhanh hơn: `some` là kiểu opaque giải quyết lúc biên dịch,
//    giữ kiểu cụ thể và cho phép dispatch tĩnh.
func makeShape() -> some Shape { Circle() }

// Chỉ dùng `any` khi thật sự cần giá trị không đồng nhất:
let shapes: [any Shape] = [Circle(), Square()]
```

### 7.3 Ràng buộc generic thay vì existential

```swift
// ❌ Sai: tham số existential mất kiểu cụ thể và chậm hơn
func logTotal(_ items: [any Numeric]) {
    // khó dùng: kiểu số cụ thể bị xóa, phép tính phải ép kiểu
}

// ✅ Đúng: ràng buộc generic giữ đủ thông tin kiểu
func total<T: Numeric>(_ items: [T]) -> T {
    items.reduce(.zero, +)
}
```

### 7.4 Associated type với primary associated type

```swift
// ✅ Primary associated type (Swift 5.7+) cho phép ràng buộc gọn
protocol Container<Item> {
    associatedtype Item
    var count: Int { get }
    subscript(_ index: Int) -> Item { get }
}

// Ràng buộc kiểu phần tử không cần mệnh đề where:
func first(in container: some Container<Int>) -> Int {
    container[0]
}
```

## 8. Access control và thiết kế API

### 8.1 Dùng mức truy cập hẹp nhất

```swift
// ❌ Sai: mọi thứ public làm lộ chi tiết nội bộ thành API
public class Service {
    public var cache: [String: Data] = [:]
    public func reset() {}
}

// ✅ Đúng: chỉ lộ API dự định, giấu phần còn lại
public final class Service {
    private var cache: [String: Data] = [:]
    public func reset() { cache.removeAll() }
}
```

### 8.2 private, fileprivate, internal, public, open

```swift
// private:     chỉ thấy trong khai báo bao quanh (và extension của kiểu đó trong cùng file)
// fileprivate: thấy trong cùng file nguồn
// internal:    thấy trong module (mặc định)
// public:      thấy ngoài module, nhưng không kế thừa/override được
// open:        thấy ngoài module và kế thừa/override được

// ✅ Dùng private(set) để lộ trạng thái chỉ đọc
public final class Account {
    public private(set) var balance: Decimal = 0
}
```

### 8.3 Theo Swift API Design Guidelines

```swift
// ❌ Sai: từ thừa, vai trò đối số không rõ
func insertObject(_ object: Element, atIndex index: Int)
list.removeElement(at: 0)

// ✅ Đúng: ở chỗ gọi đọc như một cụm từ; bỏ từ thừa
func insert(_ element: Element, at index: Int)
list.insert(item, at: 0)        // đọc là "insert item at 0"
list.remove(at: 0)

// ✅ Thuộc tính Bool đọc như một khẳng định
var isEmpty: Bool
var hasChanges: Bool
```

### 8.4 Đặt tên method theo side effect

```swift
// ✅ Cặp động từ sửa tại chỗ và danh từ không sửa (quy tắc "ed/ing")
var sorted = array.sorted()   // trả giá trị mới (không sửa)
array.sort()                  // sửa tại chỗ (động từ mệnh lệnh)

let reversed = text.reversed()
text.reverse()
```

## 9. Collection và phong cách hàm

### 9.1 Ưu tiên map/filter/compactMap

```swift
// ❌ Dài dòng: vòng lặp thủ công với biến tích lũy sửa được
var names: [String] = []
for user in users {
    if user.isActive {
        names.append(user.name)
    }
}

// ✅ Đúng: biến đổi khai báo
let names = users.filter(\.isActive).map(\.name)
```

### 9.2 compactMap để bỏ nil

```swift
// ❌ Sai: map để lại [Int?] phải unwrap tiếp
let numbers = strings.map { Int($0) }   // [Int?]

// ✅ Đúng: compactMap bỏ nil và unwrap
let numbers = strings.compactMap { Int($0) }   // [Int]
```

### 9.3 Tránh kiểm tra thành viên O(n^2)

```swift
// ❌ Sai: contains trên Array là O(n); vòng lặp thành O(n*m)
let result = candidates.filter { blocked.contains($0) }   // blocked: [ID]

// ✅ Đúng: Set cho kiểm tra thành viên O(1)
let blockedSet = Set(blocked)
let result = candidates.filter { blockedSet.contains($0) }
```

### 9.4 reduce và nhóm bằng Dictionary

```swift
// ✅ Nhóm bằng Dictionary(grouping:)
let byFirstLetter = Dictionary(grouping: words) { $0.first }

// ❌ Sai khi tích lũy collection: reduce copy ở mỗi bước, nên dùng reduce(into:)
let total = numbers.reduce(0) { $0 + $1 }   // với số vô hướng thì ổn

// ✅ Dùng reduce(into:) khi tích lũy vào collection (tránh copy)
let counts = words.reduce(into: [:]) { acc, word in
    acc[word, default: 0] += 1
}
```

### 9.5 Dùng lazy cho chuỗi biến đổi trên dãy lớn

```swift
// ❌ Sai: mỗi bước cấp phát một mảng trung gian
let firstMatch = bigArray.map(expensive).filter(isValid).first

// ✅ Đúng: lazy tránh mảng trung gian và dừng sớm
let firstMatch = bigArray.lazy.map(expensive).filter(isValid).first
```

## 10. Test

### 10.1 Arrange-Act-Assert với XCTest

```swift
import XCTest
@testable import MyApp

final class PriceCalculatorTests: XCTestCase {
    func testDiscountApplied() {
        // Arrange: chuẩn bị
        let calculator = PriceCalculator(discount: 0.1)
        // Act: thực thi
        let total = calculator.total(for: 100)
        // Assert: kiểm tra
        XCTAssertEqual(total, 90, accuracy: 0.001)
    }
}
```

### 10.2 Test code bất đồng bộ

```swift
// ✅ Đánh dấu method test là async và await trực tiếp
func testFetchUser() async throws {
    let service = UserService(client: MockClient())
    let user = try await service.fetchUser(id: "42")
    XCTAssertEqual(user.id, "42")
}

// ✅ Kiểm tra lời gọi bất đồng bộ ném đúng lỗi dự kiến
func testFetchUserUnauthorized() async {
    let service = UserService(client: UnauthorizedClient())
    do {
        _ = try await service.fetchUser(id: "42")
        XCTFail("expected to throw")
    } catch NetworkError.unauthorized {
        // đúng dự kiến
    } catch {
        XCTFail("unexpected error: \(error)")
    }
}
```

### 10.3 Dependency injection qua protocol

```swift
// ✅ Phụ thuộc vào protocol để test thay bằng mock
protocol HTTPClient {
    func get(_ url: URL) async throws -> Data
}

struct MockClient: HTTPClient {
    var result: Result<Data, Error>
    func get(_ url: URL) async throws -> Data {
        try result.get()
    }
}
```

### 10.4 Tránh sleep; await expectation hoặc giá trị

```swift
// ❌ Sai: sleep tùy ý làm test chậm và chập chờn
func testCallback() {
    var done = false
    object.run { done = true }
    Thread.sleep(forTimeInterval: 1)
    XCTAssertTrue(done)
}

// ✅ Đúng: dùng XCTestExpectation cho API callback
func testCallback() {
    let expectation = expectation(description: "callback fired")
    object.run { expectation.fulfill() }
    wait(for: [expectation], timeout: 1.0)
}

// ✅ Tốt hơn: refactor sang async và await giá trị trực tiếp
func testCallback() async {
    let value = await object.run()
    XCTAssertEqual(value, expected)
}
```

## Tài liệu chính thức

- [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/)
- [The Swift Programming Language](https://docs.swift.org/swift-book/)
- [Swift Concurrency (TSPL)](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [Migrating to Swift 6](https://www.swift.org/migration/documentation/migrationguide/)
- [Apple: Managing Model Data in Your App (SwiftUI)](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)
- [Apple: Automatic Reference Counting](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/automaticreferencecounting/)
- [WWDC: Protocol-Oriented Programming in Swift](https://developer.apple.com/videos/play/wwdc2015/408/)
- [Swift Evolution](https://github.com/apple/swift-evolution)

## Checklist

### Mục bắt buộc kiểm tra

- [ ] Tránh force-unwrap (`!`) và `try!`, dùng unwrap an toàn
- [ ] Closure capture `self` dùng `[weak self]` để tránh retain cycle
- [ ] Chọn kiểu giá trị hay kiểu tham chiếu (struct hay class) có chủ đích
- [ ] Lỗi được lan truyền bằng `throws`/`Result`, không bị nuốt
- [ ] Ranh giới đồng thời an toàn với data race (`Sendable`, `@MainActor`, actor)

### Lỗi thường gặp

- [ ] Không có `Task {}` fire-and-forget bị rò rỉ hoặc không bao giờ hủy
- [ ] Dùng đúng property wrapper SwiftUI (không dùng `@ObservedObject` khi cần `@StateObject`)
- [ ] Không tra cứu O(n^2) trong vòng lặp khi có thể dùng `Set` hoặc `Dictionary`
- [ ] Không có implicitly unwrapped optional (`var x: T!`) ngoài IBOutlet
- [ ] Access control không quá rộng (`public`/`open` khi `internal` là đủ)
- [ ] Đặt tên theo Swift API Design Guidelines

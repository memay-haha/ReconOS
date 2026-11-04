# Java 8 và stack cũ

Dùng khi review code còn chạy **Java 8** hoặc stack cũ tương đương: Spring Boot 2.x, `javax.*`, Hibernate 5. Không đòi hỏi tính năng Java 17/21 (record, text block, virtual thread, `ProblemDetail`...) trong các PR này.

Với stack hiện đại (Java 17/21 + Spring Boot 3): xem [java.md](java.md).

## Khi nào dùng file này

| Tình huống | Đọc |
|------------|-----|
| Java 8 / 11 (không cú pháp mới), Spring Boot 2.x, `javax.persistence` | **File này** |
| Java 17/21, Spring Boot 3, `jakarta.*`, virtual thread | [java.md](java.md) |
| Nâng cấp Boot 2 lên Boot 3 | Đọc cả hai: file này cho bẫy của stack cũ, `java.md` cho đích nâng cấp |

Trước khi chọn file, xác nhận `java.version`, phiên bản Spring Boot và tên package `javax` hay `jakarta` trong `pom.xml` / `build.gradle`.

## Lambda và functional interface

### Viết ngắn, ưu tiên method reference

```java
// ❌ Lambda dài khó đọc, khó test, khó debug
users.stream().forEach(u -> {
    // vài chục dòng logic nghiệp vụ...
});

// ✅ Tách method, hoặc dùng method reference
users.forEach(this::processUser);
```

### Ưu tiên functional interface của JDK

```java
// ❌ Tự định nghĩa functional interface không cần thiết
@FunctionalInterface
interface UserCallback {
    void accept(User u);
}

// ✅ Dùng Consumer / Function / Predicate / Supplier / BiFunction...
void process(Consumer<User> callback) { ... }
```

### Biến bị capture phải effectively final

```java
// ❌ Sửa biến bị capture: lỗi biên dịch (hoặc phải dùng mẹo Atomic/mảng)
int sum = 0;
list.forEach(n -> sum += n); // không biên dịch được

// ✅ Reduce bằng stream, hoặc dùng kiểu tích lũy khả biến rõ ràng
int sum = list.stream().mapToInt(Integer::intValue).sum();
```

## Stream API

### Không ép dùng Stream cho vòng lặp đơn giản

```java
// ❌ Chỉ có side effect: Stream không thêm giá trị
items.stream().forEach(item -> process(item));

// ✅ for-each thường rõ hơn
for (Item item : items) {
    process(item);
}
```

### Thu thập bằng `Collectors` trên Java 8

```java
// ❌ Stream.toList() có từ Java 16, Java 8 không có
list.stream().map(...).toList();

// ✅ Java 8
List<Dto> result = list.stream()
    .map(...)
    .collect(Collectors.toList());
```

`Collectors.toList()` không bảo đảm trả list bất biến. Cần list không sửa được: bọc bằng `Collections.unmodifiableList(...)` hoặc dùng Guava / `List.copyOf` (`List.copyOf` cần JDK mới hơn).

### Hai bẫy kinh điển của `Collectors.toMap`

```java
// ❌ Giá trị null: NPE (bên trong dùng Map.merge, không cho phép value null)
Map<Long, String> map = users.stream()
    .collect(Collectors.toMap(User::getId, User::getNickname)); // nickname có thể null

// ✅ Lọc trước, hoặc xử lý null rõ ràng
Map<Long, String> map = users.stream()
    .filter(u -> u.getNickname() != null)
    .collect(Collectors.toMap(User::getId, User::getNickname));

// ❌ Trùng key: IllegalStateException
.collect(Collectors.toMap(User::getName, Function.identity()));

// ✅ Truyền hàm merge
.collect(Collectors.toMap(User::getName, Function.identity(), (a, b) -> a));
```

### Cẩn thận với `parallelStream()`

```java
// ❌ Collection nhỏ / I/O / trạng thái khả biến dùng chung: thường chậm hơn hoặc không an toàn
list.parallelStream().forEach(sharedList::add); // race

// ❌ forEach có side effect ghi vào collection không đồng thời
map.entrySet().parallelStream().forEach(e -> result.put(e.getKey(), e.getValue()));

// ✅ Chỉ cân nhắc khi việc nặng CPU, không có trạng thái khả biến dùng chung, dữ liệu đủ lớn
// ✅ Thu thập bằng toMap / toConcurrentMap, không forEach ghi vào Map bên ngoài
Map<K, V> result = list.parallelStream()
    .collect(Collectors.toConcurrentMap(Item::getKey, Item::getValue, (a, b) -> a));
```

Parallel stream mặc định chạy trên `ForkJoinPool.commonPool()` và tranh tài nguyên với mọi việc parallel / CompletableFuture khác trong cùng tiến trình.

### Không sửa nguồn của stream, tránh `forEach` lồng nhau

```java
// ❌ Sửa nguồn trong pipeline: ConcurrentModificationException
list.stream().peek(list::add).count();

// ❌ forEach lồng nhau khó đọc, khó dừng sớm
a.forEach(x -> b.forEach(y -> ...));

// ✅ Logic tích Descartes / kiểu join: ưu tiên flatMap hoặc vòng lặp thường
```

### Ưu tiên primitive stream để tránh boxing

```java
// ❌ Stream<Integer> tốn chi phí boxing
int sum = list.stream().map(Order::getAmount).reduce(0, Integer::sum);

// ✅ IntStream / LongStream / DoubleStream
int sum = list.stream().mapToInt(Order::getAmount).sum();
```

## Optional

**Mục đích:** biểu diễn khả năng không có giá trị ở **kiểu trả về**, không phải thay thế null nói chung.

```java
// ❌ Optional làm field / tham số / phần tử collection (lỗi serialize, reflection, API rối)
class User {
    private Optional<String> email;
}
void send(Optional<String> email) { ... }
Optional<List<Order>> findOrders(); // list rỗng đã có nghĩa là "không có"

// ✅ Chỉ dùng làm kiểu trả về; "không có" thì trả collection rỗng
public Optional<User> findById(Long id) { ... }
public List<Order> findOrders(Long userId) { ... } // trả emptyList khi không có
```

### Không dùng `isPresent()` + `get()` như kiểm tra null

```java
// ❌ Dài hơn kiểm tra null, và get() vẫn có thể nổ
if (userOpt.isPresent()) {
    return userOpt.get().getName();
}
return "Unknown";

// ✅ Chuỗi lời gọi kiểu functional (Java 8 có sẵn)
return userOpt.map(User::getName).orElse("Unknown");
```

### `orElse` và `orElseGet`

```java
// ❌ Đối số của orElse luôn bị tính (kể cả khi Optional có giá trị)
return findUser(id).orElse(loadDefaultFromDb()); // luôn truy vấn CSDL

// ✅ Giá trị mặc định tốn kém: dùng orElseGet
return findUser(id).orElseGet(this::loadDefaultFromDb);

// ✅ Giá trị bắt buộc (Java 8)
return findUser(id).orElseThrow(() -> new UserNotFoundException(id));
// orElseThrow() không tham số có từ Java 10; Java 8 bắt buộc truyền Supplier
```

### `of` và `ofNullable`; lồng nhau thì dùng `flatMap`

```java
// ❌ of(null): NPE ngay
Optional.of(possiblyNull);

// ✅
Optional.ofNullable(possiblyNull);

// ❌ map trả về Optional: thành Optional<Optional<T>>
optional.map(this::findOther); // findOther trả Optional

// ✅
optional.flatMap(this::findOther);
```

Java 8 **không có** `Optional.stream()` / `ifPresentOrElse` / `or` (có từ Java 9). Lọc collection gồm Optional:

```java
list.stream()
    .map(this::findUser)
    .filter(Optional::isPresent)
    .map(Optional::get) // an toàn sau filter; hoặc tách helper
    .collect(Collectors.toList());
```

## Date/Time API (`java.time`)

Lỗi production hay gặp nhất ở hệ thống cũ: giữ `Date` / `Calendar` / `SimpleDateFormat`.

```java
// ❌ SimpleDateFormat không thread-safe; instance static dùng chung làm hỏng trạng thái
private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd");

// ✅ DateTimeFormatter bất biến, thread-safe
private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
```

### Chọn đúng kiểu

| Kiểu | Dùng cho |
|------|----------|
| `Instant` | Timestamp máy, audit, sự kiện giữa các dịch vụ (trục thời gian UTC) |
| `LocalDate` | Chỉ ngày (ngày sinh, ngày làm việc) |
| `LocalDateTime` | Ngày giờ **không** có múi giờ; không dùng cho "sự kiện xảy ra lúc nào" |
| `ZonedDateTime` / `OffsetDateTime` | Thời gian cho người đọc, cần múi giờ hoặc offset |

```java
// ❌ LocalDateTime cho "thời điểm đặt hàng": mơ hồ giữa các múi giờ / DST
private LocalDateTime createdAt = LocalDateTime.now();

// ✅ Instant cho thời điểm sự kiện; chỉ đổi sang múi giờ khi hiển thị
private Instant createdAt = Instant.now();

// ❌ now() phụ thuộc múi giờ mặc định của JVM: CI / prod / laptop cho kết quả khác nhau
LocalDate.now();

// ✅ Truyền ZoneId rõ ràng, hoặc inject Clock để test
LocalDate.now(ZoneOffset.UTC);
LocalDate.now(clock);
```

### Bẫy định dạng

```java
// ❌ YYYY là năm theo tuần: sai năm ở những ngày giáp năm mới
DateTimeFormatter.ofPattern("YYYY-MM-dd");

// ✅ Năm dương lịch dùng yyyy
DateTimeFormatter.ofPattern("yyyy-MM-dd");
```

Chuyển đổi với API cũ: `date.toInstant()`, `Date.from(instant)`, `LocalDateTime.ofInstant(instant, zone)`.

## Đồng thời: thread pool và CompletableFuture

Java 8 **không có virtual thread**. Việc nặng I/O cần pool có kích thước hợp lý, không dùng `newCachedThreadPool` hay hàng đợi không giới hạn.

```java
// ❌ Hàng đợi không giới hạn + chính sách từ chối mặc định: latency tăng vọt hoặc OOM khi tải cao
ExecutorService exec = Executors.newFixedThreadPool(8); // hàng đợi không giới hạn

// ❌ Không bao giờ shutdown: rò rỉ thread
Executors.newFixedThreadPool(8).submit(task);

// ✅ Hàng đợi có giới hạn + chính sách từ chối rõ ràng + quản lý vòng đời
ThreadPoolExecutor exec = new ThreadPoolExecutor(
    8, 16, 60L, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(500),
    new ThreadPoolExecutor.CallerRunsPolicy());
// Khi tắt: shutdown → awaitTermination → shutdownNow
```

### CompletableFuture

```java
// ❌ I/O trên common pool (supplyAsync không truyền Executor)
CompletableFuture.supplyAsync(() -> restTemplate.getForObject(url, Dto.class));

// ✅ Executor riêng cho I/O
CompletableFuture.supplyAsync(() -> callRemote(), ioExecutor);

// ❌ thenApply trả về CF: lồng thành CompletableFuture<CompletableFuture<T>>
.thenApply(id -> findAsync(id));

// ✅ Việc bất đồng bộ phụ thuộc nhau: thenCompose
.thenCompose(id -> findAsync(id));

// ❌ get()/join() trong callback bất đồng bộ: làm cạn pool hoặc deadlock
.thenApply(x -> other.join());

// ✅ Kết hợp bằng allOf / thenCombine; chỉ join một lần ở ranh giới
```

**Timeout:** Java 8 không có `orTimeout` / `completeOnTimeout` (có từ Java 9). Dùng `get(timeout, unit)`, hoặc scheduler + `applyToEither` để hoàn tất với exception.

**Exception:** gắn `exceptionally` / `handle` / `whenComplete` ở ranh giới chuỗi để lỗi không bị nuốt.

```java
// ❌ SimpleDateFormat khả biến dùng chung / HashMap làm cache
private static final SimpleDateFormat SDF = ...;
private final Map<String, String> cache = new HashMap<>(); // put đồng thời

// ✅ ConcurrentHashMap; ngày giờ dùng java.time
private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();
```

## Spring Boot 2

Package là **`javax.*`**, không phải `jakarta.*`. Không đòi chuyển sang Jakarta trừ khi mục tiêu của PR là nâng lên Boot 3.

### Dependency injection

```java
// ❌ Field @Autowired: khó test, phụ thuộc không rõ
@Autowired
private UserRepository userRepo;

// ✅ Constructor injection (Boot 2: chỉ một constructor thì bỏ được @Autowired)
private final UserRepository userRepo;

public UserService(UserRepository userRepo) {
    this.userRepo = userRepo;
}
```

### Cấu hình

```java
// ❌ Ghi cứng secret; @Value rải rác khắp nơi
@Value("${app.payment.api-key}")
private String apiKey;

// ✅ @ConfigurationProperties (Java 8 dùng class, không dùng record)
@ConfigurationProperties(prefix = "app.payment")
public class PaymentProperties {
    private String apiKey;
    private int timeoutMs;
    // getters / setters
}
```

Đăng ký bằng `@EnableConfigurationProperties`. Từ Boot **2.2+** dùng được `@ConfigurationPropertiesScan` (`@SpringBootApplication` mặc định quét package của class khởi động).

### RestTemplate phải có timeout

Mặc định **chờ vô hạn**. Một dịch vụ phía sau bị treo có thể làm cạn thread của Tomcat / worker. Thiếu timeout là P1.

```java
// ❌ new RestTemplate() trần: không timeout
return new RestTemplate();

// ✅ Boot 2.1+: timeout dạng Duration
@Bean
public RestTemplate restTemplate(RestTemplateBuilder builder) {
    return builder
        .setConnectTimeout(Duration.ofSeconds(2))
        .setReadTimeout(Duration.ofSeconds(5))
        .build();
}
```

Nếu tùy biến `ClientHttpRequestFactory` (ví dụ Apache HttpClient), đặt cả connect / read / connectionRequest timeout trên factory. Nếu không, timeout của builder có thể bị bỏ qua.

### Bẫy proxy của transaction (Boot 2 và 3 như nhau)

```java
// ❌ Gọi method trong cùng class: @Transactional không có tác dụng (không đi qua proxy)
public void create(Order o) {
    save(o); // gọi nội bộ
}
@Transactional
public void save(Order o) { ... }

// ✅ Đặt ranh giới transaction ở điểm vào public, hoặc tách sang bean khác
@Transactional
public void create(Order o) { saveInternal(o); }
```

`@Transactional` trên method `private` cũng không có tác dụng.

## JPA / Hibernate 5

Annotation của entity lấy từ `javax.persistence.*`.

### N+1

Nguyên lý chung giữa các ngôn ngữ: xem [n-plus-one.md](../n-plus-one.md).

```java
// ❌ EAGER, hoặc vòng lặp kích hoạt lazy load
@OneToMany(fetch = FetchType.EAGER)
private List<Order> orders;

for (User u : userRepo.findAll()) {
    u.getOrders().size(); // N truy vấn khi là lazy
}

// ✅ JOIN FETCH / @EntityGraph; mặc định giữ LAZY
@Query("SELECT u FROM User u JOIN FETCH u.orders")
List<User> findAllWithOrders();
```

### Transaction và read-only

```java
// ❌ Mở transaction ở Controller; hoặc @Transactional trên method private
// ✅ Method public ở Service; thao tác đọc đánh dấu readOnly
@Transactional(readOnly = true)
public User get(Long id) { ... }
```

### Entity và Lombok

```java
// ❌ equals/hashCode của @Data thường kéo theo quan hệ lazy
@Entity
@Data
public class User { ... }

// ✅ @Getter/@Setter; equals/hashCode dựa trên business key ổn định, hoặc id có kiểm tra null
// ⚠️ Không đưa quan hệ lazy vào; entity mới chưa lưu đều có id null,
//    nên equals chỉ dựa trên id coi các entity đó là khác nhau (thường chấp nhận được)
@Entity
@Getter
@Setter
public class User {
    @Id
    private Long id;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        return id != null && id.equals(((User) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
```

### Field thời gian

Hibernate 5 hỗ trợ `java.time`, nhưng ánh xạ `ZonedDateTime` vào cột `TIMESTAMP` không múi giờ chuẩn hóa theo múi giờ JVM và lệch giữa các vùng. Ưu tiên:

- Lưu UTC: `Instant` hoặc `OffsetDateTime`
- Đặt `spring.jpa.properties.hibernate.jdbc.time_zone=UTC` khi nhóm đã thống nhất
- Chuyển field `java.util.Date` cũ có chủ đích; code mới không thêm `Date` / `@Temporal`

## Xử lý exception

Boot 2 chưa hỗ trợ `ProblemDetail` của Spring 6 như thành phần chính (đó là chuyện của Boot 3). Dùng `@ControllerAdvice` dùng chung với HTTP status rõ ràng.

```java
// ❌ Nuốt exception, printStackTrace, trả null để che lỗi
try {
    userService.create(user);
} catch (Exception e) {
    e.printStackTrace();
    return null;
}

// ✅ Exception nghiệp vụ + handler tập trung
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(UserNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ApiError("USER_NOT_FOUND", e.getMessage()));
    }
}
```

Đóng tài nguyên bằng try-with-resources (Java 7+). Tránh tự viết `finally { close() }` rồi quên kiểm tra null.

## Test

```java
// ❌ Unit test nào cũng @SpringBootTest (chậm, dễ vỡ)
@SpringBootTest
public class UserServiceTest { ... }

// ✅ Unit test thuần: JUnit 4/5 + Mockito
@RunWith(MockitoJUnitRunner.class) // JUnit 4
// hoặc @ExtendWith(MockitoExtension.class) // JUnit 5
public class UserServiceTest {
    @Mock private UserRepository repo;
    @InjectMocks private UserService service;

    @Test
    public void shouldCreateUser() { ... }
}
```

Inject `Clock` vào logic phụ thuộc thời gian để test không phụ thuộc `Instant.now()`.

Stack cũ thường dùng JUnit 4. Nếu trộn JUnit 5, giữ một kiểu runner cho mỗi module.

## Tài liệu chính thức

- [JDK-8148463: Collectors.toMap fails on null values](https://bugs.openjdk.org/browse/JDK-8148463)
- [Oracle Tutorial: Parallelism](https://docs.oracle.com/javase/tutorial/collections/streams/parallelism.html)
- [Spring Boot RestTemplate customization](https://docs.spring.io/spring-boot/docs/2.7.x/reference/html/io.html#io.rest-client.resttemplate)

## Checklist

### Phiên bản và phạm vi

- [ ] Đã xác nhận Java 8 / Boot 2 / `javax.*`: không đòi API Java 17+ hay `jakarta.*`
- [ ] Không coi "dùng record / virtual thread / text block" là góp ý chặn merge (tối đa P3 💡)

### Tính năng ngôn ngữ

- [ ] Lambda ngắn; ưu tiên method reference và functional interface chuẩn
- [ ] Stream dùng để biến đổi / lọc / reduce, không dùng cho vòng lặp chỉ có side effect
- [ ] Thu thập bằng `Collectors.*` (không dùng `Stream.toList()`)
- [ ] `toMap` xử lý value null và key trùng
- [ ] `parallelStream` có lý do và không có trạng thái khả biến dùng chung
- [ ] Optional chỉ làm kiểu trả về; không lạm dụng `isPresent` + `get`; mặc định tốn kém dùng `orElseGet`
- [ ] Ngày giờ dùng `java.time`; không dùng chung `SimpleDateFormat`; đúng kiểu (`Instant` hay `LocalDateTime`)
- [ ] Pattern dùng `yyyy`, không dùng `YYYY` năm theo tuần (trừ khi cố ý)

### Đồng thời

- [ ] Thread pool có giới hạn và được shutdown; I/O không chạy trên `ForkJoinPool.commonPool()`
- [ ] CompletableFuture có Executor rõ ràng; dùng `thenCompose` cho tác vụ bất đồng bộ lồng nhau; có timeout và xử lý lỗi
- [ ] Trạng thái dùng chung dùng collection đồng thời; không có `DateFormat` static khả biến

### Spring Boot 2 / JPA

- [ ] Constructor injection; cấu hình qua `@ConfigurationProperties`
- [ ] `RestTemplate` (và RequestFactory) có connect/read timeout
- [ ] `@Transactional` đặt ở điểm vào public: không lỗi do tự gọi trong class hay method private
- [ ] Không có N+1; entity tránh `@Data`; chiến lược thời gian rõ ràng (UTC)
- [ ] Package thống nhất `javax.*`: không trộn javax và jakarta

### Chất lượng

- [ ] Không nuốt exception; phản hồi lỗi xử lý tập trung
- [ ] try-with-resources cho tài nguyên I/O và CSDL
- [ ] Logic cốt lõi có unit test; thời gian inject được qua `Clock`

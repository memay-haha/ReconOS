# Java

Dùng khi review code Java 17/21+ và Spring Boot 3. Trọng tâm: tính năng Java mới, Spring Boot 3, đồng thời (virtual thread), hiệu năng JPA và khả năng bảo trì.

Với Java 8, Spring Boot 2 hoặc code còn dùng `javax.*`: xem [java8.md](java8.md).

## Tính năng Java hiện đại (17/21+)

### Record

```java
// ❌ POJO/DTO truyền thống: nhiều code lặp
public class UserDto {
    private final String name;
    private final int age;

    public UserDto(String name, int age) {
        this.name = name;
        this.age = age;
    }
    // getters, equals, hashCode, toString...
}

// ✅ Record: gọn, bất biến, rõ nghĩa
public record UserDto(String name, int age) {
    // Compact constructor để kiểm tra dữ liệu
    public UserDto {
        if (age < 0) throw new IllegalArgumentException("Age cannot be negative");
    }
}
```

### Switch expression và pattern matching

```java
// ❌ Switch truyền thống: dễ quên break, dài và dễ sai
String type = "";
switch (obj) {
    case Integer i: // Java 16+
        type = String.format("int %d", i);
        break;
    case String s:
        type = String.format("string %s", s);
        break;
    default:
        type = "unknown";
}

// ✅ Switch expression: không rơi xuống case sau, bắt buộc trả giá trị
String type = switch (obj) {
    case Integer i -> "int %d".formatted(i);
    case String s  -> "string %s".formatted(s);
    case null      -> "null value"; // Java 21 xử lý null
    default        -> "unknown";
};
```

### Text block

```java
// ❌ Nối chuỗi SQL/JSON
String json = "{\n" +
              "  \"name\": \"Alice\",\n" +
              "  \"age\": 20\n" +
              "}";

// ✅ Text block: viết sao hiện vậy
String json = """
    {
      "name": "Alice",
      "age": 20
    }
    """;
```

## Stream API và Optional

### Không lạm dụng Stream

```java
// ❌ Vòng lặp đơn giản không cần Stream (tốn chi phí, khó đọc)
items.stream().forEach(item -> {
    process(item);
});

// ✅ Trường hợp đơn giản dùng for-each
for (var item : items) {
    process(item);
}

// ❌ Chuỗi Stream quá phức tạp
List<Dto> result = list.stream()
    .filter(...)
    .map(...)
    .peek(...)
    .sorted(...)
    .collect(...); // khó debug

// ✅ Tách thành các bước có tên rõ nghĩa
var filtered = list.stream().filter(...).toList();
// ...
```

### Dùng Optional đúng cách

```java
// ❌ Dùng Optional làm tham số hoặc field (lỗi serialize, khó gọi)
public void process(Optional<String> name) { ... }
public class User {
    private Optional<String> email; // không nên
}

// ✅ Optional chỉ dùng cho giá trị trả về
public Optional<User> findUser(String id) { ... }

// ❌ Đã dùng Optional mà vẫn isPresent() + get()
Optional<User> userOpt = findUser(id);
if (userOpt.isPresent()) {
    return userOpt.get().getName();
} else {
    return "Unknown";
}

// ✅ Dùng API kiểu functional
return findUser(id)
    .map(User::getName)
    .orElse("Unknown");
```

## Spring Boot

### Dependency injection

```java
// ❌ Field injection (@Autowired)
// Nhược điểm: khó test (phải inject bằng reflection), che giấu việc có quá nhiều phụ thuộc, không bất biến
@Service
public class UserService {
    @Autowired
    private UserRepository userRepo;
}

// ✅ Constructor injection
// Ưu điểm: phụ thuộc rõ ràng, dễ mock khi unit test, field có thể là final
@Service
public class UserService {
    private final UserRepository userRepo;

    public UserService(UserRepository userRepo) {
        this.userRepo = userRepo;
    }
}
// 💡 Lombok @RequiredArgsConstructor rút gọn code, nhưng cẩn thận phụ thuộc vòng
```

### Quản lý cấu hình

```java
// ❌ Ghi cứng giá trị cấu hình
@Service
public class PaymentService {
    private String apiKey = "sk_live_12345";
}

// ❌ @Value rải rác khắp code
@Value("${app.payment.api-key}")
private String apiKey;

// ✅ @ConfigurationProperties: cấu hình có kiểu
@ConfigurationProperties(prefix = "app.payment")
public record PaymentProperties(String apiKey, int timeout, String url) {}
```

Ghi cứng secret trong code là P0.

## JPA và hiệu năng CSDL

### Truy vấn N+1

Nguyên lý chung và cách xử lý ở các ngôn ngữ khác: xem [n-plus-one.md](../n-plus-one.md).

```java
// ❌ FetchType.EAGER hoặc lazy load bị kích hoạt trong vòng lặp
// Định nghĩa entity
@Entity
public class User {
    @OneToMany(fetch = FetchType.EAGER) // luôn tải orders, kể cả khi không cần
    private List<Order> orders;
}

// Code nghiệp vụ
List<User> users = userRepo.findAll(); // 1 câu SQL
for (User user : users) {
    // Nếu là lazy, chỗ này chạy thêm N câu SQL
    System.out.println(user.getOrders().size());
}

// ✅ Dùng @EntityGraph hoặc JOIN FETCH
@Query("SELECT u FROM User u JOIN FETCH u.orders")
List<User> findAllWithOrders();
```

### Quản lý transaction

```java
// ❌ Mở transaction ở tầng Controller (giữ kết nối CSDL quá lâu)
// ❌ Đặt @Transactional trên method private (AOP không có tác dụng)
@Transactional
private void saveInternal() { ... }

// ✅ Đặt @Transactional trên method public ở tầng Service
// ✅ Thao tác đọc khai báo rõ readOnly = true (tối ưu hiệu năng)
@Service
public class UserService {
    @Transactional(readOnly = true)
    public User getUser(Long id) { ... }

    @Transactional
    public void createUser(UserDto dto) { ... }
}
```

### Thiết kế entity

```java
// ❌ Dùng Lombok @Data trên entity
// equals/hashCode do @Data sinh ra gồm mọi field, có thể kích hoạt lazy load gây chậm hoặc exception
@Entity
@Data
public class User { ... }

// ✅ Chỉ dùng @Getter, @Setter
// ✅ Tự viết equals/hashCode (thường dựa trên ID)
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

## Đồng thời và virtual thread

### Virtual thread (Java 21+)

```java
// ❌ Thread pool truyền thống cho nhiều tác vụ I/O chặn (cạn tài nguyên)
ExecutorService executor = Executors.newFixedThreadPool(100);

// ✅ Virtual thread cho tác vụ nặng I/O (throughput cao)
// Spring Boot 3.2+ bật bằng: spring.threads.virtual.enabled=true
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

// Trong virtual thread, thao tác chặn (truy vấn CSDL, HTTP request) gần như không chiếm OS thread
```

### Thread-safe

```java
// ❌ SimpleDateFormat không thread-safe
private static final SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");

// ✅ Dùng DateTimeFormatter (Java 8+)
private static final DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd");

// ❌ HashMap mất dữ liệu khi dùng nhiều thread (Java 7 trở về trước còn có thể lặp vô hạn khi resize;
//    Java 8 đã sửa lỗi lặp vô hạn nhưng HashMap vẫn không thread-safe)
// ✅ Dùng ConcurrentHashMap
Map<String, String> cache = new ConcurrentHashMap<>();
```

## Quy ước dùng Lombok

```java
// ❌ Lạm dụng @Builder nên không bắt buộc được field bắt buộc
@Builder
public class Order {
    private String id; // bắt buộc
    private String note; // tùy chọn
}
// Người gọi có thể bỏ sót id: Order.builder().note("hi").build();

// ✅ Đối tượng nghiệp vụ quan trọng: tự viết Builder hoặc constructor để giữ bất biến
// Hoặc thêm kiểm tra trong build() (Lombok @Builder.Default...)
```

## Xử lý exception

### Xử lý exception tập trung

```java
// ❌ try-catch khắp nơi, nuốt exception hoặc chỉ in log
try {
    userService.create(user);
} catch (Exception e) {
    e.printStackTrace(); // không dùng ở production
    // return null; // nuốt exception, tầng trên không biết chuyện gì xảy ra
}

// ✅ Exception tự định nghĩa + @ControllerAdvice (ProblemDetail của Spring Boot 3)
public class UserNotFoundException extends RuntimeException { ... }

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(UserNotFoundException.class)
    public ProblemDetail handleNotFound(UserNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }
}
```

## Test

### Unit test và integration test

```java
// ❌ Unit test phụ thuộc CSDL thật hoặc dịch vụ ngoài
@SpringBootTest // khởi động cả context, chậm
public class UserServiceTest { ... }

// ✅ Unit test dùng Mockito
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock UserRepository repo;
    @InjectMocks UserService service;

    @Test
    void shouldCreateUser() { ... }
}

// ✅ Integration test dùng Testcontainers
@Testcontainers
@SpringBootTest
class UserRepositoryTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");
    // ...
}
```

## Checklist

### Cơ bản và quy ước

- [ ] Dùng tính năng Java 17/21 (switch expression, record, text block)
- [ ] Không dùng class đã lỗi thời (`Date`, `Calendar`, `SimpleDateFormat`)
- [ ] Thao tác collection ưu tiên Stream API hoặc method của `Collections`
- [ ] `Optional` chỉ dùng cho giá trị trả về, không dùng cho field hay tham số

### Spring Boot

- [ ] Dùng constructor injection thay vì field injection `@Autowired`
- [ ] Thuộc tính cấu hình dùng `@ConfigurationProperties`
- [ ] Controller chỉ một trách nhiệm, logic nghiệp vụ nằm ở Service
- [ ] Xử lý exception tập trung bằng `@ControllerAdvice` / `ProblemDetail`

### CSDL và transaction

- [ ] Transaction đọc có `@Transactional(readOnly = true)`
- [ ] Không có truy vấn N+1 (EAGER fetch hoặc gọi trong vòng lặp)
- [ ] Entity không dùng `@Data`, equals/hashCode viết đúng
- [ ] Index CSDL phủ điều kiện truy vấn

### Đồng thời và hiệu năng

- [ ] Tác vụ nặng I/O đã cân nhắc virtual thread
- [ ] Dùng đúng class thread-safe (`ConcurrentHashMap` thay vì `HashMap`)
- [ ] Phạm vi lock hợp lý, không làm I/O khi đang giữ lock

### Khả năng bảo trì

- [ ] Logic nghiệp vụ quan trọng có đủ unit test
- [ ] Ghi log hợp lý (dùng Slf4j, không dùng `System.out`)
- [ ] Magic value tách thành hằng số hoặc enum

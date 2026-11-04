# Review kiến trúc và SOLID

Dùng khi thay đổi đụng tới cấu trúc module, class, interface, hướng phụ thuộc, hoặc khi cần đề xuất refactor. File gom điểm kiểm tra SOLID, anti-pattern, coupling và cohesion, phân tầng, cách dùng design pattern, khả năng mở rộng, cấu trúc code và cách đề xuất tách nhỏ an toàn.

## Nguyên tắc SOLID

### S: Single Responsibility Principle (SRP)

Điểm kiểm tra:

- Class hoặc module chỉ có một lý do để thay đổi?
- Mọi method trong class phục vụ cùng một mục đích?
- Mô tả class cho người không làm kỹ thuật được trong một câu?

Dấu hiệu khi review:

- Tên class chứa từ chung chung: `And`, `Manager`, `Handler`, `Processor`.
- Class dài hơn 200-300 dòng.
- Class có hơn 5-7 method public.
- Các method thao tác trên dữ liệu hoàn toàn khác nhau.
- File ôm nhiều concern không liên quan, ví dụ HTTP, CSDL và quy tắc nghiệp vụ trong cùng một file.
- Module lớn, cohesion thấp hoặc có nhiều lý do để thay đổi.
- Hàm điều phối nhiều bước không liên quan nhau.
- God object biết quá nhiều về hệ thống.

Câu hỏi review:

- "Class này chịu trách nhiệm những việc gì? Tách được không?"
- "Nếu yêu cầu X đổi, method nào phải sửa? Nếu yêu cầu Y đổi thì sao?"
- "Lý do duy nhất khiến module này thay đổi là gì?"

### O: Open/Closed Principle (OCP)

Điểm kiểm tra:

- Thêm tính năng mới có phải sửa code hiện có không?
- Thêm hành vi mới bằng mở rộng (kế thừa, composition) được không?
- Có nhiều chuỗi `if/else` hoặc `switch` để xử lý từng loại không?

Dấu hiệu khi review:

- Chuỗi `switch` hoặc `if-else` xử lý từng loại.
- Thêm tính năng phải sửa class lõi.
- Kiểm tra kiểu (`instanceof`, `typeof`) rải khắp code.
- Thêm một hành vi phải sửa nhiều khối `switch/if`.
- Tính năng tăng thì phải sửa logic lõi thay vì mở rộng.
- Không có điểm mở rộng plugin, strategy, hook cho phần biến đổi.

Câu hỏi review:

- "Thêm loại X mới thì phải sửa những file nào?"
- "Câu lệnh `switch` này có dài thêm mỗi khi có loại mới không?"
- "Thêm một biến thể mới mà không đụng code cũ được không?"

### L: Liskov Substitution Principle (LSP)

Điểm kiểm tra:

- Class con thay hoàn toàn class cha được không?
- Class con có đổi hành vi mong đợi của method class cha không?
- Class con có ném exception mà class cha không khai báo không?

Dấu hiệu khi review:

- Ép kiểu tường minh (casting).
- Method class con ném `NotImplementedException`.
- Method class con rỗng hoặc chỉ `return`.
- Nơi dùng class cơ sở phải kiểm tra kiểu cụ thể.
- Class con kiểm tra kiểu cụ thể hoặc ném lỗi cho method của class cơ sở.
- Method override nới lỏng tiền điều kiện hoặc siết hậu điều kiện.
- Class con bỏ qua hoặc vô hiệu hóa hành vi của class cha.

Câu hỏi review:

- "Thay class cha bằng class con thì code gọi có phải sửa không?"
- "Hành vi của method này ở class con có đúng contract của class cha không?"
- "Thay bất kỳ class con nào mà bên gọi không cần biết được không?"

### I: Interface Segregation Principle (ISP)

Điểm kiểm tra:

- Interface có đủ nhỏ và tập trung không?
- Class implementation có bị ép implement method không cần không?
- Client có phụ thuộc vào method không dùng tới không?

Dấu hiệu khi review:

- Interface có hơn 5-7 method.
- Class implementation có method rỗng hoặc ném `NotImplementedException`.
- Tên interface quá rộng (`IManager`, `IService`).
- Mỗi client chỉ dùng một phần interface.
- Interface nhiều method mà phần lớn class implementation không dùng.
- Bên gọi phụ thuộc interface rộng cho nhu cầu hẹp.

Câu hỏi review:

- "Mọi class implementation có dùng hết các method của interface này không?"
- "Tách interface lớn này thành các interface nhỏ chuyên dụng được không?"

### D: Dependency Inversion Principle (DIP)

Điểm kiểm tra:

- Module cấp cao phụ thuộc vào abstraction hay vào implementation cụ thể?
- Có dùng dependency injection thay vì `new` trực tiếp không?
- Abstraction do module cấp cao định nghĩa hay do module cấp thấp định nghĩa?

Dấu hiệu khi review:

- Module cấp cao `new` trực tiếp class cụ thể của module cấp thấp.
- Import class implementation cụ thể thay vì interface hoặc class trừu tượng.
- Cấu hình và chuỗi kết nối hard-code trong logic nghiệp vụ.
- Khó viết unit test cho class.
- Logic cấp cao phụ thuộc kiểu IO, lưu trữ, mạng cụ thể.
- Chuỗi import gắn chặt logic nghiệp vụ vào hạ tầng.

Câu hỏi review:

- "Phụ thuộc của class này có thay bằng mock khi test được không?"
- "Đổi implementation CSDL hoặc API thì phải sửa bao nhiêu chỗ?"
- "Đổi implementation mà không sửa logic nghiệp vụ được không?"

## Code smell ngoài SOLID

| Smell | Dấu hiệu |
|---|---|
| Long method | Hàm dài hơn 30 dòng, lồng nhiều cấp |
| Feature envy | Method dùng dữ liệu của class khác nhiều hơn của class mình |
| Data clumps | Cùng một nhóm tham số truyền đi truyền lại |
| Primitive obsession | Dùng chuỗi, số thay cho kiểu miền nghiệp vụ |
| Shotgun surgery | Một thay đổi phải sửa ở nhiều file |
| Divergent change | Một file thay đổi vì nhiều lý do không liên quan |
| Dead code | Code không chạy tới hoặc không ai gọi |
| Speculative generality | Abstraction cho nhu cầu tương lai giả định |
| Magic numbers/strings | Giá trị hard-code không có hằng số đặt tên |

## Anti-pattern kiến trúc

### Anti-pattern nguy hiểm

| Anti-pattern | Dấu hiệu | Ảnh hưởng |
|---|---|---|
| Big Ball of Mud | Không có ranh giới module rõ, code nào cũng gọi được code nào | Khó hiểu, khó sửa, khó test |
| God Object | Một class ôm quá nhiều trách nhiệm, biết quá nhiều, làm quá nhiều | Coupling cao, khó tái sử dụng và test |
| Spaghetti code | Luồng điều khiển rối, `goto` hoặc lồng sâu, khó lần theo đường chạy | Khó hiểu và bảo trì |
| Lava Flow | Code cũ không ai dám động, thiếu tài liệu và test | Nợ kỹ thuật tích tụ |

### Anti-pattern thiết kế

| Anti-pattern | Dấu hiệu | Đề xuất |
|---|---|---|
| Golden Hammer | Dùng một công nghệ hoặc pattern cho mọi vấn đề | Chọn giải pháp theo vấn đề |
| Gas Factory (over-engineering) | Vấn đề đơn giản giải bằng phương án phức tạp, lạm dụng design pattern | Theo YAGNI, làm đơn giản trước |
| Boat Anchor | Code chưa dùng viết cho "sau này có thể cần" | Xóa code chưa dùng, cần thì viết lại |
| Copy-paste programming | Cùng logic xuất hiện ở nhiều nơi | Tách method hoặc module dùng chung |

### Mẫu nhận xét

```markdown
P1 🔴 "Class này dài 2000 dòng, đề xuất tách thành nhiều class tập trung"
P2 🟡 "Logic này lặp ở 3 chỗ, cân nhắc tách thành method dùng chung?"
💡 "Câu lệnh switch này thay bằng strategy pattern thì dễ mở rộng hơn"
```

## Coupling và cohesion

### Loại coupling (tốt đến xấu)

| Loại | Mô tả | Ví dụ |
|---|---|---|
| Message coupling ✅ | Truyền dữ liệu qua tham số | `calculate(price, quantity)` |
| Data coupling ✅ | Dùng chung cấu trúc dữ liệu đơn giản | `processOrder(orderDTO)` |
| Stamp coupling ⚠️ | Dùng chung cấu trúc phức tạp nhưng chỉ dùng một phần | Truyền cả object `User` nhưng chỉ dùng `name` |
| Control coupling ⚠️ | Truyền cờ điều khiển làm đổi hành vi | `process(data, isAdmin=true)` |
| Common coupling ❌ | Dùng chung biến toàn cục | Nhiều module đọc ghi cùng một trạng thái toàn cục |
| Content coupling ❌ | Truy cập thẳng phần bên trong module khác | Thao tác trực tiếp thuộc tính private của class khác |

### Loại cohesion (tốt đến xấu)

| Loại | Mô tả | Chất lượng |
|---|---|---|
| Functional cohesion | Mọi phần tử cùng làm một nhiệm vụ | ✅ Tốt nhất |
| Sequential cohesion | Đầu ra bước này là đầu vào bước sau | ✅ Tốt |
| Communicational cohesion | Thao tác trên cùng dữ liệu | ⚠️ Chấp nhận được |
| Temporal cohesion | Các việc chạy cùng thời điểm | ⚠️ Kém |
| Logical cohesion | Liên quan về logic nhưng chức năng khác nhau | ❌ Xấu |
| Coincidental cohesion | Không có quan hệ rõ ràng | ❌ Xấu nhất |

### Chỉ số tham khảo

```yaml
coupling:
  CBO (coupling giữa các lớp):
    tốt: < 5
    cảnh báo: 5-10
    nguy hiểm: > 10

  Ce (efferent coupling):
    mô tả: phụ thuộc vào bao nhiêu lớp bên ngoài
    tốt: < 7

  Ca (afferent coupling):
    mô tả: bao nhiêu lớp phụ thuộc vào nó
    giá trị cao nghĩa là: sửa đổi ảnh hưởng rộng, cần ổn định

cohesion:
  LCOM4 (thiếu cohesion giữa phương thức):
    1: một trách nhiệm ✅
    2-3: có thể cần tách ⚠️
    ">3": nên tách ❌
```

### Câu hỏi review

- "Module này phụ thuộc bao nhiêu module khác? Giảm được không?"
- "Sửa class này ảnh hưởng tới bao nhiêu chỗ khác?"
- "Các method của class có cùng thao tác trên một dữ liệu không?"

## Phân tầng và hướng phụ thuộc

### Các tầng Clean Architecture

```text
┌─────────────────────────────────────┐
│         Frameworks & Drivers        │ <- ngoài cùng: Web, CSDL, UI
├─────────────────────────────────────┤
│         Interface Adapters          │ <- Controllers, Gateways, Presenters
├─────────────────────────────────────┤
│          Application Layer          │ <- Use Cases, Application Services
├─────────────────────────────────────┤
│            Domain Layer             │ <- Entities, Domain Services
└─────────────────────────────────────┘
        ↑ phụ thuộc chỉ hướng vào trong ↑
```

### Quy tắc phụ thuộc

Quy tắc lõi: phụ thuộc trong code chỉ được trỏ vào tầng trong.

```typescript
// ❌ Vi phạm quy tắc phụ thuộc: tầng Domain phụ thuộc Infrastructure
// domain/User.ts
import { MySQLConnection } from '../infrastructure/database';

// ✅ Đúng: Domain định nghĩa interface, Infrastructure implement
// domain/UserRepository.ts (interface)
interface UserRepository {
  findById(id: string): Promise<User>;
}

// infrastructure/MySQLUserRepository.ts (implementation)
class MySQLUserRepository implements UserRepository {
  findById(id: string): Promise<User> { /* ... */ }
}
```

### Danh sách kiểm tra

Ranh giới tầng:

- [ ] Tầng Domain có phụ thuộc bên ngoài (CSDL, HTTP, file system) không?
- [ ] Tầng Application có thao tác thẳng CSDL hoặc gọi thẳng API ngoài không?
- [ ] Controller có chứa logic nghiệp vụ không?
- [ ] Có gọi vượt tầng không (UI gọi thẳng Repository)?

Tách concern:

- [ ] Logic nghiệp vụ tách khỏi logic hiển thị?
- [ ] Truy cập dữ liệu gói trong tầng riêng?
- [ ] Code cấu hình và code phụ thuộc môi trường quản lý tập trung?

### Mẫu nhận xét

```markdown
P1 🔴 "Entity Domain import thẳng kết nối CSDL, vi phạm quy tắc phụ thuộc"
P2 🟡 "Controller chứa logic tính toán nghiệp vụ, đề xuất chuyển sang tầng Service"
💡 "Cân nhắc dùng dependency injection để gỡ coupling giữa các thành phần này"
```

## Đánh giá cách dùng design pattern

### Khi nào dùng

| Pattern | Hợp khi | Không hợp khi |
|---|---|---|
| Factory | Cần tạo nhiều loại object, loại quyết định lúc chạy | Chỉ có một loại, hoặc loại cố định |
| Strategy | Thuật toán cần đổi lúc chạy, có nhiều hành vi thay thế nhau | Chỉ có một thuật toán, hoặc thuật toán không đổi |
| Observer | Phụ thuộc một-nhiều, đổi trạng thái phải báo nhiều object | Gọi trực tiếp đơn giản là đủ |
| Singleton | Thật sự cần một instance duy nhất toàn cục, ví dụ quản lý cấu hình | Object truyền qua dependency injection được |
| Decorator | Cần thêm trách nhiệm động, tránh bùng nổ kế thừa | Trách nhiệm cố định, không cần kết hợp động |

### Dấu hiệu thiết kế thừa (patternitis)

1. `if/else` đơn giản bị thay bằng strategy pattern kèm factory kèm registry.
2. Interface chỉ có một implementation.
3. Tầng abstraction thêm vào cho "sau này có thể cần".
4. Số dòng code tăng mạnh vì áp pattern.
5. Người mới mất nhiều thời gian mới hiểu cấu trúc code.

### Nguyên tắc đánh giá

```markdown
✅ Dùng pattern đúng:
- Giải quyết vấn đề mở rộng có thật
- Code dễ hiểu và dễ test hơn
- Thêm tính năng mới đơn giản hơn

❌ Lạm dụng pattern:
- Dùng pattern chỉ để dùng pattern
- Thêm độ phức tạp không cần thiết
- Vi phạm YAGNI
```

### Câu hỏi review

- "Pattern này giải quyết vấn đề cụ thể nào?"
- "Không dùng pattern này thì code gặp vấn đề gì?"
- "Giá trị tầng abstraction này mang lại có lớn hơn độ phức tạp tầng này thêm vào không?"

## Khả năng mở rộng

### Danh sách kiểm tra

Mở rộng tính năng:

- [ ] Thêm tính năng mới có phải sửa code lõi không?
- [ ] Có điểm mở rộng (hook, plugin, event) không?
- [ ] Cấu hình có đưa ra ngoài (file cấu hình, biến môi trường) không?

Mở rộng dữ liệu:

- [ ] Mô hình dữ liệu có hỗ trợ thêm trường không?
- [ ] Đã tính tới tình huống dữ liệu tăng chưa?
- [ ] Truy vấn có index phù hợp không?

Mở rộng tải:

- [ ] Mở rộng ngang được không (thêm instance)?
- [ ] Có phụ thuộc trạng thái (session, cache cục bộ) không?
- [ ] Kết nối CSDL có dùng connection pool không?

### Thiết kế điểm mở rộng

```typescript
// ✅ Thiết kế mở rộng tốt: dùng event hoặc hook
class OrderService {
  private hooks: OrderHooks;

  async createOrder(order: Order) {
    await this.hooks.beforeCreate?.(order);
    const result = await this.save(order);
    await this.hooks.afterCreate?.(result);
    return result;
  }
}

// ❌ Thiết kế mở rộng kém: hard-code mọi hành vi
class OrderService {
  async createOrder(order: Order) {
    await this.sendEmail(order);        // hard-code
    await this.updateInventory(order);  // hard-code
    await this.notifyWarehouse(order);  // hard-code
    return await this.save(order);
  }
}
```

### Mẫu nhận xét

```markdown
💡 "Sau này cần hỗ trợ phương thức thanh toán mới thì thiết kế này có dễ mở rộng không?"
P2 🟡 "Logic ở đây hard-code, cân nhắc dùng cấu hình hoặc strategy pattern?"
📚 "Kiến trúc hướng sự kiện giúp tính năng này dễ mở rộng hơn"
```

## Cấu trúc code

### Tổ chức thư mục

Tổ chức theo tính năng hoặc miền nghiệp vụ (nên dùng):

```text
src/
├── user/
│   ├── User.ts           (entity)
│   ├── UserService.ts    (service)
│   ├── UserRepository.ts (truy cập dữ liệu)
│   └── UserController.ts (API)
├── order/
│   ├── Order.ts
│   ├── OrderService.ts
│   └── ...
└── shared/
    ├── utils/
    └── types/
```

Tổ chức theo tầng kỹ thuật (không nên dùng):

```text
src/
├── controllers/     <- các miền khác nhau trộn lẫn
│   ├── UserController.ts
│   └── OrderController.ts
├── services/
├── repositories/
└── models/
```

### Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
|---|---|---|
| Tên class | PascalCase, danh từ | `UserService`, `OrderRepository` |
| Tên method | camelCase, động từ | `createUser`, `findOrderById` |
| Tên interface | Tiền tố `I` hoặc không tiền tố | `IUserService` hoặc `UserService` |
| Hằng số | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Thuộc tính private | Tiền tố gạch dưới hoặc không | `_cache` hoặc `#cache` |

Quy ước riêng của dự án hoặc ngôn ngữ được ưu tiên hơn bảng trên.

### Giới hạn kích thước

```yaml
giới hạn đề xuất:
  một file: < 300 dòng
  một hàm: < 50 dòng
  một lớp: < 200 dòng
  tham số hàm: < 4
  độ sâu lồng: < 4 cấp

khi vượt giới hạn:
  - cân nhắc tách thành đơn vị nhỏ hơn
  - dùng composition thay cho kế thừa
  - tách hàm hoặc lớp phụ trợ
```

### Mẫu nhận xét

```markdown
P3 🟢 "File 500 dòng này có thể tách theo trách nhiệm"
P2 🟡 "Đề xuất tổ chức thư mục theo miền nghiệp vụ thay vì theo tầng kỹ thuật"
💡 "Tên hàm `process` chưa rõ, cân nhắc đổi thành `calculateOrderTotal`?"
```

## Heuristic refactor

1. Tách theo trách nhiệm, không tách theo kích thước. File nhỏ vẫn có thể vi phạm SRP.
2. Chỉ thêm abstraction khi cần. Chờ trường hợp dùng thứ hai.
3. Refactor từng bước nhỏ. Cô lập hành vi trước khi di chuyển.
4. Giữ nguyên hành vi trước tiên. Thêm test trước khi tái cấu trúc.
5. Đặt tên theo ý định. Đặt tên khó thì abstraction có thể sai.
6. Ưu tiên composition hơn kế thừa. Kế thừa tạo coupling chặt.
7. Làm cho trạng thái không hợp lệ không biểu diễn được. Dùng kiểu dữ liệu để ép bất biến.

## Đề xuất refactor an toàn

- Khi đề xuất refactor: giải thích vì sao thay đổi cải thiện cohesion hoặc coupling, rồi phác thảo cách tách nhỏ nhất và an toàn.
- Khi refactor không đơn giản: đề xuất kế hoạch tăng dần thay vì viết lại lớn.

Kế hoạch tăng dần nên có:

1. Test giữ hành vi hiện tại, viết trước khi động vào code.
2. Bước tách đầu tiên nhỏ nhất (ví dụ tách một hàm, một interface) có thể merge riêng.
3. Các bước tiếp theo, mỗi bước merge được độc lập và giữ test xanh.
4. Điểm kiểm tra sau mỗi bước: test, chỉ số (lỗi, độ trễ, số lần gọi).
5. Bước dọn code cũ sau cùng. Dùng mẫu trong [removal-plan.md](removal-plan.md).

## Tham chiếu nhanh

### Kiểm tra kiến trúc trong 5 phút

```markdown
- [ ] Hướng phụ thuộc đúng? (tầng ngoài phụ thuộc tầng trong)
- [ ] Có phụ thuộc vòng không?
- [ ] Logic nghiệp vụ lõi tách khỏi framework, UI, CSDL?
- [ ] Tuân theo SOLID?
- [ ] Có anti-pattern rõ ràng không?
```

### Cờ đỏ (phải xử lý)

```markdown
P1 🔴 God Object: một class dài hơn 1000 dòng
P1 🔴 Phụ thuộc vòng: A -> B -> C -> A
P1 🔴 Tầng Domain chứa phụ thuộc framework
P0 🔴 Cấu hình và secret hard-code
P1 🔴 Gọi dịch vụ ngoài không qua interface
```

### Cờ vàng (nên xử lý)

```markdown
P2 🟡 Coupling giữa các class (CBO) > 10
P2 🟡 Method có hơn 5 tham số
P2 🟡 Độ sâu lồng hơn 4 cấp
P2 🟡 Khối code lặp > 10 dòng
P2 🟡 Interface chỉ có một implementation
```

## Công cụ

| Công cụ | Dùng để | Ngôn ngữ |
|---|---|---|
| SonarQube | Chất lượng code, phân tích coupling | Nhiều ngôn ngữ |
| NDepend | Phân tích phụ thuộc, quy tắc kiến trúc | .NET |
| JDepend | Phân tích phụ thuộc package | Java |
| Madge | Đồ thị phụ thuộc module | JavaScript/TypeScript |
| ESLint | Quy chuẩn code, kiểm tra độ phức tạp | JavaScript/TypeScript |
| CodeScene | Nợ kỹ thuật, phân tích hotspot | Nhiều ngôn ngữ |

## Checklist

- [ ] Mỗi class, module có một lý do để thay đổi (SRP).
- [ ] Thêm biến thể mới không phải sửa chuỗi `switch/if` ở nhiều nơi (OCP).
- [ ] Class con thay được class cha, không ném `NotImplementedException`, không cần kiểm tra kiểu (LSP).
- [ ] Interface nhỏ, mọi class implementation dùng hết method (ISP).
- [ ] Logic cấp cao phụ thuộc abstraction, thay được bằng mock (DIP).
- [ ] Không có anti-pattern nguy hiểm: Big Ball of Mud, God Object, spaghetti code, Lava Flow.
- [ ] Không có anti-pattern thiết kế: Golden Hammer, over-engineering, Boat Anchor, copy-paste.
- [ ] Coupling ở mức message hoặc data. Không có common coupling, content coupling.
- [ ] Phụ thuộc chỉ hướng vào trong, không có phụ thuộc vòng, không gọi vượt tầng.
- [ ] Design pattern giải quyết vấn đề có thật, không có interface một implementation vô cớ.
- [ ] Điểm mở rộng, cấu hình ngoài, khả năng mở rộng ngang đã xét.
- [ ] Kích thước file, hàm, class, số tham số, độ sâu lồng trong giới hạn.
- [ ] Đề xuất refactor kèm lý do về cohesion hoặc coupling và kế hoạch tăng dần.

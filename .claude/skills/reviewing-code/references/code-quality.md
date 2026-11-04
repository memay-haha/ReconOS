# Chất lượng code dùng chung mọi ngôn ngữ

Dùng ở bước review từng dòng cho mọi PR, bất kể ngôn ngữ. File gom anti-pattern về tái sử dụng, tham số, abstraction, điều kiện, trạng thái, race condition, cùng các mục xử lý lỗi, hiệu năng và điều kiện biên.

## Mục lục

- [Tái sử dụng code](#tái-sử-dụng-code)
- [Parameter sprawl](#parameter-sprawl)
- [Leaky abstraction](#leaky-abstraction)
- [Stringly-typed](#stringly-typed)
- [Điều kiện lồng nhau](#điều-kiện-lồng-nhau)
- [Copy-paste có biến thể](#copy-paste-có-biến-thể)
- [No-op update](#no-op-update)
- [TOCTOU](#toctou)
- [Thao tác quá rộng](#thao-tác-quá-rộng)
- [Redundant state](#redundant-state)
- [Xử lý lỗi](#xử-lý-lỗi)
- [Hiệu năng và cache](#hiệu-năng-và-cache)
- [Điều kiện biên](#điều-kiện-biên)
- [Checklist](#checklist)

## Tái sử dụng code

Trước khi chấp nhận code mới, tìm trong codebase xem đã có helper dùng lại được chưa.

```python
# ❌ Viết mới logic ghép đường dẫn, trong khi dự án đã có PathBuilder
def get_config_path(name):
    base = os.environ.get("APP_ROOT", ".")
    return os.path.join(base, "config", name + ".json")

# ✅ Dùng PathBuilder có sẵn
def get_config_path(name):
    return PathBuilder.config(f"{name}.json")
```

```javascript
// ❌ Tự viết debounce, trong khi dự án đã có lodash hoặc utils/debounce.ts
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ✅ Dùng helper có sẵn
import { debounce } from "@/utils/debounce";
```

Điểm review:

- Hàm mới có trùng tên hoặc trùng chức năng với helper đã có?
- Logic inline có thay được bằng lời gọi tới module đã có?
- Đã xem file bên cạnh và thư mục `shared/`, `utils/` chưa?

## Parameter sprawl

Tham số hàm tăng dần theo từng yêu cầu mới.

```python
# ❌ Mỗi yêu cầu mới thêm một tham số
def create_user(name, email, role, team, active, avatar_url, timezone):
    ...

# ✅ Dùng object cấu hình hoặc dataclass
@dataclass
class CreateUserParams:
    name: str
    email: str
    role: Role = Role.MEMBER
    team: str | None = None
    active: bool = True
    avatar_url: str | None = None
    timezone: str = "UTC"

def create_user(params: CreateUserParams) -> User:
    ...
```

```typescript
// ❌ Từ 6 tham số vị trí trở lên
function renderWidget(
  title: string, width: number, height: number,
  theme: string, collapsible: boolean, icon: string
) { ... }

// ✅ Options object pattern
interface WidgetOptions {
  title: string;
  width?: number;
  height?: number;
  theme?: "light" | "dark";
  collapsible?: boolean;
  icon?: string;
}
function renderWidget(options: WidgetOptions) { ... }
```

Điểm review:

- Hàm có từ 4 tham số trở lên? Cân nhắc options object hoặc dataclass.
- Tham số mới chỉ là cờ boolean? Cân nhắc enum hoặc strategy pattern.
- Có cặp tham số loại trừ nhau kiểu `enable_x`, `disable_y`?

## Leaky abstraction

Lộ chi tiết implementation bên trong ra ngoài.

```python
# ❌ Trả về object ORM nội bộ, bên gọi buộc phải biết SQLAlchemy
def get_users():
    return session.query(User).filter(User.active == True).all()

# ✅ Trả về object miền, giấu tầng lưu trữ
def get_active_users() -> list[UserDTO]:
    rows = user_repo.find_active()
    return [UserDTO.from_row(r) for r in rows]
```

```typescript
// ❌ Component nhận nguyên cấu trúc response của API
<UserCard user={apiResponse.data.results[0]} />

// ✅ Component nhận kiểu miền, adapter lo việc ánh xạ
interface UserSummary {
  displayName: string;
  avatarUrl: string;
}
<UserCard user={adaptUser(apiResponse)} />
```

Điểm review:

- Kiểu trả về có lộ implementation bên dưới (ORM, HTTP client, định dạng file)?
- Component hoặc hàm có phụ thuộc cấu trúc dữ liệu của hệ thống ngoài?
- Có phá ranh giới abstraction đang có không?

## Stringly-typed

Dùng chuỗi thô thay cho hằng số hoặc enum.

```python
# ❌ Magic string rải khắp nơi
if status == "active":
    ...
if role == "admin":
    ...

# ✅ Dùng enum
class Status(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"

if user.status == Status.ACTIVE:
    ...
```

```typescript
// ❌ Tên event là chuỗi thô, gõ sai không báo lỗi
emitter.emit("userCreated", data);
emitter.on("usercreated", handler); // bug: gõ sai

// ✅ Hằng số hoặc branded type
const Events = {
  USER_CREATED: "userCreated",
  USER_SUSPENDED: "userSuspended",
} as const;
emitter.emit(Events.USER_CREATED, data);
```

Điểm review:

- Có dùng chuỗi thay cho enum hoặc union type đã có?
- Tên event, action type, giá trị status có rải ở nhiều file?
- So sánh chuỗi có phân biệt hoa thường mà chưa chuẩn hóa?

## Điều kiện lồng nhau

Chuỗi toán tử ba ngôi và `if/else` lồng nhau.

```python
# ❌ Chuỗi ba ngôi khó đọc
label = (
    "Admin" if role == "admin" else
    "Manager" if role == "manager" else
    "Viewer" if role == "viewer" else
    "Unknown"
)

# ✅ Bảng tra hoặc match
ROLE_LABELS = {
    "admin": "Admin",
    "manager": "Manager",
    "viewer": "Viewer",
}
label = ROLE_LABELS.get(role, "Unknown")
```

```typescript
// ❌ Ba ngôi lồng nhau
const bg = isHovered
  ? isSelected ? "blue" : "gray"
  : isSelected ? "navy" : "white";

// ✅ Bảng tra (lookup map)
const bgMap: Record<string, string> = {
  "true-true": "blue",
  "true-false": "gray",
  "false-true": "navy",
  "false-false": "white",
};
const bg = bgMap[`${isHovered}-${isSelected}`];
```

```python
# ❌ if lồng từ 3 cấp
def process(order):
    if order is not None:
        if order.items:
            for item in order.items:
                if item.price > 0:
                    ...

# ✅ Early return và guard clause
def process(order):
    if not order or not order.items:
        return
    for item in order.items:
        if item.price <= 0:
            continue
        ...
```

Điểm review:

- Ba ngôi lồng từ 2 cấp?
- `if/else` lồng từ 3 cấp?
- Thay được bằng bảng tra, early return hoặc `match`?

## Copy-paste có biến thể

Khối code gần như trùng nhau.

```python
# ❌ Hai hàm gần như giống hệt, chỉ khác tên trường
def format_user(user):
    return f"{user.first_name} {user.last_name} ({user.email})"

def format_employee(emp):
    return f"{emp.first_name} {emp.last_name} ({emp.work_email})"

# ✅ Gộp thành một abstraction
def format_person(first: str, last: str, email: str) -> str:
    return f"{first} {last} ({email})"
```

```typescript
// ❌ Handler copy-paste, chỉ đổi URL
async function deletePost(id: string) {
  await fetch(`/api/posts/${id}`, { method: "DELETE" });
  router.push("/posts");
}
async function deleteComment(id: string) {
  await fetch(`/api/comments/${id}`, { method: "DELETE" });
  router.push("/comments");
}

// ✅ Tham số hóa
async function deleteResource(resource: string, id: string) {
  await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
  router.push(`/${resource}`);
}
```

Điểm review:

- Có từ 2 đoạn code chỉ khác tên biến, URL, chuỗi?
- Tách được hàm dùng chung có tham số?
- Dùng template method hoặc strategy để bỏ biến thể được không?

## No-op update

Cập nhật trạng thái vô điều kiện dù dữ liệu không đổi.

```typescript
// ❌ Mỗi lần poll đều cập nhật, kể cả khi dữ liệu không đổi
useEffect(() => {
  const interval = setInterval(() => {
    fetch("/api/status").then(r => r.json()).then(setStatus);
  }, 5000);
  return () => clearInterval(interval);
}, []);

// ✅ Chỉ cập nhật khi giá trị đổi
useEffect(() => {
  const interval = setInterval(() => {
    fetch("/api/status")
      .then(r => r.json())
      .then(data => {
        setStatus(prev => isEqual(prev, data) ? prev : data);
      });
  }, 5000);
  return () => clearInterval(interval);
}, []);
```

```python
# ❌ Mỗi vòng lặp đều ghi CSDL, kể cả khi giá trị không đổi
for item in items:
    item.status = compute_status(item)
    session.commit()

# ✅ Chỉ ghi khi có thay đổi
for item in items:
    new_status = compute_status(item)
    if item.status != new_status:
        item.status = new_status
        session.commit()
```

Điểm review:

- Polling, interval, event handler có cập nhật vô điều kiện?
- Hàm bọc có giữ nguyên tham chiếu cũ khi giá trị không đổi?
- Ghi CSDL có kiểm tra thay đổi thực sự?

## TOCTOU

Time-of-Check-to-Time-of-Use: giữa lúc kiểm tra và lúc dùng, trạng thái có thể đổi.

```python
# ❌ Kiểm tra rồi mới thao tác, ở giữa file có thể bị xóa hoặc tạo
if os.path.exists(path):
    with open(path) as f:
        data = f.read()

# ✅ Thao tác thẳng và xử lý exception
try:
    with open(path) as f:
        data = f.read()
except FileNotFoundError:
    data = None
```

```python
# ❌ Kiểm tra số dư rồi trừ tiền: hai bước không nguyên tử
if account.balance >= amount:
    account.balance -= amount

# ✅ Thao tác nguyên tử hoặc dùng lock
with account.lock:
    if account.balance < amount:
        raise InsufficientFundsError()
    account.balance -= amount
```

```typescript
// ❌ Check-then-act không an toàn trong môi trường bất đồng bộ
if (!fileExists(path)) {
  await writeFile(path, content);
}

// ✅ Thao tác thẳng và catch
try {
  await writeFile(path, content, { flag: "wx" });
} catch (e) {
  if (e.code === "EEXIST") { /* xử lý */ }
  else throw e;
}
```

Điểm review:

- Mẫu `if exists -> operate` thay được bằng `try operate -> catch`?
- Đổi trạng thái nhiều bước có nằm trong transaction hoặc lock?
- Giữa bước kiểm tra và bước thao tác trong code bất đồng bộ có `await` không?

## Thao tác quá rộng

Đọc nhiều dữ liệu hơn mức cần.

```python
# ❌ Đọc cả file rồi lấy dòng đầu
content = Path("log.txt").read_text()
first_line = content.split("\n")[0]

# ✅ Chỉ đọc dòng đầu, không nạp cả file
with open("log.txt") as f:
    first_line = f.readline()
```

```typescript
// ❌ Nạp mọi bản ghi rồi lọc
const allItems = await db.query("SELECT * FROM orders");
const pending = allItems.filter(o => o.status === "pending");

// ✅ Lọc ở tầng CSDL
const pending = await db.query(
  "SELECT * FROM orders WHERE status = ?", ["pending"]
);
```

```python
# ❌ Đọc cả danh sách để tìm một bản ghi
users = list(User.objects.all())
user = next(u for u in users if u.id == user_id)

# ✅ Truy vấn chính xác
user = User.objects.get(id=user_id)
```

Điểm review:

- Có đọc cả collection hoặc cả file rồi chỉ dùng một phần nhỏ?
- Đẩy bộ lọc xuống CSDL hoặc tầng lưu trữ được không?
- API có hỗ trợ tham số phân trang hoặc `limit`?

## Redundant state

Trạng thái suy ra được từ dữ liệu khác.

```typescript
// ❌ Lưu cả fullName lẫn firstName và lastName
interface User {
  firstName: string;
  lastName: string;
  fullName: string;  // thừa
}

// ✅ fullName là giá trị suy ra
interface User {
  firstName: string;
  lastName: string;
}
const fullName = `${user.firstName} ${user.lastName}`;
```

```python
# ❌ Giá trị cache có thể cũ khi dữ liệu gốc đổi
class Order:
    total: float
    item_count: int       # thừa nếu len(items) cho cùng kết quả
    items: list[Item]

# ✅ Suy ra hoặc dùng property
class Order:
    items: list[Item]

    @property
    def total(self) -> float:
        return sum(item.price for item in self.items)

    @property
    def item_count(self) -> int:
        return len(self.items)
```

Điểm review:

- Có trường suy ra được từ trường khác?
- Giá trị cache có cơ chế invalidation?
- Observer hoặc effect thay được bằng lời gọi trực tiếp?

## Xử lý lỗi

### Anti-pattern cần đánh dấu

- Nuốt exception: khối `catch` rỗng hoặc chỉ ghi log.

  ```javascript
  try { ... } catch (e) { }                 // thất bại im lặng
  try { ... } catch (e) { console.log(e) }  // ghi log rồi bỏ qua
  ```

- Catch quá rộng: bắt class cơ sở `Exception`/`Error` thay vì kiểu cụ thể.
- Lộ thông tin lỗi: stack trace hoặc chi tiết nội bộ hiện cho người dùng.
- Thiếu xử lý lỗi: không có try-catch quanh thao tác có thể lỗi (I/O, mạng, parse).
- Lỗi bất đồng bộ: promise rejection không xử lý, thiếu `.catch()`, không có error boundary.

### Thực hành tốt cần kiểm tra

- [ ] Lỗi bắt ở ranh giới phù hợp.
- [ ] Thông báo lỗi thân thiện với người dùng, không lộ chi tiết nội bộ.
- [ ] Lỗi ghi log kèm đủ ngữ cảnh để gỡ lỗi.
- [ ] Lỗi bất đồng bộ lan truyền hoặc xử lý đúng.
- [ ] Có hành vi dự phòng cho lỗi khôi phục được.
- [ ] Lỗi nghiêm trọng kích hoạt cảnh báo hoặc giám sát.

### Câu hỏi review

- "Thao tác này lỗi thì chuyện gì xảy ra?"
- "Bên gọi có biết đã có lỗi không?"
- "Có đủ ngữ cảnh để gỡ lỗi này không?"

## Hiệu năng và cache

### Thao tác nặng CPU

- Thao tác tốn kém trên hot path: biên dịch regex, parse JSON, mã hóa trong vòng lặp.
- Chặn main thread: I/O đồng bộ, tính toán nặng không dùng worker hoặc xử lý bất đồng bộ.
- Tính lại không cần thiết: cùng một phép tính chạy nhiều lần.
- Thiếu memoization: hàm thuần gọi lặp lại với cùng đầu vào.

### CSDL và I/O

- N+1 query: vòng lặp gửi một truy vấn cho mỗi phần tử thay vì gộp lô.

  ```javascript
  // Sai: N+1
  for (const id of ids) {
    const user = await db.query(`SELECT * FROM users WHERE id = ?`, id)
  }
  // Đúng: gộp lô
  const users = await db.query(`SELECT * FROM users WHERE id IN (?)`, ids)
  ```

- Thiếu index: truy vấn trên cột chưa đánh index.
- Over-fetching: `SELECT *` khi chỉ cần vài cột.
- Không phân trang: nạp toàn bộ dữ liệu vào bộ nhớ.

### Cache

- Thiếu cache cho thao tác tốn kém: gọi API, truy vấn CSDL, tính toán lặp lại.
- Cache không có TTL: dữ liệu cũ trả về vô thời hạn.
- Cache không có chiến lược invalidation: dữ liệu đã đổi nhưng cache chưa xóa.
- Trùng khóa cache: khóa không đủ tính duy nhất.
- Cache dữ liệu riêng của người dùng ở phạm vi toàn cục: vấn đề bảo mật và quyền riêng tư.

### Bộ nhớ

- Collection không giới hạn: mảng, map tăng không có trần.
- Giữ object lớn: tham chiếu còn giữ khiến GC không thu hồi được.
- Nối chuỗi trong vòng lặp: dùng StringBuilder hoặc `join`.
- Nạp nguyên file lớn: dùng streaming.

### Câu hỏi review

- "Độ phức tạp thời gian của thao tác này là bao nhiêu?"
- "Dữ liệu tăng 10 lần, 100 lần thì hành vi thế nào?"
- "Kết quả này cache được không? Có nên cache không?"
- "Gộp lô được không, thay vì xử lý từng phần tử?"

## Điều kiện biên

### Null/undefined

- Thiếu kiểm tra null: truy cập thuộc tính trên object có thể null.
- Nhầm truthy/falsy: `if (value)` khi `0` hoặc `""` là giá trị hợp lệ.
- Lạm dụng optional chaining: `a?.b?.c?.d` che vấn đề cấu trúc.
- Trộn null và undefined không theo quy ước rõ ràng.

### Collection rỗng

- Không xử lý mảng rỗng: code giả định mảng có phần tử.
- Object rỗng: `for...in` hoặc `Object.keys` trên object rỗng.
- Truy cập phần tử đầu hoặc cuối: `arr[0]` hay `arr[arr.length-1]` mà không kiểm tra độ dài.

### Ranh giới số học

- Chia cho 0: thiếu kiểm tra trước khi chia.
- Tràn số nguyên: số lớn vượt phạm vi số nguyên an toàn.
- So sánh số thực: dùng `===` thay vì so sánh theo epsilon.
- Giá trị âm: chỉ số hoặc bộ đếm không được âm.
- Off-by-one: ranh giới vòng lặp, cắt mảng, phân trang.

### Ranh giới chuỗi

- Chuỗi rỗng: không xử lý như điều kiện biên.
- Chuỗi chỉ có khoảng trắng: qua được kiểm tra truthy nhưng thực chất rỗng.
- Chuỗi rất dài: không giới hạn độ dài, gây vấn đề bộ nhớ hoặc hiển thị.
- Điều kiện biên Unicode: emoji, văn bản RTL, ký tự tổ hợp.

### Mẫu cần đánh dấu

```javascript
// Nguy hiểm: không kiểm tra null
const name = user.profile.name

// Nguy hiểm: truy cập mảng không kiểm tra
const first = items[0]

// Nguy hiểm: chia không kiểm tra
const avg = total / count

// Nguy hiểm: kiểm tra truthy loại bỏ giá trị hợp lệ
if (value) { ... }  // sai với 0, "", false
```

### Câu hỏi review

- "Nếu giá trị này null/undefined thì sao?"
- "Nếu collection này rỗng thì sao?"
- "Khoảng hợp lệ của số này là gì?"
- "Ở ranh giới (0, -1, MAX_INT) thì chuyện gì xảy ra?"

## Checklist

- [ ] Tái sử dụng: đã tìm helper có sẵn, không viết lại thứ đã có.
- [ ] Số tham số: hàm có tối đa 3 tham số, nhiều hơn thì dùng options object hoặc dataclass.
- [ ] Ranh giới abstraction: kiểu trả về không lộ chi tiết implementation (ORM, HTTP client, định dạng file).
- [ ] An toàn kiểu: không dùng magic string thay cho enum, hằng số, union type đã có.
- [ ] Độ sâu điều kiện: ba ngôi lồng tối đa 1 cấp, `if/else` lồng tối đa 2 cấp.
- [ ] DRY: không có copy-paste có biến thể (từ 2 đoạn gần giống nhau).
- [ ] Chống no-op: polling, interval, event handler có kiểm tra thay đổi.
- [ ] TOCTOU: `if exists -> operate` đã thay bằng `try operate -> catch`.
- [ ] Độ chính xác dữ liệu: không đọc cả collection hoặc file chỉ để lấy tập con.
- [ ] Redundant state: không lưu trường suy ra được từ trường khác.
- [ ] Xử lý lỗi: không nuốt exception, không catch quá rộng, không lộ chi tiết nội bộ, lỗi bất đồng bộ có xử lý.
- [ ] Hiệu năng: không có N+1, không có thao tác nặng trên hot path, có phân trang, cache có TTL và invalidation.
- [ ] Bộ nhớ: collection có giới hạn, file lớn đọc theo stream.
- [ ] Điều kiện biên: null, collection rỗng, chia 0, off-by-one, chuỗi rỗng hoặc chỉ có khoảng trắng đã xét.

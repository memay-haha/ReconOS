# Chống SQL injection

Dùng khi review code tạo hoặc chạy truy vấn SQL: truy vấn thô, ORM, query builder, tên bảng hoặc cột động. Danh mục bảo mật chung ở [security.md](security.md).

## Dạng tấn công

SQL injection (SQLi) đứng hạng 3 trong OWASP Top 10 (2021). Ba biến thể thường gặp:

| Dạng | Mô tả | Rủi ro |
|---|---|---|
| Classic (in-band) | Kẻ tấn công nhận kết quả ngay trong HTTP response | Rút dữ liệu, vượt qua xác thực |
| Blind (boolean, time-based) | Kẻ tấn công suy ra dữ liệu từ khác biệt của response hoặc thời gian phản hồi | Chậm hơn nhưng vẫn rút được dữ liệu |
| Out-of-band | Kẻ tấn công dùng callback DNS hoặc HTTP để đưa dữ liệu ra | Ít gặp nhưng khó phát hiện hơn |

Mức mặc định khi tìm thấy SQLi khai thác được: P0 🔴 Nghiêm trọng. Báo kèm khả năng khai thác (tham số nào, ai gửi được) và tác động (bảng nào đọc hoặc sửa được).

## Chiến lược phòng chống chung

1. Truy vấn tham số hóa: luôn dùng, là tầng phòng thủ số một.
2. Dùng ORM an toàn: biết ORM escape gì và không escape gì.
3. Validate đầu vào: ưu tiên allowlist hơn blocklist.
4. Đặc quyền tối thiểu: tài khoản CSDL chỉ có quyền tối thiểu.
5. WAF (Web Application Firewall): tầng phòng thủ chiều sâu.

## Ví dụ theo ngôn ngữ

### Python

```python
# ❌ Lỗ hổng: định dạng chuỗi
query = f"SELECT * FROM users WHERE id = {user_id}"
cursor.execute(query)

# ❌ Lỗ hổng: định dạng bằng %
cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)

# ✅ Tham số hóa (DB-API)
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# ✅ SQLAlchemy ORM
User.query.filter(User.id == user_id).all()

# ❌ SQLAlchemy SQL thô với chuỗi nội suy
session.execute(text(f"SELECT * FROM users WHERE id = {user_id}"))

# ✅ SQLAlchemy SQL thô với tham số bind
session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})

# ✅ Django ORM
User.objects.filter(id=user_id)

# ❌ Django extra() với chuỗi nội suy
User.objects.extra(where=[f"username = '{username}'"])

# ✅ Django raw() với tham số
User.objects.raw("SELECT * FROM users WHERE id = %s", [user_id])
```

### Java

```java
// ❌ Lỗ hổng: nối chuỗi
String query = "SELECT * FROM users WHERE id = " + userId;
Statement stmt = connection.createStatement();
ResultSet rs = stmt.executeQuery(query);

// ✅ JDBC PreparedStatement
String query = "SELECT * FROM users WHERE id = ?";
PreparedStatement stmt = connection.prepareStatement(query);
stmt.setLong(1, userId);
ResultSet rs = stmt.executeQuery();

// ✅ JPA bind tham số
@Query("SELECT u FROM User u WHERE u.id = :id")
User findById(@Param("id") Long id);

// ✅ Spring Data JPA đặt tên method
User findById(Long id);

// ❌ JPA truy vấn native nối chuỗi
entityManager.createNativeQuery(
    "SELECT * FROM users WHERE name = '" + name + "'"
);

// ✅ JPA truy vấn native bind tham số
Query query = entityManager.createNativeQuery(
    "SELECT * FROM users WHERE name = :name"
);
query.setParameter("name", name);
```

### Go

```go
// ❌ Lỗ hổng: fmt.Sprintf
query := fmt.Sprintf("SELECT * FROM users WHERE id = %s", userID)
rows, err := db.Query(query)

// ✅ database/sql tham số hóa
rows, err := db.Query("SELECT * FROM users WHERE id = ?", userID)

// ✅ Tham số đặt tên (sqlx)
rows, err := db.NamedQuery(
    "SELECT * FROM users WHERE id = :id",
    map[string]interface{}{"id": userID},
)

// ⚠️ Tên bảng hoặc cột động không dùng placeholder được
// Phải kiểm tra theo allowlist
var allowedColumns = map[string]bool{
    "id": true, "name": true, "email": true, "created_at": true,
}

func queryWithOrder(db *sql.DB, orderBy string) (*sql.Rows, error) {
    if !allowedColumns[orderBy] {
        return nil, fmt.Errorf("invalid column: %s", orderBy)
    }
    return db.Query(
        fmt.Sprintf("SELECT * FROM users ORDER BY %s", orderBy),
    )
}
```

### Node.js

```typescript
// ❌ Lỗ hổng: template literal
const query = `SELECT * FROM users WHERE id = ${userId}`;
const result = await client.query(query);

// ✅ pg tham số hóa ($1, $2, ...)
const result = await client.query(
    "SELECT * FROM users WHERE id = $1",
    [userId]
);

// ✅ Prisma ORM (tham số hóa mặc định)
const user = await prisma.user.findUnique({
    where: { id: userId },
});

// ❌ Prisma $queryRawUnsafe với chuỗi nội suy
await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE id = ${userId}`
);

// ✅ Prisma $queryRaw với tagged template (an toàn)
await prisma.$queryRaw`
    SELECT * FROM users WHERE id = ${userId}
`;
```

### PHP

```php
<?php

// ❌ Lỗ hổng: nối chuỗi
$sql = "SELECT * FROM users WHERE email = '" . $_GET['email'] . "'";
$user = $pdo->query($sql)->fetch();

// ✅ PDO prepared statement
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email");
$stmt->execute(['email' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// ✅ PDO placeholder theo vị trí
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$id]);

// ❌ mysqli với chuỗi nội suy
$result = mysqli_query($conn,
    "SELECT * FROM users WHERE id = " . $id
);

// ✅ mysqli prepared statement
$stmt = mysqli_prepare($conn, "SELECT * FROM users WHERE id = ?");
mysqli_stmt_bind_param($stmt, "i", $id);
mysqli_stmt_execute($stmt);

// ✅ Laravel Eloquent ORM
User::where('id', $id)->first();

// ❌ Laravel DB::raw với chuỗi nội suy
DB::select(DB::raw("SELECT * FROM users WHERE id = {$id}"));

// ✅ Laravel truy vấn thô tham số hóa
DB::select("SELECT * FROM users WHERE id = ?", [$id]);
```

### C# và .NET

```csharp
// ❌ Lỗ hổng: nội suy chuỗi
var query = $"SELECT * FROM Users WHERE Id = {userId}";
using var cmd = new SqlCommand(query, connection);
var reader = cmd.ExecuteReader();

// ✅ ADO.NET tham số hóa
var query = "SELECT * FROM Users WHERE Id = @Id";
using var cmd = new SqlCommand(query, connection);
cmd.Parameters.AddWithValue("@Id", userId);

// ✅ Dapper tham số hóa
var users = connection.Query<User>(
    "SELECT * FROM Users WHERE Id = @Id",
    new { Id = userId }
);

// ❌ Dapper với chuỗi nội suy
var users = connection.Query<User>(
    $"SELECT * FROM Users WHERE Id = {userId}"
);

// ✅ EF Core (tham số hóa mặc định)
var user = await context.Users
    .Where(u => u.Id == userId)
    .FirstOrDefaultAsync();

// ❌ EF Core FromSqlRaw với chuỗi nội suy
var users = context.Users
    .FromSqlRaw($"SELECT * FROM Users WHERE Id = {userId}")
    .ToList();

// ✅ EF Core FromSql với FormattableString (tham số hóa)
var users = context.Users
    .FromSql($"SELECT * FROM Users WHERE Id = {userId}")
    .ToList();
```

## Mẫu dùng ORM không an toàn

ORM không tự chặn SQL injection trong mọi trường hợp:

```python
# ❌ SQLAlchemy: text() với f-string
session.execute(text(f"SELECT * FROM users WHERE id = {user_id}"))

# ❌ Django: extra() hoặc RawSQL() với chuỗi nội suy
User.objects.extra(where=[f"username = '{username}'"])
User.objects.annotate(
    val=RawSQL(f"SELECT col FROM other WHERE id = {user_id}")
)

# ❌ JPA: createNativeQuery nối chuỗi
entityManager.createNativeQuery("SELECT * FROM users WHERE name = '" + name + "'")

# ❌ EF Core: FromSqlRaw với chuỗi nội suy
context.Users.FromSqlRaw($"SELECT * FROM Users WHERE Id = {userId}")
```

Quy tắc: ORM nào cũng có lối thoát "SQL thô". Nội suy chuỗi trong lối thoát đó là SQL injection. Luôn dùng cơ chế bind tham số của ORM.

## Tên bảng và cột động

Placeholder chỉ bind được giá trị, không bind được tên bảng, tên cột hoặc từ khóa SQL. Với định danh động, kiểm tra theo allowlist:

```python
# ✅ Kiểm tra theo allowlist
ALLOWED_COLUMNS = {"id", "name", "email", "created_at"}
ALLOWED_DIRECTIONS = {"ASC", "DESC"}

def get_users(order_by: str, direction: str) -> list[User]:
    if order_by not in ALLOWED_COLUMNS:
        raise ValueError(f"Invalid column: {order_by}")
    if direction.upper() not in ALLOWED_DIRECTIONS:
        raise ValueError(f"Invalid direction: {direction}")

    return User.objects.order_by(
        f"{'-' if direction.upper() == 'DESC' else ''}{order_by}"
    )
```

## Phát hiện và test

```bash
# Quét tự động
sqlmap -u "https://example.com/api/users?id=1" --batch

# Phân tích tĩnh (Python)
bandit -r src/ -f custom

# Phân tích tĩnh (Java)
spotbugs -textui build/classes

# Từ khóa tìm khi review code
grep -rn "f\".*SELECT\|f'.*SELECT\|fmt.Sprintf.*SELECT\|format.*SELECT" src/
grep -rn "query.*\+.*\|query.*&\|query.*concat" src/
```

## Checklist

- [ ] Mọi truy vấn SQL dùng tham số hóa, không nội suy chuỗi.
- [ ] Method SQL thô của ORM dùng tham số bind, không định dạng chuỗi.
- [ ] Tên bảng, tên cột động đã kiểm tra theo allowlist.
- [ ] Tài khoản CSDL có đặc quyền tối thiểu (tài khoản ứng dụng không có DROP, ALTER).
- [ ] Không có truy vấn SQL dựng từ dữ liệu người dùng nhập mà không tham số hóa.
- [ ] CI chạy công cụ phân tích tĩnh (Bandit, SpotBugs, SonarQube).

# PHP

Dùng khi review code PHP 8.x: hệ thống kiểu, tính năng ngôn ngữ mới, mô hình hóa OOP, truy cập dữ liệu qua PDO, bảo mật, xử lý lỗi, phụ thuộc Composer, hiệu năng và test.

## Kiểm tra nhanh

### Bắt buộc kiểm tra

- [ ] File mới bật `declare(strict_types=1);`
- [ ] API public có kiểu cho tham số, giá trị trả về và thuộc tính
- [ ] Đầu vào người dùng được validate, đầu ra được escape theo ngữ cảnh
- [ ] SQL dùng truy vấn tham số hóa hoặc binding của ORM
- [ ] Mật khẩu dùng `password_hash()` / `password_verify()`
- [ ] Upload file kiểm tra MIME, kích thước, phần mở rộng và đường dẫn lưu
- [ ] Commit `composer.lock`, khoảng phiên bản phụ thuộc hợp lý
- [ ] Có test PHPUnit/Pest và phân tích tĩnh PHPStan/Psalm

### Lỗi thường gặp

- [ ] So sánh lỏng `==` / `!=` gây lỗ hổng type juggling (P0 nếu nằm trong logic xác thực, thanh toán)
- [ ] Dùng `md5()` / `sha1()` để lưu mật khẩu (P0)
- [ ] Nối chuỗi để tạo SQL, HTML, lệnh shell hoặc đường dẫn file (P0)
- [ ] Dùng `@` để giấu lỗi
- [ ] Gọi `unserialize()` trên dữ liệu không tin cậy (P0)
- [ ] `$_GET` / `$_POST` / `$_FILES` đi thẳng vào logic nghiệp vụ
- [ ] Thuộc tính động: PHP 8.2+ báo deprecation, PHP 9 có thể chuyển thành lỗi

## Hệ thống kiểu và PHP hiện đại

### strict_types và kiểu tường minh

```php
<?php

// ❌ ranh giới lỏng: truyền "42" bị ép kiểu ngầm
function findUser($id) {
    return User::find($id);
}

// ✅ bật strict_types ở đầu file, khai báo kiểu cho API public
declare(strict_types=1);

function findUser(int $id): ?User
{
    return User::find($id);
}
```

Không dồn toàn bộ việc kiểm tra kiểu cho bước validate đầu vào lúc chạy. Khai báo kiểu thể hiện contract nội bộ, validate đầu vào thể hiện mức tin cậy ở ranh giới. Cần cả hai.

### Tránh so sánh lỏng

```php
<?php

// ❌ chuỗi như "0e12345" có thể bị coi là 0 khi so sánh lỏng
if ($providedHash == $storedHash) {
    grantAccess();
}

// ✅ so sánh chặt, dùng hash_equals() cho bí mật hoặc token
if (hash_equals($storedHash, $providedHash)) {
    grantAccess();
}

// ✅ match so sánh đồng nhất (===), ít bất ngờ type juggling hơn switch
$status = match ($code) {
    200 => 'ok',
    404 => 'not_found',
    default => 'unknown',
};
```

Chú ý `==`, `!=` và `in_array($x, $list)` (mặc định so sánh lỏng) trong logic xác thực, thanh toán, máy trạng thái và phân quyền. Dùng `===`, `!==` và `in_array($x, $list, true)` ở những chỗ quan trọng.

### Kiểu union, intersection, nullable

```php
<?php

// ❌ mixed hoặc không khai báo kiểu khiến bên gọi phải đoán dạng trả về
function loadConfig($source) {
    return parseConfig($source);
}

// ✅ thể hiện contract thật bằng kiểu
function loadConfig(string|PathInfo $source): Config
{
    return parseConfig($source);
}

// ✅ ghi rõ null khi null là trạng thái nghiệp vụ thật
function currentUser(): ?User
{
    return Auth::user();
}
```

`mixed` có thể xuất hiện ở ranh giới hoặc khi chuyển đổi code cũ, nhưng trong service nghiệp vụ lõi thường là dấu hiệu thiếu mô hình hóa.

### Toán tử nullsafe không được giấu trạng thái thiếu

```php
<?php

// ❌ chuỗi nullsafe làm mờ nguyên nhân thất bại
$country = $order?->customer?->profile?->country;

// ✅ rẽ nhánh tường minh với trạng thái nghiệp vụ quan trọng
if ($order === null) {
    throw new OrderNotFound();
}

$customer = $order->customer();
if ($customer === null) {
    throw new MissingCustomer($order->id);
}

$country = $customer->profile()?->country;
```

Phân biệt "trường hiển thị tùy chọn" với "bất biến nghiệp vụ bắt buộc có". Trường hợp đầu hợp với `?->`, trường hợp sau phải báo lỗi rõ ràng.

## Mô hình hóa object

### Dùng thuộc tính readonly và value object

```php
<?php

// ❌ trường public có thể sửa, bên gọi đổi trạng thái tùy ý
class Money
{
    public $amount;
    public $currency;
}

// ✅ value object bất biến với kiểu và readonly
final readonly class Money
{
    public function __construct(
        public int $amount,
        public string $currency,
    ) {
        if ($amount < 0) {
            throw new InvalidArgumentException('Amount must be non-negative');
        }
    }
}
```

Với DTO, cấu hình và value object của domain, kiểm tra trước xem `readonly class` hoặc thuộc tính readonly có loại bỏ được side effect ẩn không.

### Dùng enum thay chuỗi trạng thái

```php
<?php

// ❌ chuỗi trạng thái dễ gõ sai và không liệt kê được tập hợp lệ
if ($order->status === 'paied') {
    ship($order);
}

// ✅ enum làm lộ trạng thái không hợp lệ sớm hơn
enum OrderStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Cancelled = 'cancelled';
}

if ($order->status === OrderStatus::Paid) {
    ship($order);
}
```

Khi review máy trạng thái, phân quyền hoặc trường loại, tìm magic string. Nếu tập giá trị ổn định, đề xuất enum. Nếu giá trị đến từ hệ thống ngoài, chuyển sang enum nội bộ trước khi vào tầng nghiệp vụ.

### Không dựa vào thuộc tính động

```php
<?php

// ❌ PHP 8.2+ báo deprecation khi tạo thuộc tính động
$user = new User();
$user->emali = 'a@example.com'; // gõ sai cũng lặng lẽ tạo thuộc tính mới

// ✅ khai báo thuộc tính hoặc dùng cấu trúc dữ liệu riêng
final class User
{
    public function __construct(
        public string $email,
    ) {}
}
```

`#[AllowDynamicProperties]` chỉ là trường hợp đặc biệt để tương thích code cũ, không phải mặc định cho code mới. Chú ý serialize, hydrate của ORM và test double ngầm dựa vào thuộc tính động.

### Không làm I/O nặng trong constructor

```php
<?php

// ❌ lặng lẽ kết nối CSDL khi khởi tạo, khó test và khó xử lý lỗi
final class ReportService
{
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = new PDO($_ENV['DSN']);
    }
}

// ✅ inject phụ thuộc từ bên ngoài
final class ReportService
{
    public function __construct(
        private PDO $pdo,
    ) {}
}
```

Constructor chỉ thiết lập bất biến của object. Không gửi HTTP request, mở kết nối, đọc file lớn hay chạy truy vấn phức tạp trong đó.

## Đầu vào, đầu ra và bảo mật

### Validate đầu vào ở ranh giới

```php
<?php

// ❌ superglobal đi thẳng vào logic nghiệp vụ
$user = $service->create($_POST['email'], $_POST['age']);

// ✅ validate và ép kiểu ở ranh giới trước
$email = filter_input(INPUT_POST, 'email', FILTER_VALIDATE_EMAIL);
$age = filter_input(INPUT_POST, 'age', FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 0, 'max_range' => 130],
]);

if ($email === false || $email === null || $age === false || $age === null) {
    throw new InvalidInput();
}

$user = $service->create($email, $age);
```

`filter_input()` chỉ xử lý một phần kiểm tra cơ bản. Quy tắc phức tạp, ràng buộc giữa nhiều trường và ràng buộc nghiệp vụ vẫn cần validator riêng hoặc request DTO.

### Escape đầu ra theo ngữ cảnh

```php
<?php

// ❌ đầu vào người dùng vào thẳng HTML
echo "<h1>Hello {$_GET['name']}</h1>";

// ✅ dùng htmlspecialchars trong ngữ cảnh văn bản HTML
$name = (string) ($_GET['name'] ?? '');
echo '<h1>Hello ' . htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</h1>';
```

Mỗi ngữ cảnh cần cách escape riêng: văn bản HTML, thuộc tính HTML, URL, chuỗi JavaScript và CSS đều khác nhau. Template engine bị tắt escape mặc định thì coi là rủi ro bảo mật.

### Mật khẩu và số ngẫu nhiên

```php
<?php

// ❌ không dùng md5/sha1 để lưu mật khẩu
$hash = md5($password);

// ✅ dùng password API có sẵn của PHP
$hash = password_hash($password, PASSWORD_DEFAULT);

if (!password_verify($password, $hash)) {
    throw new InvalidCredentials();
}

// ✅ dùng CSPRNG cho token
$token = bin2hex(random_bytes(32));
$code = random_int(100000, 999999);
```

Không tự viết salt, chuyển đổi số vòng hay so sánh mật khẩu. Dùng `password_needs_rehash()` khi cần nâng cost factor.

### Deserialize và object injection

```php
<?php

// ❌ đầu vào không tin cậy vào unserialize có thể gây object injection
$payload = unserialize($_COOKIE['state']);

// ✅ ưu tiên JSON cho dữ liệu ngoài, kiểm tra schema/hình dạng
$payload = json_decode($_COOKIE['state'] ?? '{}', true, flags: JSON_THROW_ON_ERROR);
```

Nếu buộc phải xử lý dữ liệu serialize cũ, ít nhất giới hạn `allowed_classes` và bảo đảm magic method của các class liên quan không gây side effect nguy hiểm.

### Upload file và đường dẫn

```php
<?php

// ❌ tạo đường dẫn từ tên file gốc
$target = __DIR__ . '/uploads/' . $_FILES['avatar']['name'];
move_uploaded_file($_FILES['avatar']['tmp_name'], $target);

// ✅ sinh tên file phía server, kiểm tra mã lỗi upload và MIME
$file = $_FILES['avatar'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    throw new UploadFailed();
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
if (!in_array($mime, ['image/png', 'image/jpeg'], true)) {
    throw new InvalidFileType();
}

$target = __DIR__ . '/uploads/' . bin2hex(random_bytes(16)) . '.jpg';
move_uploaded_file($file['tmp_name'], $target);
```

Khi review tính năng upload, kiểm tra giới hạn kích thước, nhận diện MIME, phần mở rộng, thư mục lưu không thực thi được, path traversal, chống ghi đè, và yêu cầu quét virus hoặc xử lý bất đồng bộ nếu có.

## Truy cập CSDL

### Dùng truy vấn tham số hóa

PDO và mysqli đều hỗ trợ prepared statement. Không bao giờ nối đầu vào người dùng vào chuỗi SQL. Định danh động (tên bảng, tên cột) phải qua ánh xạ whitelist.

> Phòng chống SQL injection cho nhiều ngôn ngữ (Python, Java, Go, Node.js, PHP, C#) và cách dùng ORM không an toàn: xem [SQL injection](../sql-injection.md).

### Bọc ghi nhiều bước trong transaction

```php
<?php

// ❌ ghi nhiều bước không có transaction, lỗi giữa chừng để lại trạng thái dở dang
$orderId = $orders->create($cart);
$inventory->reserve($cart);
$payments->charge($orderId);

// ✅ ranh giới transaction tường minh
$pdo->beginTransaction();
try {
    $orderId = $orders->create($cart);
    $inventory->reserve($cart);
    $payments->recordIntent($orderId);
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}
```

Không đặt side effect bên ngoài không rollback được (trừ tiền thật, gửi email, phát message) vào trong transaction CSDL. Cách thường dùng: outbox, idempotency key, hoặc kích hoạt sau khi transaction commit.

### Tránh truy vấn N+1

> Mẫu N+1 và cách xử lý cho nhiều ngôn ngữ: xem [Truy vấn N+1](../n-plus-one.md).

```php
<?php

// ❌ truy vấn trong vòng lặp
foreach ($orders as $order) {
    $customer = $customerRepo->find($order->customerId);
    render($order, $customer);
}

// ✅ nạp theo lô rồi ánh xạ
$customerIds = array_unique(array_map(fn ($o) => $o->customerId, $orders));
$customers = $customerRepo->findByIds($customerIds);

foreach ($orders as $order) {
    render($order, $customers[$order->customerId] ?? null);
}
```

Với ORM như Laravel, Doctrine: kiểm tra eager loading, join fetch, cột được chọn, phân trang và index.

## Xử lý lỗi

> Nguyên tắc xử lý lỗi chung cho nhiều ngôn ngữ: xem [Xử lý lỗi](../error-handling.md).

### Bắt exception cụ thể, giữ ngữ cảnh

```php
<?php

// ❌ nuốt exception, bên gọi không biết đã thất bại
try {
    $mailer->send($message);
} catch (Exception $e) {
}

// ✅ bắt exception cụ thể, giữ ngữ cảnh rồi ném lại
try {
    $mailer->send($message);
} catch (TransportException $e) {
    throw new NotificationFailed($userId, previous: $e);
}
```

Cần đặt câu hỏi với: khối `catch` rỗng, `error_log()` rồi chạy tiếp mà không báo lỗi lên, và biến mọi exception thành `RuntimeException('failed')` trong code production.

### Không giấu lỗi bằng @

```php
<?php

// ❌ giấu lỗi thật, khó debug
$content = @file_get_contents($path);

// ✅ xử lý thất bại tường minh
$content = file_get_contents($path);
if ($content === false) {
    throw new RuntimeException("Unable to read file: {$path}");
}
```

`@` hay xuất hiện quanh thao tác file, mạng, truy cập mảng và lời gọi thư viện cũ. Đề nghị rẽ nhánh tường minh, hoặc chuyển lỗi của bên thứ ba thành exception của dự án.

### Không lộ dữ liệu nhạy cảm trong log

```php
<?php

// ❌ ghi token, mật khẩu hoặc toàn bộ request body vào log
$logger->error('Login failed', ['request' => $_POST]);

// ✅ ghi ngữ cảnh không nhạy cảm nhưng vẫn giúp định vị lỗi
$logger->warning('Login failed', [
    'email_hash' => hash('sha256', strtolower($email)),
    'ip' => $requestIp,
]);
```

Kiểm tra log, thông điệp exception, debug toolbar, trang lỗi và bản ghi queue thất bại. Dữ liệu nhạy cảm gồm mật khẩu, token, session, PII, dữ liệu thanh toán và cookie đầy đủ.

## Composer và phụ thuộc

### Lock phụ thuộc để tái lập được

```json
{
  "require": {
    "php": "^8.2",
    "monolog/monolog": "^3.0"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0",
    "phpstan/phpstan": "^1.10"
  }
}
```

Khi review `composer.json` / `composer.lock`, chú ý:

- Repo ứng dụng commit `composer.lock`, repo thư viện thường không commit
- `require-dev` không được lọt vào image production
- Phiên bản nền tảng PHP khớp phiên bản trong CI
- Quy tắc autoload không quá rộng (không nạp thư mục test hay script)
- Lệnh trong `scripts` không phụ thuộc cấu hình bí mật trên máy của lập trình viên

### Bảo mật và bảo trì phụ thuộc

```bash
composer audit
composer outdated --direct
composer validate --strict
```

Khi thêm package, xem tình trạng bảo trì, không chỉ số lượt tải. Tiêu chí cần xem: lịch sử bảo mật, nhịp phát hành, số phụ thuộc kéo theo có ít không, và package có trùng chức năng thư viện chuẩn hoặc tính năng có sẵn của framework không.

## Hiệu năng và quản lý tài nguyên

### Xử lý tập dữ liệu lớn bằng generator hoặc phân trang

```php
<?php

// ❌ nạp mọi bản ghi một lần
$rows = $repo->all();
foreach ($rows as $row) {
    exportRow($row);
}

// ✅ phân trang hoặc dùng generator để tránh tăng vọt bộ nhớ
foreach ($repo->cursor() as $row) {
    exportRow($row);
}
```

Vòng đời request PHP ngắn, nhưng job CLI, queue worker và tác vụ xuất dữ liệu chạy lâu. Với loại code này, theo dõi kỹ bộ nhớ tăng dần, tài nguyên chưa đóng và ô nhiễm trạng thái toàn cục.

### Tránh việc tốn kém trong vòng lặp

```php
<?php

// ❌ đọc lại cấu hình hoặc mở kết nối ở mỗi vòng
foreach ($items as $item) {
    $client = new ApiClient($_ENV['API_KEY']);
    $client->send($item);
}

// ✅ tạo phụ thuộc dùng lại bên ngoài vòng lặp
$client = new ApiClient($_ENV['API_KEY']);
foreach ($items as $item) {
    $client->send($item);
}
```

Chú ý truy vấn CSDL, HTTP request, biên dịch regex, sao chép mảng lớn, `array_merge()` cộng dồn, và đọc lặp biến môi trường hoặc file cấu hình trong vòng lặp.

### Giải phóng hoặc giới hạn phạm vi tài nguyên

```php
<?php

// ✅ đóng file handle sau khi dùng
$handle = fopen($path, 'rb');
if ($handle === false) {
    throw new RuntimeException('Unable to open file');
}

try {
    while (($line = fgets($handle)) !== false) {
        process($line);
    }
} finally {
    fclose($handle);
}
```

Kết nối PDO thường do container quản lý, nhưng file handle, curl handle, file tạm, lock và object cache trong queue worker vẫn cần vòng đời tường minh.

## Test và phân tích tĩnh

### Test hành vi, không test chi tiết implementation

```php
<?php

// ❌ khẳng định lời gọi method nội bộ khiến refactor tốn kém
$mailer->expects($this->once())->method('buildTemplate');

// ✅ khẳng định kết quả quan sát được
$service->sendWelcomeEmail($user);

$this->assertTrue($mailbox->hasMessageFor($user->email));
```

Với service nghiệp vụ, controller và queue job, ưu tiên phủ hành vi quan sát được: đầu vào/đầu ra, trạng thái CSDL, event đã phát, message đã gửi.

### Phân tích tĩnh và định dạng

```bash
vendor/bin/phpunit
vendor/bin/phpstan analyse
vendor/bin/psalm
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/rector process --dry-run
```

Khi review PR, kiểm tra code mới có hạ mức PHPStan/Psalm, dựa nhiều vào baseline ignore, hoặc dùng `@phpstan-ignore-next-line` để che lỗi kiểu thật không.

### Cô lập dữ liệu test

```php
<?php

// ❌ test phụ thuộc thời gian thật và dịch vụ ngoài
$service->expireOldSessions();

// ✅ inject clock và gateway giả
$clock->setNow(new DateTimeImmutable('2026-01-01T00:00:00Z'));
$service->expireOldSessions();
```

Chú ý rollback transaction CSDL, dọn fixture, tính ngẫu nhiên, thời gian, queue, cache và API ngoài. Test PHP chậm thường không do ngôn ngữ mà do ranh giới chưa được cô lập.

## Tài liệu chính thức

- [PHP Manual: Type declarations](https://www.php.net/manual/en/language.types.declarations.php)
- [PHP Manual: match](https://www.php.net/match)
- [PHP Manual: Enumerations](https://www.php.net/manual/en/language.enumerations.overview.php)
- [PHP Manual: Properties](https://www.php.net/manual/en/language.oop5.properties.php)
- [PHP Manual: PDO](https://www.php.net/manual/en/class.pdo.php)
- [PHP Manual: password_hash](https://www.php.net/manual/en/function.password-hash.php)
- [PHP Manual: random_bytes](https://www.php.net/manual/en/function.random-bytes.php)
- [Composer documentation](https://getcomposer.org/doc/)
- [PHPUnit documentation](https://docs.phpunit.de/)
- [PHPStan documentation](https://phpstan.org/user-guide/getting-started)
- [Psalm documentation](https://psalm.dev/docs/)

## Checklist

### Kiểu và mô hình hóa

- [ ] `declare(strict_types=1);` ở đầu file
- [ ] Tham số, giá trị trả về và thuộc tính có kiểu tường minh
- [ ] Dùng `===` / `!==`, tra cứu trong collection dùng chế độ chặt
- [ ] Tập trạng thái ổn định dùng enum, không dùng magic string
- [ ] Code mới không dựa vào thuộc tính động
- [ ] Value object là readonly hoặc bất biến theo cách khác

### Bảo mật

- [ ] Đầu vào được validate và ép kiểu ở ranh giới
- [ ] Đầu ra được escape theo ngữ cảnh HTML/URL/JS/CSS
- [ ] SQL dùng prepared statement hoặc binding của ORM
- [ ] Tên bảng, cột, thứ tự sắp xếp động đi qua whitelist
- [ ] Mật khẩu dùng `password_hash()` / `password_verify()`
- [ ] Token, mã, tên file dùng `random_bytes()` / `random_int()`
- [ ] Đầu vào không tin cậy không bao giờ tới `unserialize()`
- [ ] Upload file kiểm tra mã lỗi, kích thước, MIME, phần mở rộng và thư mục lưu
- [ ] Không có rủi ro injection hoặc rò rỉ trong lệnh shell, tạo đường dẫn hay đầu ra log

### Dữ liệu và transaction

- [ ] Ghi nhiều bước có transaction hoặc cơ chế bù trừ
- [ ] Side effect bên ngoài được thiết kế idempotent
- [ ] Tránh truy vấn N+1
- [ ] Phân trang, index và cột được chọn hợp lý
- [ ] Lỗi CSDL không bị nuốt

### Khả năng bảo trì

- [ ] Constructor không làm I/O nặng
- [ ] Dependency injection rõ ràng, không có trạng thái toàn cục ẩn
- [ ] Không giấu lỗi bằng `@`
- [ ] Exception giữ ngữ cảnh và `previous`
- [ ] Khoảng phiên bản phụ thuộc, autoload và scripts của Composer hợp lý
- [ ] Repo ứng dụng commit `composer.lock`

### Test và công cụ

- [ ] PHPUnit/Pest phủ đường chính và đường thất bại
- [ ] Cấu hình PHPStan/Psalm không hạ độ chặt
- [ ] Ignore/baseline mới có giải thích
- [ ] Công cụ định dạng và lệnh CI tái lập được
- [ ] Test cô lập thời gian, tính ngẫu nhiên, CSDL, queue và API ngoài

# Python

Dùng khi review code Python: type annotation, async/await, xử lý exception, bẫy thường gặp, test với pytest, hiệu năng và style. Code Django hoặc FastAPI: đọc thêm [django.md](django.md) hoặc [fastapi.md](fastapi.md).

## Type annotation

### Annotation cơ bản

```python
# ❌ Không có type annotation, IDE không hỗ trợ được
def process_data(data, count):
    return data[:count]

# ✅ Có type annotation
def process_data(data: str, count: int) -> str:
    return data[:count]

# ✅ Kiểu phức tạp dùng module typing
from typing import Optional, Union

def find_user(user_id: int) -> Optional[User]:
    """Trả về người dùng hoặc None"""
    return db.get(user_id)

def handle_input(value: Union[str, int]) -> str:
    """Nhận chuỗi hoặc số nguyên"""
    return str(value)
```

### Kiểu container

```python
from typing import List, Dict, Set, Tuple, Sequence

# ❌ Kiểu không chính xác
def get_names(users: list) -> list:
    return [u.name for u in users]

# ✅ Kiểu container chính xác (Python 3.9+ viết thẳng list[User])
def get_names(users: List[User]) -> List[str]:
    return [u.name for u in users]

# ✅ Chuỗi chỉ đọc dùng Sequence (linh hoạt hơn)
def process_items(items: Sequence[str]) -> int:
    return len(items)

# ✅ Kiểu dict
def count_words(text: str) -> Dict[str, int]:
    words: Dict[str, int] = {}
    for word in text.split():
        words[word] = words.get(word, 0) + 1
    return words

# ✅ Tuple (độ dài và kiểu cố định)
def get_point() -> Tuple[float, float]:
    return (1.0, 2.0)

# ✅ Tuple độ dài thay đổi
def get_scores() -> Tuple[int, ...]:
    return (90, 85, 92, 88)
```

### Generic và TypeVar

```python
from typing import TypeVar, Generic, List, Callable

T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')

# ✅ Hàm generic
def first(items: List[T]) -> T | None:
    return items[0] if items else None

# ✅ TypeVar có ràng buộc
from typing import Hashable
H = TypeVar('H', bound=Hashable)

def dedupe(items: List[H]) -> List[H]:
    return list(set(items))

# ✅ Class generic
class Cache(Generic[K, V]):
    def __init__(self) -> None:
        self._data: Dict[K, V] = {}

    def get(self, key: K) -> V | None:
        return self._data.get(key)

    def set(self, key: K, value: V) -> None:
        self._data[key] = value
```

### Callable và callback

```python
from typing import Callable, Awaitable

# ✅ Annotation cho kiểu hàm
Handler = Callable[[str, int], bool]

def register_handler(name: str, handler: Handler) -> None:
    handlers[name] = handler

# ✅ Callback async
AsyncHandler = Callable[[str], Awaitable[dict]]

async def fetch_with_handler(url: str, handler: AsyncHandler) -> dict:
    return await handler(url)

# ✅ Hàm trả về hàm
def create_multiplier(factor: int) -> Callable[[int], int]:
    def multiplier(x: int) -> int:
        return x * factor
    return multiplier
```

### TypedDict cho dữ liệu có cấu trúc

```python
from typing import TypedDict, Required, NotRequired

# ✅ Khai báo cấu trúc dict
class UserDict(TypedDict):
    id: int
    name: str
    email: str
    age: NotRequired[int]  # Python 3.11+

def create_user(data: UserDict) -> User:
    return User(**data)

# ✅ Chỉ một số trường bắt buộc
class ConfigDict(TypedDict, total=False):
    debug: bool
    timeout: int
    host: Required[str]  # trường này bắt buộc
```

### Protocol và subtyping theo cấu trúc

```python
from typing import Protocol, runtime_checkable

# ✅ Khai báo protocol (kiểm tra kiểu cho duck typing)
class Readable(Protocol):
    def read(self, size: int = -1) -> bytes: ...

class Closeable(Protocol):
    def close(self) -> None: ...

# Gộp protocol
class ReadableCloseable(Readable, Closeable, Protocol):
    pass

def process_stream(stream: Readable) -> bytes:
    return stream.read()

# ✅ Protocol kiểm tra được lúc chạy
@runtime_checkable
class Drawable(Protocol):
    def draw(self) -> None: ...

def render(obj: object) -> None:
    if isinstance(obj, Drawable):  # kiểm tra lúc chạy
        obj.draw()
```

## Lập trình bất đồng bộ

Mẫu đồng thời chung cho mọi ngôn ngữ: [concurrency.md](../concurrency.md).

### async/await cơ bản

```python
import asyncio

# ❌ Gọi đồng bộ, chặn
def fetch_all_sync(urls: list[str]) -> list[str]:
    results = []
    for url in urls:
        results.append(requests.get(url).text)  # chạy tuần tự
    return results

# ✅ Gọi bất đồng bộ, chạy đồng thời
async def fetch_url(url: str) -> str:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()

async def fetch_all(urls: list[str]) -> list[str]:
    tasks = [fetch_url(url) for url in urls]
    return await asyncio.gather(*tasks)  # chạy đồng thời
```

### Async context manager

```python
from contextlib import asynccontextmanager
from typing import AsyncIterator

# ✅ Class async context manager
class AsyncDatabase:
    async def __aenter__(self) -> 'AsyncDatabase':
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.disconnect()

# ✅ Dùng decorator
@asynccontextmanager
async def get_connection() -> AsyncIterator[Connection]:
    conn = await create_connection()
    try:
        yield conn
    finally:
        await conn.close()

async def query_data():
    async with get_connection() as conn:
        return await conn.fetch("SELECT * FROM users")
```

### Async iterator

```python
from typing import AsyncIterator

# ✅ Async generator
async def fetch_pages(url: str) -> AsyncIterator[dict]:
    page = 1
    while True:
        data = await fetch_page(url, page)
        if not data['items']:
            break
        yield data
        page += 1

# ✅ Duyệt bất đồng bộ
async def process_all_pages():
    async for page in fetch_pages("https://api.example.com"):
        await process_page(page)
```

### Quản lý task và hủy task

```python
import asyncio

# ❌ Không xử lý hủy
async def bad_worker():
    while True:
        await do_work()  # không hủy gọn được

# ✅ Xử lý hủy đúng
async def good_worker():
    try:
        while True:
            await do_work()
    except asyncio.CancelledError:
        await cleanup()  # dọn tài nguyên
        raise  # ném lại để bên gọi biết task đã hủy

# ✅ Giới hạn thời gian
async def fetch_with_timeout(url: str) -> str:
    try:
        async with asyncio.timeout(10):  # Python 3.11+
            return await fetch_url(url)
    except asyncio.TimeoutError:
        return ""

# ✅ Task group (Python 3.11+)
async def fetch_multiple():
    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch_url("url1"))
        task2 = tg.create_task(fetch_url("url2"))
    # tự chờ mọi task xong, exception truyền ra ngoài
    return task1.result(), task2.result()
```

### Trộn đồng bộ và bất đồng bộ

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

# ✅ Chạy hàm đồng bộ trong code async
async def run_sync_in_async():
    loop = asyncio.get_event_loop()
    # chạy thao tác chặn trong thread pool
    result = await loop.run_in_executor(
        None,  # thread pool mặc định
        blocking_io_function,
        arg1, arg2
    )
    return result

# ✅ Chạy hàm async từ code đồng bộ
def run_async_in_sync():
    return asyncio.run(async_function())

# ❌ Không dùng time.sleep trong code async
async def bad_delay():
    time.sleep(1)  # chặn cả event loop!

# ✅ Dùng asyncio.sleep
async def good_delay():
    await asyncio.sleep(1)
```

### Semaphore và giới hạn tốc độ

```python
import asyncio

# ✅ Giới hạn số việc đồng thời bằng semaphore
async def fetch_with_limit(urls: list[str], max_concurrent: int = 10):
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(url: str) -> str:
        async with semaphore:
            return await fetch_url(url)

    return await asyncio.gather(*[fetch_one(url) for url in urls])

# ✅ Producer-consumer bằng asyncio.Queue
async def producer_consumer():
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)

    async def producer():
        for item in items:
            await queue.put(item)
        await queue.put(None)  # tín hiệu kết thúc

    async def consumer():
        while True:
            item = await queue.get()
            if item is None:
                break
            await process(item)
            queue.task_done()

    await asyncio.gather(producer(), consumer())
```

## Xử lý exception

Nguyên tắc xử lý lỗi chung: [error-handling.md](../error-handling.md).

### Bắt exception

```python
# ❌ Bắt quá rộng
try:
    result = risky_operation()
except:  # bắt mọi thứ, kể cả KeyboardInterrupt!
    pass

# ❌ Bắt Exception rồi bỏ qua
try:
    result = risky_operation()
except Exception:
    pass  # nuốt mọi exception, khó debug

# ✅ Bắt exception cụ thể
try:
    result = risky_operation()
except ValueError as e:
    logger.error(f"Invalid value: {e}")
    raise
except IOError as e:
    logger.error(f"IO error: {e}")
    return default_value

# ✅ Nhiều loại exception
try:
    result = parse_and_process(data)
except (ValueError, TypeError, KeyError) as e:
    logger.error(f"Data error: {e}")
    raise DataProcessingError(str(e)) from e
```

### Chuỗi exception

```python
# ❌ Mất thông tin exception gốc
try:
    result = external_api.call()
except APIError as e:
    raise RuntimeError("API failed")  # mất nguyên nhân

# ✅ Giữ chuỗi exception bằng from
try:
    result = external_api.call()
except APIError as e:
    raise RuntimeError("API failed") from e

# ✅ Cắt chuỗi exception có chủ ý (hiếm khi cần)
try:
    result = external_api.call()
except APIError:
    raise RuntimeError("API failed") from None
```

### Exception tự định nghĩa

```python
# ✅ Phân cấp exception nghiệp vụ
class AppError(Exception):
    """Exception gốc của ứng dụng"""
    pass

class ValidationError(AppError):
    """Lỗi kiểm tra dữ liệu"""
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")

class NotFoundError(AppError):
    """Không tìm thấy tài nguyên"""
    def __init__(self, resource: str, id: str | int):
        self.resource = resource
        self.id = id
        super().__init__(f"{resource} with id {id} not found")

# Cách dùng
def get_user(user_id: int) -> User:
    user = db.get(user_id)
    if not user:
        raise NotFoundError("User", user_id)
    return user
```

### Exception trong context manager

```python
from contextlib import contextmanager

# ✅ Xử lý exception đúng trong context manager
@contextmanager
def transaction():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ✅ Dùng ExceptionGroup (Python 3.11+)
def process_batch(items: list) -> None:
    errors = []
    for item in items:
        try:
            process(item)
        except Exception as e:
            errors.append(e)

    if errors:
        raise ExceptionGroup("Batch processing failed", errors)
```

## Bẫy thường gặp

### Tham số mặc định mutable

```python
# ❌ Tham số mặc định mutable
def add_item(item, items=[]):  # Lỗi! Dùng chung giữa các lần gọi
    items.append(item)
    return items

add_item(1)  # [1]
add_item(2)  # [1, 2] chứ không phải [2]!

# ✅ Dùng None làm mặc định
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

# ✅ Hoặc dùng field của dataclass
from dataclasses import dataclass, field

@dataclass
class Container:
    items: list = field(default_factory=list)
```

### Thuộc tính class mutable

```python
# ❌ Thuộc tính class mutable
class User:
    permissions = []  # dùng chung cho mọi instance!

u1 = User()
u2 = User()
u1.permissions.append("admin")
print(u2.permissions)  # ["admin"], bị dùng chung ngoài ý muốn!

# ✅ Khởi tạo trong __init__
class User:
    def __init__(self):
        self.permissions = []

# ✅ Dùng dataclass
@dataclass
class User:
    permissions: list = field(default_factory=list)
```

### Closure trong vòng lặp

```python
# ❌ Closure bắt biến vòng lặp
funcs = []
for i in range(3):
    funcs.append(lambda: i)

print([f() for f in funcs])  # [2, 2, 2] chứ không phải [0, 1, 2]!

# ✅ Bắt giá trị bằng tham số mặc định
funcs = []
for i in range(3):
    funcs.append(lambda i=i: i)

print([f() for f in funcs])  # [0, 1, 2]

# ✅ Dùng functools.partial
from functools import partial

funcs = [partial(lambda x: x, i) for i in range(3)]
```

### is và ==

```python
# ❌ So sánh giá trị bằng is
if x is 1000:  # có thể sai!
    pass

# Python cache số nguyên nhỏ (-5 tới 256)
a = 256
b = 256
a is b  # True

a = 257
b = 257
a is b  # False!

# ✅ So sánh giá trị bằng ==
if x == 1000:
    pass

# ✅ Chỉ dùng is cho None và singleton
if x is None:
    pass

if x is True:  # kiểm tra chặt giá trị boolean
    pass
```

### Hiệu năng nối chuỗi

```python
# ❌ Nối chuỗi trong vòng lặp
result = ""
for item in large_list:
    result += str(item)  # độ phức tạp O(n²)

# ✅ Dùng join
result = "".join(str(item) for item in large_list)  # O(n)

# ✅ Dựng chuỗi lớn bằng StringIO
from io import StringIO

buffer = StringIO()
for item in large_list:
    buffer.write(str(item))
result = buffer.getvalue()
```

## Test

### pytest cơ bản

```python
import pytest

# ✅ Tên test mô tả rõ tình huống
def test_user_creation_with_valid_email():
    user = User(email="test@example.com")
    assert user.email == "test@example.com"

def test_user_creation_with_invalid_email_raises_error():
    with pytest.raises(ValidationError):
        User(email="invalid")

# ✅ Test tham số hóa
@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("World", "WORLD"),
    ("", ""),
    ("123", "123"),
])
def test_uppercase(input: str, expected: str):
    assert input.upper() == expected

# ✅ Test exception
def test_division_by_zero():
    with pytest.raises(ZeroDivisionError) as exc_info:
        1 / 0
    assert "division by zero" in str(exc_info.value)
```

### Fixture

```python
import pytest
from typing import Generator

# ✅ Fixture cơ bản
@pytest.fixture
def user() -> User:
    return User(name="Test User", email="test@example.com")

def test_user_name(user: User):
    assert user.name == "Test User"

# ✅ Fixture có dọn dẹp
@pytest.fixture
def database() -> Generator[Database, None, None]:
    db = Database()
    db.connect()
    yield db
    db.disconnect()  # dọn sau khi test chạy xong

# ✅ Fixture async
@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient() as client:
        yield client

# ✅ Fixture dùng chung (conftest.py)
@pytest.fixture(scope="session")
def app():
    """Instance app dùng chung cho cả phiên test"""
    return create_app()

@pytest.fixture(scope="module")
def db(app):
    """Kết nối CSDL dùng chung trong mỗi module test"""
    return app.db
```

### Mock và patch

```python
from unittest.mock import Mock, patch, AsyncMock

# ✅ Mock phụ thuộc bên ngoài
def test_send_email():
    mock_client = Mock()
    mock_client.send.return_value = True

    service = EmailService(client=mock_client)
    result = service.send_welcome_email("user@example.com")

    assert result is True
    mock_client.send.assert_called_once_with(
        to="user@example.com",
        subject="Welcome!",
        body=ANY,
    )

# ✅ Patch hàm cấp module
@patch("myapp.services.external_api.call")
def test_with_patched_api(mock_call):
    mock_call.return_value = {"status": "ok"}
    result = process_data()
    assert result["status"] == "ok"

# ✅ Mock async
async def test_async_function():
    mock_fetch = AsyncMock(return_value={"data": "test"})
    with patch("myapp.client.fetch", mock_fetch):
        result = await get_data()
    assert result == {"data": "test"}
```

### Tổ chức test

```python
# ✅ Gom test liên quan vào class
class TestUserAuthentication:
    """Test xác thực người dùng"""

    def test_login_with_valid_credentials(self, user):
        assert authenticate(user.email, "password") is True

    def test_login_with_invalid_password(self, user):
        assert authenticate(user.email, "wrong") is False

    def test_login_locks_after_failed_attempts(self, user):
        for _ in range(5):
            authenticate(user.email, "wrong")
        assert user.is_locked is True

# ✅ Gắn mark cho test
@pytest.mark.slow
def test_large_data_processing():
    pass

@pytest.mark.integration
def test_database_connection():
    pass

# Chạy test theo mark: pytest -m "not slow"
```

### Độ phủ và chất lượng test

```toml
# pytest.ini hoặc pyproject.toml
[tool.pytest.ini_options]
addopts = "--cov=myapp --cov-report=term-missing --cov-fail-under=80"
testpaths = ["tests"]
```

```python
# ✅ Test điều kiện biên
def test_empty_input():
    assert process([]) == []

def test_none_input():
    with pytest.raises(TypeError):
        process(None)

def test_large_input():
    large_data = list(range(100000))
    result = process(large_data)
    assert len(result) == 100000
```

## Hiệu năng

### Chọn cấu trúc dữ liệu

```python
# ❌ Tìm trong list: O(n)
if item in large_list:  # chậm
    pass

# ✅ Tìm trong set: O(1)
large_set = set(large_list)
if item in large_set:  # nhanh
    pass

# ✅ Dùng module collections
from collections import Counter, defaultdict, deque

# Đếm
word_counts = Counter(words)
most_common = word_counts.most_common(10)

# Dict có giá trị mặc định
graph = defaultdict(list)
graph[node].append(neighbor)

# Hàng đợi hai đầu (thao tác ở hai đầu O(1))
queue = deque()
queue.appendleft(item)  # O(1), còn list.insert(0, item) là O(n)
```

### Generator và iterator

```python
# ❌ Nạp toàn bộ dữ liệu một lần
def get_all_users():
    return [User(row) for row in db.fetch_all()]  # tốn bộ nhớ

# ✅ Dùng generator
def get_all_users():
    for row in db.fetch_all():
        yield User(row)  # lazy: chỉ nạp khi cần

# ✅ Generator expression
sum_of_squares = sum(x**2 for x in range(1000000))  # không tạo list

# ✅ Module itertools
from itertools import islice, chain, groupby

# Chỉ lấy 10 phần tử đầu
first_10 = list(islice(infinite_generator(), 10))

# Nối nhiều iterator
all_items = chain(list1, list2, list3)

# Gom nhóm
for key, group in groupby(sorted(items, key=get_key), key=get_key):
    process_group(key, list(group))
```

### Cache

```python
from functools import lru_cache, cache

# ✅ Cache LRU
@lru_cache(maxsize=128)
def expensive_computation(n: int) -> int:
    return sum(i**2 for i in range(n))

# ✅ Cache không giới hạn (Python 3.9+)
@cache
def fibonacci(n: int) -> int:
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# ✅ Cache tự viết (khi cần kiểm soát nhiều hơn)
class DataService:
    def __init__(self):
        self._cache: dict[str, Any] = {}
        self._cache_ttl: dict[str, float] = {}

    def get_data(self, key: str) -> Any:
        if key in self._cache:
            if time.time() < self._cache_ttl[key]:
                return self._cache[key]

        data = self._fetch_data(key)
        self._cache[key] = data
        self._cache_ttl[key] = time.time() + 300  # 5 phút
        return data
```

### Xử lý song song

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# ✅ Việc nặng I/O dùng thread pool
def fetch_all_urls(urls: list[str]) -> list[str]:
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_url, urls))
    return results

# ✅ Việc nặng CPU dùng process pool
def process_large_dataset(data: list) -> list:
    with ProcessPoolExecutor() as executor:
        results = list(executor.map(heavy_computation, data))
    return results

# ✅ Lấy kết quả xong trước bằng as_completed
from concurrent.futures import as_completed

with ThreadPoolExecutor() as executor:
    futures = {executor.submit(fetch, url): url for url in urls}
    for future in as_completed(futures):
        url = futures[future]
        try:
            result = future.result()
        except Exception as e:
            print(f"{url} failed: {e}")
```

## Style

### Điểm chính của PEP 8

```python
# ✅ Quy tắc đặt tên
class MyClass:  # tên class PascalCase
    MAX_SIZE = 100  # hằng số UPPER_SNAKE_CASE

    def method_name(self):  # method snake_case
        local_var = 1  # biến snake_case

# ✅ Thứ tự import
# 1. Thư viện chuẩn
import os
import sys
from typing import Optional

# 2. Thư viện bên thứ ba
import numpy as np
import pandas as pd

# 3. Module nội bộ
from myapp import config
from myapp.utils import helper

# ✅ Giới hạn độ dài dòng (79 hoặc 88 ký tự)
# Ngắt dòng biểu thức dài
result = (
    long_function_name(arg1, arg2, arg3)
    + another_long_function(arg4, arg5)
)

# ✅ Quy tắc dòng trống
class MyClass:
    """Docstring của lớp"""

    def method_one(self):
        pass

    def method_two(self):  # giữa các method: một dòng trống
        pass


def top_level_function():  # giữa các định nghĩa cấp cao nhất: hai dòng trống
    pass
```

### Docstring

```python
# ✅ Docstring kiểu Google
def calculate_area(width: float, height: float) -> float:
    """Tính diện tích hình chữ nhật.

    Args:
        width: Chiều rộng (phải dương).
        height: Chiều cao (phải dương).

    Returns:
        Diện tích hình chữ nhật.

    Raises:
        ValueError: Nếu width hoặc height âm.

    Example:
        >>> calculate_area(3, 4)
        12.0
    """
    if width < 0 or height < 0:
        raise ValueError("Dimensions must be positive")
    return width * height

# ✅ Docstring của class
class DataProcessor:
    """Lớp tiện ích xử lý và chuyển đổi dữ liệu.

    Attributes:
        source: Đường dẫn nguồn dữ liệu.
        format: Định dạng đầu ra ('json' hoặc 'csv').

    Example:
        >>> processor = DataProcessor("data.csv")
        >>> processor.process()
    """
```

### Tính năng Python hiện đại

```python
# ✅ f-string (Python 3.6+)
name = "World"
print(f"Hello, {name}!")

# Kèm biểu thức
print(f"Result: {1 + 2 = }")  # "Result: 1 + 2 = 3"

# ✅ Toán tử walrus (Python 3.8+)
if (n := len(items)) > 10:
    print(f"List has {n} items")

# ✅ Dấu phân tách tham số vị trí (Python 3.8+)
def greet(name, /, greeting="Hello", *, punctuation="!"):
    """name chỉ truyền theo vị trí, punctuation chỉ truyền theo từ khóa"""
    return f"{greeting}, {name}{punctuation}"

# ✅ Pattern matching (Python 3.10+)
def handle_response(response: dict):
    match response:
        case {"status": "ok", "data": data}:
            return process_data(data)
        case {"status": "error", "message": msg}:
            raise APIError(msg)
        case _:
            raise ValueError("Unknown response format")
```

## Checklist

### An toàn kiểu

- [ ] Hàm có type annotation (tham số và giá trị trả về)
- [ ] Dùng `Optional` khi giá trị có thể là None
- [ ] Dùng kiểu generic đúng
- [ ] mypy chạy qua, không lỗi
- [ ] Tránh `Any`; khi buộc phải dùng, ghi chú thích giải thích lý do

### Code async

- [ ] async/await dùng đúng cặp
- [ ] Không gọi hàm chặn trong code async
- [ ] Xử lý đúng `CancelledError`
- [ ] Dùng `asyncio.gather` hoặc `TaskGroup` để chạy đồng thời
- [ ] Dọn tài nguyên đúng (async context manager)

### Xử lý exception

- [ ] Bắt exception cụ thể, không dùng `except:` trần
- [ ] Chuỗi exception dùng `from` để giữ nguyên nhân
- [ ] Exception tự định nghĩa kế thừa class gốc phù hợp
- [ ] Thông điệp exception có nghĩa, dễ debug

### Cấu trúc dữ liệu

- [ ] Không có tham số mặc định mutable (list, dict, set)
- [ ] Thuộc tính class không phải object mutable
- [ ] Chọn đúng cấu trúc dữ liệu (tìm kiếm bằng set thay vì list)
- [ ] Tập dữ liệu lớn dùng generator thay vì list

### Test

- [ ] Độ phủ test đạt ngưỡng (khuyến nghị ≥80%)
- [ ] Tên test mô tả rõ tình huống
- [ ] Có test cho điều kiện biên
- [ ] Mock cô lập đúng phụ thuộc bên ngoài
- [ ] Code async có test async tương ứng

### Style

- [ ] Theo PEP 8
- [ ] Hàm và class có docstring
- [ ] Thứ tự import đúng (thư viện chuẩn, bên thứ ba, nội bộ)
- [ ] Tên nhất quán, có nghĩa
- [ ] Dùng tính năng Python hiện đại (f-string, toán tử walrus...)

### Hiệu năng

- [ ] Không tạo object lặp lại trong vòng lặp
- [ ] Nối chuỗi bằng join
- [ ] Dùng cache hợp lý (`@lru_cache`)
- [ ] Việc nặng I/O hoặc CPU dùng cách song song phù hợp

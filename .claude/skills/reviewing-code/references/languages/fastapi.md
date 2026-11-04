# FastAPI

Dùng khi review code FastAPI: dependency injection (`Depends`), ranh giới validate của Pydantic v2, bất đồng bộ đúng cách, vòng đời session CSDL và N+1, bảo mật, và cách dùng test client chạy trong tiến trình để chứng minh lỗi thay vì đoán. Bẫy chung của Python: [python.md](python.md).

## Dependency injection (`Depends`)

`Depends` là điểm nối giữ route mỏng và dễ test. Phần lớn lỗi ở đây do route tự làm việc thật thay vì đặt việc đó sau một dependency.

### Logic nghiệp vụ nằm sau dependency hoặc service, không nằm trong route

```python
# ❌ Sai: truy cập CSDL, xác thực, quy tắc nghiệp vụ viết thẳng trong route
@app.get("/orders/{order_id}")
async def get_order(order_id: int):
    conn = await asyncpg.connect(DATABASE_URL)  # mỗi request tạo một kết nối
    row = await conn.fetchrow("SELECT * FROM orders WHERE id = $1", order_id)
    await conn.close()
    if row is None:
        raise HTTPException(404)
    return dict(row)

# ✅ Đúng: route khai báo thứ route cần; session được inject và lấy từ pool
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session

@app.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: int, session: AsyncSession = Depends(get_session)):
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
```

Bản inject cũng là bản ghi đè được trong test (xem [Kiểm chứng bằng test](#kiểm-chứng-bằng-test)).

### Dependency dùng `yield` phải dọn dẹp, kể cả khi có lỗi

```python
# ❌ Sai: không dọn; session rò rỉ nếu route ném lỗi
async def get_session() -> AsyncSession:
    return SessionLocal()

# ✅ Đúng: context manager đóng session khi thành công và khi có exception
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
```

Điểm review: mọi dependency `yield` giữ tài nguyên (session CSDL, file handle, lock) phải giải phóng qua context manager hoặc `try/finally`, để exception trong route không làm rò rỉ tài nguyên.

### Không tạo lại singleton ở mỗi request

```python
# ❌ Sai: mỗi request tạo HTTP client mới (và connection pool mới)
@app.get("/proxy")
async def proxy(client: httpx.AsyncClient = Depends(lambda: httpx.AsyncClient())):
    ...

# ✅ Đúng: một client cho cả vòng đời app, inject theo tham chiếu
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient()
    yield
    await app.state.http.aclose()

def get_http(request: Request) -> httpx.AsyncClient:
    return request.app.state.http
```

### Ưu tiên dạng `Annotated` và dependency async

Từ FastAPI 0.95, cách khai báo dependency chuẩn là `Annotated[T, Depends(...)]`, không phải dạng giá trị mặc định. Dạng này dùng lại được giữa các route và hợp với type checker. Nên viết dependency bằng `async def`: dependency `def` đồng bộ chạy trong threadpool, tốn chi phí thừa cho một kiểm tra nhỏ không có I/O.

```python
# ⚠️ Dạng cũ: vẫn chạy, nhưng không còn là cách viết chuẩn
@app.get("/items")
async def list_items(session: AsyncSession = Depends(get_session)): ...

# ✅ Đúng: dạng Annotated, khai báo một lần, dùng lại mọi nơi
SessionDep = Annotated[AsyncSession, Depends(get_session)]

@app.get("/items")
async def list_items(session: SessionDep): ...
```

### Kiểm tra tồn tại và quyền bằng dependency: kết quả được cache theo request

Dependency là chỗ hợp lý để trả lời "tài nguyên có tồn tại không và người gọi có được đụng vào không?". Pydantic kiểm tra *hình dạng* dữ liệu; dependency kiểm tra với CSDL. FastAPI cache kết quả mỗi dependency trong một request, nên nối nhiều dependency nhỏ không tốn thêm và bỏ được truy vấn trùng.

```python
# ✅ Đúng: dependency nhỏ nối nhau; valid_post chỉ chạy một lần mỗi request
async def valid_post(post_id: int, session: SessionDep) -> Post:
    post = await session.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post

async def owned_post(post: Annotated[Post, Depends(valid_post)], user: CurrentUser) -> Post:
    if post.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return post

@app.delete("/posts/{post_id}", status_code=204)
async def delete_post(post: Annotated[Post, Depends(owned_post)], session: SessionDep):
    await session.delete(post)        # tồn tại và quyền sở hữu đã kiểm tra
    await session.commit()
```

Đây cũng là chỗ gọn nhất để sửa lỗi nhầm xác thực với phân quyền ở mục [Bảo mật](#bảo-mật): kiểm tra quyền sở hữu chuyển vào dependency `owned_post` dùng lại được.

## Model và validate với Pydantic v2

### Tách model đầu vào và đầu ra; không trả thẳng object ORM

```python
# ❌ Sai: response_model là model CSDL nên hashed_password lộ ra client
@app.post("/users", response_model=UserTable)
async def create_user(user: UserTable):  # còn nhận id, is_admin... do client gửi
    ...

# ✅ Đúng: schema riêng vạch ranh giới tin cậy
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    model_config = ConfigDict(from_attributes=True)  # đọc an toàn từ ORM

@app.post("/users", response_model=UserOut, status_code=201)
async def create_user(payload: UserCreate, session: AsyncSession = Depends(get_session)):
    ...
```

`response_model` là bộ lọc, không chỉ là tài liệu: trường không có trong model đầu ra bị loại khỏi response. Dùng lại model CSDL làm response là đường lộ trường nhạy cảm phổ biến nhất.

### Tách schema Create và Update

```python
# ❌ Sai: một schema cho cả tạo và sửa nên PATCH bắt buộc mọi trường
class ItemSchema(BaseModel):
    name: str
    price: float

# ✅ Đúng: update là bản một phần; create đòi đủ dữ liệu
class ItemCreate(BaseModel):
    name: str
    price: float = Field(gt=0)

class ItemUpdate(BaseModel):
    name: str | None = None
    price: float | None = Field(default=None, gt=0)
```

### Validate ở ranh giới, không validate sau khi ghi CSDL

```python
# ❌ Sai: số lượng âm vào tới CSDL trước khi có gì kiểm tra
@app.post("/cart")
async def add_to_cart(item_id: int, quantity: int):
    await save(item_id, quantity)  # quantity = -5 lặng lẽ được chấp nhận

# ✅ Đúng: hệ thống kiểu từ chối trước khi thân handler chạy
class CartLine(BaseModel):
    item_id: int
    quantity: int = Field(gt=0)

@app.post("/cart")
async def add_to_cart(line: CartLine):
    await save(line.item_id, line.quantity)
```

## Bất đồng bộ đúng cách

Đây là điểm FastAPI khác Django và Flask nhiều nhất, và đáng để người review tập trung nhất. Thông lượng của FastAPI đến từ một event loop xen kẽ nhiều request đồng thời. Mô hình này chỉ đứng vững khi loop **không bao giờ bị chặn**: một lời gọi đồng bộ trên loop làm treo *mọi* request đang chạy, không chỉ request của nó. Sai điều này trên khắp codebase thì FastAPI không chỉ mất lợi thế mà còn chạy *chậm hơn* framework đồng bộ như Flask, vì mô hình mỗi worker một request của Flask không có loop chung để nghẽn. Việc của người review: giữ mọi việc trên loop thật sự không chặn, và coi mỗi lối thoát (escape hatch) là chi phí, không phải cách sửa.

### Không gọi code chặn trong route `async def`

```python
# ❌ Sai: I/O chặn trên loop làm treo mọi request đồng thời, không chỉ request này
@app.get("/report")
async def report():
    data = requests.get("https://slow-api.example.com").json()  # socket chặn
    time.sleep(2)                                                # chặn loop
    return data

# ✅ Đúng: await client async gốc; loop phục vụ request khác trong lúc chờ
@app.get("/report")
async def report(client: httpx.AsyncClient = Depends(get_http)):
    resp = await client.get("https://slow-api.example.com")
    return resp.json()
```

### Ưu tiên SDK async gốc thay cho thư viện đồng bộ

Cách sửa I/O chặn gần như luôn là dùng thư viện hỗ trợ `async` gốc, không phải bọc thư viện đồng bộ. Tìm client async trước; threadpool là phương án cuối, không phải mặc định.

| Đồng bộ (chặn loop) | Thay bằng bản async gốc |
|---|---|
| `requests` | `httpx.AsyncClient`, `aiohttp` |
| `psycopg2` (đồng bộ) | `asyncpg`, SQLAlchemy async engine |
| `redis-py` (đồng bộ) | `redis.asyncio` |
| `pymongo` | `motor` |
| `boto3` | `aioboto3` |

Thấy `asyncio.run(...)`, event loop mới hoặc thread tự khởi động *bên trong* route là dấu hiệu xấu: đó là cố gắn code đồng bộ vào loop. `asyncio.run()` trong một loop đang chạy ném `RuntimeError` ngay; các cách còn lại lặng lẽ làm mất phần hiệu năng vốn là lý do chọn FastAPI.

```python
# ❌ Sai: dựng loop/thread để gọi SDK async từ ngữ cảnh đồng bộ
@app.get("/users/{uid}")
def get_user(uid: int):
    return asyncio.run(repo.fetch(uid))  # RuntimeError khi loop đang chạy

# ✅ Đúng: cho route là async và await thẳng client gốc
@app.get("/users/{uid}")
async def get_user(uid: int):
    return await repo.fetch(uid)
```

### Threadpool là lối thoát có giới hạn, không phải mặc định

Route `def` thường, và `run_in_threadpool(...)`, không chạy trên loop; FastAPI chạy chúng trong một worker threadpool **có giới hạn** (AnyIO mặc định tối đa 40 thread). Với lời gọi chặn thỉnh thoảng mới có và thật sự không tránh được, đây là công cụ đúng:

```python
from fastapi.concurrency import run_in_threadpool

@app.get("/legacy")
async def legacy():
    return await run_in_threadpool(blocking_library_call)  # chỉ khi không có SDK async
```

Nhưng threadpool không mở rộng như loop. Cho mọi hot path đi qua threadpool thì khi tải cao, mọi worker cùng bị chặn; request sau xếp hàng sau giới hạn và thông lượng sụp. Tự tạo thread hoặc process để "thêm đồng thời" còn tệ hơn: khi số thread sống vượt số nhân CPU, chi phí chuyển ngữ cảnh và tranh chấp GIL làm hiệu năng giảm mạnh thay vì tăng. Lối thoát này dành cho phụ thuộc chặn hiếm hoi không thay được, không thay thế việc chọn SDK async.

Quy tắc review: route `def` chấp nhận được cho endpoint ít tải và không có bản async tương đương. Endpoint tải cao làm việc chặn trong route `def` (hoặc qua `run_in_threadpool`) là lỗi mở rộng: đánh dấu và yêu cầu dùng SDK async.

### Việc nặng CPU đưa sang worker process, không chạy trên loop hay threadpool

Cả event loop lẫn threadpool đều không giúp được việc nặng CPU: với GIL, mỗi lúc chỉ một thread chạy bytecode Python, nên tính toán nặng chặn từ threadpool cũng tệ như chặn từ loop. Đẩy sang process riêng (Celery, Arq, RQ, hoặc `multiprocessing`).

```python
# ❌ Sai: việc nặng CPU giữ chặt worker; thông lượng giảm với mọi người
@app.post("/render")
async def render(doc: Doc):
    return heavy_pdf_render(doc)            # vài giây CPU thuần trên loop

# ✅ Đúng: đưa vào hàng đợi cho worker process; trả về mã job
@app.post("/render", status_code=202)
async def render(doc: Doc):
    job = await queue.enqueue(heavy_pdf_render, doc)
    return {"job_id": job.id}
```

### Không gọi coroutine rồi bỏ đó mà không await

```python
# ❌ Sai: coroutine không được await; email không bao giờ gửi (và không có lỗi nào hiện ra)
@app.post("/signup")
async def signup(user: UserCreate):
    send_welcome_email(user.email)  # trả về coroutine, lặng lẽ bị bỏ

# ✅ Đúng: hoãn việc sau response bằng BackgroundTasks
@app.post("/signup")
async def signup(user: UserCreate, tasks: BackgroundTasks):
    tasks.add_task(send_welcome_email, user.email)
```

`BackgroundTasks` chạy trong tiến trình, không có thử lại hay lưu bền: chỉ dùng cho việc ngắn, kiểu fire-and-forget (gửi email, ghi sự kiện). Việc chạy lâu hoặc bắt buộc thử lại (xử lý dữ liệu, thanh toán) phải vào hàng đợi task thật (Celery/Arq/RQ).

## Session CSDL và N+1

Mẫu N+1 và cách xử lý trên nhiều ngôn ngữ: [n-plus-one.md](../n-plus-one.md).

### Mỗi request một session, inject vào, không dùng biến toàn cục

```python
# ❌ Sai: session cấp module dùng chung giữa các request đồng thời (không an toàn)
session = SessionLocal()

# ✅ Đúng: session theo request qua dependency (xem get_session ở trên)
@app.get("/items")
async def list_items(session: AsyncSession = Depends(get_session)):
    ...
```

### Eager-load quan hệ để tránh N+1

```python
# ❌ Sai: một truy vấn lấy order, rồi mỗi order một truy vấn lấy customer
orders = (await session.execute(select(Order))).scalars().all()
return [{"id": o.id, "customer": o.customer.name} for o in orders]  # N+1

# ✅ Đúng: một truy vấn, quan hệ eager-load
stmt = select(Order).options(selectinload(Order.customer))
orders = (await session.execute(stmt)).scalars().all()
return [{"id": o.id, "customer": o.customer.name} for o in orders]
```

Với SQLAlchemy async, truy cập thuộc tính lazy ngoài session thường ném lỗi thay vì lặng lẽ truy vấn, nhưng vấn đề thiết kế vẫn như nhau. Soi chỗ truy cập quan hệ trong vòng lặp mà không có eager load `options(...)`.

### Phân trang endpoint danh sách

```python
# ❌ Sai: trả mọi dòng; càng chậm khi bảng lớn dần
@app.get("/users")
async def list_users(session: AsyncSession = Depends(get_session)):
    return (await session.execute(select(User))).scalars().all()

# ✅ Đúng: trang có giới hạn trên hợp lý
@app.get("/users", response_model=list[UserOut])
async def list_users(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(User).limit(limit).offset(offset)
    return (await session.execute(stmt)).scalars().all()
```

### Gom nhóm và join trong SQL, không trong Python

Handler kéo dòng vào bộ nhớ rồi lặp để gom nhóm, đếm hoặc join là đang dùng CSDL chỉ như nơi chứa dữ liệu. Đẩy việc xuống CSDL: CSDL xử lý phép toán tập hợp nhanh hơn nhiều và truyền ít dữ liệu hơn.

```python
# ❌ Sai: lấy mọi order rồi cộng theo customer trong Python
orders = (await session.execute(select(Order))).scalars().all()
totals: dict[int, float] = {}
for o in orders:
    totals[o.customer_id] = totals.get(o.customer_id, 0) + o.amount

# ✅ Đúng: để CSDL gom nhóm và cộng
stmt = select(Order.customer_id, func.sum(Order.amount)).group_by(Order.customer_id)
totals = dict((await session.execute(stmt)).all())
```

## Bảo mật

### Khai báo dependency xác thực không có nghĩa là đã kiểm tra phân quyền

Đây là điểm đáng tìm nhất. `Depends(get_current_user)` chứng minh người gọi *là ai*, **không** chứng minh họ được đụng vào *tài nguyên này*.

```python
# ❌ Sai: người dùng đã đăng nhập nào cũng xóa được tài liệu của người khác
@app.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    doc = await session.get(Document, doc_id)
    await session.delete(doc)            # không kiểm tra doc.owner_id == user.id
    await session.commit()

# ✅ Đúng: kiểm tra quyền sở hữu trước khi thay đổi
@app.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    doc_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    doc = await session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    await session.delete(doc)
    await session.commit()
```

Mục [Kiểm chứng bằng test](#kiểm-chứng-bằng-test) tái hiện đúng lỗi này bằng một test fail.

### Tham số hóa SQL; không đưa dữ liệu người dùng vào f-string

SQL injection trên nhiều ngôn ngữ và cách dùng ORM không an toàn: [sql-injection.md](../sql-injection.md).

```python
# ❌ Sai: nội suy dữ liệu người dùng vào SQL
await session.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))

# ✅ Đúng: bind parameter
await session.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})
```

### Không mở CORS thành credentials + wildcard

```python
# ❌ Sai: origin wildcard kèm credentials bị trình duyệt từ chối và không an toàn
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True)

# ✅ Đúng: liệt kê origin tin cậy khi cho phép credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
)
```

Kiểm tra thêm: secret đọc từ config/biến môi trường (không hardcode), `detail` của `HTTPException` không lộ thông tin nội bộ (stack trace, SQL), endpoint xác thực có rate limiting.

## Kiểm chứng bằng test

> Nguyên tắc của TDD: *chưa thấy test fail thì chưa biết test có kiểm đúng thứ cần kiểm không.* Với agent viết code, nguyên tắc này còn quan trọng hơn với người review. Agent có thể đọc và suy luận sai: hiểu nhầm luồng điều khiển, tưởng tượng ra một bảo đảm không tồn tại, hoặc hợp lý hóa một kết luận dễ chịu. Vì vậy nhận xét bằng lời như "chỗ này có vẻ an toàn" tự nó không nặng ký. Test chạy được là **căn cứ khách quan** duy nhất agent kiểm soát hoàn toàn: test pass hoặc fail, bất kể suy luận tự tin tới đâu. Test là điểm neo độ tin cậy của agent. Review theo cùng kỷ luật viết code, tái hiện thay vì khẳng định, biến linh cảm thành bằng chứng.

Nhận xét review bằng lời ("chỗ này có thể cho người dùng xóa dữ liệu của nhau") chính là loại giả thuyết dễ sai đó. FastAPI làm căn cứ khách quan rẻ: client chạy trong tiến trình (`httpx.AsyncClient` qua `ASGITransport`) chạy cả app, còn `app.dependency_overrides` thay xác thực và CSDL mà không cần patch bên trong. Thay vì tin vào cách mình đọc code, agent giải quyết câu hỏi bằng tái hiện.

### Tái hiện lỗi nghi ngờ bằng test fail (Verify RED)

Giả sử người review nghi route `DELETE /documents/{doc_id}` ở trên không kiểm tra quyền sở hữu. Viết test khẳng định hành vi *an toàn*, chạy và **xem test fail**: lần fail đó là bằng chứng.

```python
# test_document_authorization.py
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import Header
from app.main import app
from app.deps import get_current_user, get_session

# Hai người dùng; override chọn một người theo header của test.
USERS = {"alice": User(id=1, email="alice@example.com"),
         "bob":   User(id=2, email="bob@example.com")}

def fake_current_user(x_test_user: str = Header(default="alice")) -> User:
    return USERS[x_test_user]

@pytest.mark.asyncio
async def test_user_cannot_delete_another_users_document(session):  # fixture async
    # Chuẩn bị: tài liệu của Alice (id=1)
    session.add(Document(id=10, owner_id=1, title="Alice's doc"))
    await session.commit()

    app.dependency_overrides[get_current_user] = fake_current_user
    app.dependency_overrides[get_session] = lambda: session

    # Hành động: Bob thử xóa tài liệu của Alice
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete("/documents/10", headers={"X-Test-User": "bob"})

    # Khẳng định hành vi an toàn mong đợi
    assert resp.status_code == 403

    app.dependency_overrides.clear()
```

Chạy với code chưa sửa và xác nhận lần fail là do lỗi thật, không do gõ nhầm:

```bash
$ pytest test_document_authorization.py
FAILED  assert 204 == 403
#       ^ endpoint xóa tài liệu của Alice cho Bob: lỗ hổng đã xác nhận
```

Fail dạng `204 == 403` (không phải lỗi import, không phải 404) làm phát hiện đáng tin: route trả thành công cho thao tác lẽ ra bị cấm. Bản sửa ở mục [Bảo mật](#bảo-mật) làm test chuyển xanh:

```bash
$ pytest test_document_authorization.py
PASSED
```

Đính kèm test này vào review. Test ghi lại lỗ hổng, chứng minh bản sửa và chặn hồi quy, mạnh hơn nhiều so với "nên cân nhắc kiểm tra quyền sở hữu ở đây".

### Ưu tiên `dependency_overrides` thay cho `patch`/`mock`

DI của FastAPI chính là điểm nối mà TDD đòi hỏi: khi thứ gì đó khó test nếu không mock mọi thứ, thường đó là dấu hiệu bị gắn chặt. `Depends` đã cho sẵn điểm inject nên hiếm khi cần `unittest.mock.patch`.

```python
# ❌ Sai: patch phần bên trong, dễ vỡ, gắn test vào đường dẫn import
@patch("app.routes.orders.asyncpg.connect")
def test_get_order(mock_connect): ...

# ✅ Đúng: ghi đè dependency bằng bản giả thật chạy trong bộ nhớ
app.dependency_overrides[get_session] = lambda: in_memory_session
app.dependency_overrides[get_current_user] = lambda: test_user
```

Luôn reset override giữa các test (`app.dependency_overrides.clear()` trong phần teardown của fixture) để trạng thái không rò rỉ sang test khác.

Ví dụ tái hiện ở trên dùng `httpx.AsyncClient` qua `ASGITransport` với `@pytest.mark.asyncio`: đây là quy ước cộng đồng cho app async, bộ test dùng chung event loop với app nên tránh được lỗi lệch loop về sau. `TestClient` đồng bộ đơn giản hơn và ổn cho app hoàn toàn đồng bộ, nhưng chuẩn hóa client async ngay từ đầu tránh được đợt chuyển đổi tốn công khi có route hoặc fixture chuyển sang async.

### Soi cả test của PR, không chỉ code

PR có kèm test chưa chắc đã an toàn. Áp các kiểm tra sau cho *test* trong diff:

```python
# ❌ Sai: chỉ có happy path. Chứng minh route chạy khi mọi thứ đúng,
#          không nói gì về đường validate và phân quyền.
def test_create_item():
    resp = client.post("/items", json={"name": "x", "price": 5})
    assert resp.status_code == 201

# ✅ Đúng: lỗi nằm ở ranh giới và đường thất bại
def test_create_item_rejects_negative_price():
    resp = client.post("/items", json={"name": "x", "price": -5})
    assert resp.status_code == 422

def test_create_item_requires_authentication():
    resp = client_without_auth.post("/items", json={"name": "x", "price": 5})
    assert resp.status_code == 401
```

Câu hỏi review cho bộ test:

- **Test kiểm hành vi hay kiểm mock?** Assertion chỉ xác nhận mock đã được gọi là chứng minh phần chuẩn bị của chính test, không chứng minh endpoint.
- **Đường thất bại có được phủ không?** 401/403/404/422, không chỉ 200/201. Lỗi tập trung ở ranh giới.
- **Mock có đủ không?** Mock một phần response của API ngoài, thiếu trường mà handler đọc, pass trong test nhưng hỏng trên production.
- **Test có viết sau khi code đã xong không?** Test thêm cùng lúc với code và pass ngay lần đầu chưa từng chứng minh test có thể fail, nên chứng minh được rất ít. Test tái hiện lỗi (fail trước, pass sau) đáng giá hơn test xanh từ đầu.

## Tài liệu chính thức

- [FastAPI documentation](https://fastapi.tiangolo.com/): async, dependency, testing.

## Checklist

### Dependency injection

- [ ] Route mỏng: truy cập CSDL và quy tắc nghiệp vụ nằm sau `Depends`/service
- [ ] Dependency `yield` giải phóng tài nguyên qua context manager hoặc `try/finally`
- [ ] Singleton (HTTP client, pool) tạo một lần trong `lifespan`, không tạo theo request
- [ ] Dùng dạng `Annotated[T, Depends(...)]`; dependency là `async def` trừ khi làm I/O chặn
- [ ] Kiểm tra tồn tại/quyền nằm trong dependency (có cache), không chép lặp trong route
- [ ] Dependency ghi đè được trong test (không tạo tài nguyên inline trong route)

### Validate

- [ ] Đầu vào và đầu ra dùng model Pydantic riêng; object ORM không làm `response_model`
- [ ] Đặt `response_model` để trường nhạy cảm không lộ
- [ ] Tách schema Create và Update (update là bản một phần)
- [ ] Ràng buộc (`gt`, `le`, `EmailStr`...) áp ở ranh giới, trước khi ghi CSDL

### Bất đồng bộ

- [ ] Không có lời gọi chặn (`requests`, `time.sleep`, driver CSDL chặn) trong `async def`
- [ ] Ưu tiên SDK async gốc (`httpx`, `asyncpg`, `redis.asyncio`...) thay cho bản đồng bộ
- [ ] Không có `asyncio.run`, event loop tự tạo hay thread tự tạo trong route
- [ ] `run_in_threadpool`/route `def` chỉ là phương án cuối, không nằm trên hot path
- [ ] Việc nặng CPU đưa sang worker process (Celery/Arq/RQ), không chạy trên loop hay threadpool
- [ ] Không có coroutine thiếu await; `BackgroundTasks` chỉ cho việc ngắn, kiểu fire-and-forget

### CSDL

- [ ] Một session theo request qua dependency; không có session cấp module dùng chung
- [ ] Quan hệ truy cập trong vòng lặp được eager-load (`selectinload`/`joinedload`)
- [ ] Join/gom nhóm làm trong SQL, không lặp trong Python
- [ ] Endpoint danh sách có phân trang với `limit` có giới hạn trên

### Bảo mật

- [ ] Dependency xác thực có kèm kiểm tra **phân quyền** rõ ràng (sở hữu/vai trò)
- [ ] Mọi SQL tham số hóa; không nội suy dữ liệu người dùng bằng f-string
- [ ] CORS không kết hợp `allow_origins=["*"]` với `allow_credentials=True`
- [ ] Secret lấy từ config/biến môi trường; response lỗi không lộ thông tin nội bộ

### Test

- [ ] Lỗi nghi ngờ được tái hiện bằng test fail (`TestClient`/`AsyncClient`) trước khi khẳng định
- [ ] Dùng `dependency_overrides` thay vì patch phần bên trong; reset override giữa các test
- [ ] Đường thất bại được phủ (401/403/404/422), không chỉ happy path
- [ ] Mock response bên ngoài đầy đủ, không mock một phần
- [ ] Test mới chứng minh được là có thể fail (tái hiện rồi sửa), không xanh từ đầu

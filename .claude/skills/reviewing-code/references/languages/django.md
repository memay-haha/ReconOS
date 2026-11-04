# Django / DRF

Dùng khi review code Django hoặc Django REST Framework: bảo mật, N+1, anti-pattern của Serializer, ViewSet, async view và cấu hình production. Bẫy chung của Python: [python.md](python.md).

## Bảo mật

### Chống XSS

Template engine của Django tự escape theo mặc định. Điểm cần soi: chỗ dùng `mark_safe`, `autoescape off`, `format_html`. XSS trên nhiều framework (React/Vue/Angular/Svelte) và cấu hình CSP: [xss.md](../xss.md).

### Chống CSRF

```python
from django.views.decorators.csrf import csrf_exempt

# ❌ Tắt bảo vệ CSRF
@csrf_exempt
def process_payment(request):
    # trang độc hại nào cũng gửi form tới đây được
    amount = request.POST["amount"]
    charge(amount)

# ✅ Giữ bảo vệ CSRF mặc định
# settings.py: bảo đảm CSRF middleware đang bật
MIDDLEWARE = [
    # ...
    "django.middleware.csrf.CsrfViewMiddleware",
    # ...
]

# ✅ API dùng token authentication thay cho CSRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ],
}

# ✅ Request AJAX từ frontend gửi kèm CSRF token
# JavaScript: fetch("/api/endpoint/", {
#   headers: {"X-CSRFToken": document.querySelector("[name=csrfmiddlewaretoken]").value}
# })
```

### Cấu hình cookie an toàn

```python
# settings.py

# ❌ Cookie không an toàn
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_HTTPONLY = False

# ✅ Cookie an toàn cho production
SESSION_COOKIE_SECURE = True     # chỉ gửi qua HTTPS
SESSION_COOKIE_HTTPONLY = True   # JavaScript không đọc được
SESSION_COOKIE_SAMESITE = "Lax"  # chống CSRF
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
```

### Chống SQL injection

Django ORM tự tham số hóa truy vấn. Điểm cần soi: nối chuỗi trong `raw()`, `extra()`, `RawSQL`, `connection.cursor()`. SQL injection trên nhiều ngôn ngữ và cách dùng ORM không an toàn: [sql-injection.md](../sql-injection.md).

```python
# ❌ Nối chuỗi vào raw SQL
User.objects.raw(f"SELECT * FROM auth_user WHERE username = '{name}'")

# ✅ Truyền tham số
User.objects.raw("SELECT * FROM auth_user WHERE username = %s", [name])
```

### Upload file an toàn

```python
# settings.py

# ❌ Cấu hình upload không an toàn
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440  # 2,5 MB, chấp nhận được
MEDIA_ROOT = "/var/www/uploads"         # nằm trong web root
ALLOWED_UPLOAD_TYPES = None             # không giới hạn loại file

# ✅ Giới hạn kích thước và vị trí lưu
DATA_UPLOAD_MAX_MEMORY_SIZE = 10485760  # 10 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440   # 2,5 MB giữ trong bộ nhớ
MEDIA_ROOT = "/srv/media/"              # ngoài web root

# ✅ Kiểm tra loại file
import mimetypes
from pathlib import Path

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}

def validate_upload(file):
    ext = Path(file.name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"File type {ext} is not allowed.")
    mime, _ = mimetypes.guess_type(file.name)
    if mime not in {"image/jpeg", "image/png", "application/pdf"}:
        raise ValidationError("Invalid MIME type.")
```

## Tối ưu N+1

Nguyên lý chung và cách xử lý trên nhiều ngôn ngữ: [n-plus-one.md](../n-plus-one.md).

### select_related (ForeignKey / OneToOne)

```python
# ❌ N+1: mỗi cuốn sách truy vấn nhà xuất bản một lần
books = Book.objects.all()
for book in books:
    print(book.publisher.name)  # thêm N truy vấn

# ✅ select_related: một truy vấn JOIN
books = Book.objects.select_related("publisher")
for book in books:
    print(book.publisher.name)  # không thêm truy vấn

# ✅ Quan hệ nhiều tầng
books = Book.objects.select_related("publisher", "publisher__country")

# ✅ Chỉ lấy trường cần dùng
books = Book.objects.select_related("publisher").only(
    "title", "publisher__name"
)
```

### prefetch_related (M2M / ForeignKey ngược)

```python
# ❌ N+1: mỗi tác giả truy vấn sách một lần
authors = Author.objects.all()
for author in authors:
    print(author.books.all())  # thêm N truy vấn

# ✅ prefetch_related: hai truy vấn, ghép trong Python
authors = Author.objects.prefetch_related("books")
for author in authors:
    print(list(author.books.all()))  # không thêm truy vấn

# ✅ Prefetch lồng
authors = Author.objects.prefetch_related(
    "books",
    "books__publisher",
)

# ✅ Kiểm soát prefetch bằng object Prefetch
from django.db.models import Prefetch

authors = Author.objects.prefetch_related(
    Prefetch(
        "books",
        queryset=Book.objects.filter(published=True).only("title", "author_id"),
        to_attr="published_books",
    )
)
for author in authors:
    print(author.published_books)  # đã lọc, nằm trong to_attr
```

### Dùng sai cache của QuerySet

```python
# ❌ count() rồi duyệt: hai truy vấn
qs = Book.objects.all()
count = qs.count()              # truy vấn 1: SELECT COUNT(*), không nạp cache
titles = [b.title for b in qs]  # truy vấn 2: SELECT *, đánh giá lại

# ✅ Cần cả object và số lượng: dùng len() để đánh giá một lần rồi dùng lại cache
qs = Book.objects.all()
count = len(qs)                 # truy vấn 1: SELECT *, nạp và cache toàn bộ
titles = [b.title for b in qs]  # dùng cache, không truy vấn mới

# ✅ Cần duyệt nhiều lần: chuyển sang list trước
books = list(Book.objects.all())  # một truy vấn
count = len(books)
titles = [b.title for b in books]
```

### Slice và index không nạp cache

```python
# ❌ Index lặp lại trên QuerySet chưa đánh giá: lần nào cũng truy vấn
qs = Book.objects.all()
qs[0]   # truy vấn 1: SELECT ... LIMIT 1
qs[0]   # truy vấn 2: slice/index không nạp cache

# ✅ Đánh giá toàn bộ trước, sau đó index đọc từ cache
qs = Book.objects.all()
list(qs)    # SELECT *: đánh giá và cache mọi dòng
qs[0]       # đọc cache, không truy vấn
qs[5]       # đọc cache, không truy vấn

# ✅ Chỉ cần N dòng đầu: slice một lần rồi chuyển sang list
books = list(Book.objects.all()[:10])  # một truy vấn: SELECT ... LIMIT 10
first = books[0]
rest = books[1:]   # đã là list Python, không truy vấn
```

### len() và count()

```python
# ❌ len() nạp mọi object vào bộ nhớ
total = len(Book.objects.all())  # SELECT * FROM book: nạp cả bảng

# ✅ count() đếm ở phía CSDL
total = Book.objects.count()  # SELECT COUNT(*)

# ✅ Khi đã cần kết quả QuerySet thì mới dùng len
books = list(Book.objects.filter(published=True))
total = len(books)  # đã nằm trong bộ nhớ, không truy vấn thêm
```

### if qs và qs.exists()

```python
# ❌ if qs nạp mọi bản ghi
qs = Book.objects.filter(author_id=author_id)
if qs:  # SELECT * FROM book WHERE ...: nạp toàn bộ
    return qs[0]

# ✅ exists() chỉ kiểm tra có bản ghi hay không
if Book.objects.filter(author_id=author_id).exists():
    return Book.objects.filter(author_id=author_id).first()

# ✅ Hoặc gọi first() rồi kiểm tra None
book = Book.objects.filter(author_id=author_id).first()
if book is not None:
    return book
```

## Anti-pattern của Serializer

### Loại trường nhạy cảm

```python
from rest_framework import serializers

# ❌ __all__ lộ mọi trường, kể cả dữ liệu nhạy cảm
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = "__all__"  # lộ hash mật khẩu, is_superuser...

# ✅ Liệt kê rõ trường được phép
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]

# ✅ Dùng exclude cũng phải cẩn thận
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        exclude = ["internal_notes", "admin_flags"]

# ✅ Trường mật khẩu dùng write_only
class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        user = User(**validated_data)
        user.set_password(validated_data["password"])
        user.save()
        return user
```

### Thiếu validation

```python
from rest_framework import serializers

# ❌ Không validate, tin mọi dữ liệu vào
class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ["quantity", "price", "discount"]

# ✅ Validate từng trường
class OrderSerializer(serializers.ModelSerializer):
    quantity = serializers.IntegerField(min_value=1, max_value=100)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    discount = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=1, required=False
    )

    class Meta:
        model = Order
        fields = ["quantity", "price", "discount"]

# ✅ Validate cấp object
class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ["quantity", "price", "discount"]

    def validate(self, attrs):
        if attrs.get("discount", 0) > 0.5 and attrs.get("quantity", 0) < 10:
            raise serializers.ValidationError(
                "Bulk discount requires minimum 10 items."
            )
        return attrs

# ✅ Method validate riêng cho trường
class BookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ["start_date", "end_date", "room"]

    def validate_start_date(self, value):
        if value < date.today():
            raise serializers.ValidationError("Start date cannot be in the past.")
        return value

    def validate(self, attrs):
        if attrs["end_date"] <= attrs["start_date"]:
            raise serializers.ValidationError("End date must be after start date.")
        return attrs
```

### Ghi lồng nhau

```python
from rest_framework import serializers

# ❌ Serializer lồng nhưng không cài create/update
class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name"]

class ArticleSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True)  # ghi lồng sẽ lỗi

    class Meta:
        model = Article
        fields = ["id", "title", "tags"]

# ✅ Cách 1: lồng chỉ đọc, ghi qua PrimaryKeyRelatedField
class ArticleSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        source="tags",
    )

    class Meta:
        model = Article
        fields = ["id", "title", "tags", "tag_ids"]

# ✅ Cách 2: cài create()/update() xử lý phần lồng
class ArticleSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True)

    class Meta:
        model = Article
        fields = ["id", "title", "tags"]

    def create(self, validated_data):
        tags_data = validated_data.pop("tags")
        article = Article.objects.create(**validated_data)
        for tag_data in tags_data:
            tag, _ = Tag.objects.get_or_create(**tag_data)
            article.tags.add(tag)
        return article

    def update(self, instance, validated_data):
        tags_data = validated_data.pop("tags", None)
        instance = super().update(instance, validated_data)
        if tags_data is not None:
            instance.tags.clear()
            for tag_data in tags_data:
                tag, _ = Tag.objects.get_or_create(**tag_data)
                instance.tags.add(tag)
        return instance
```

### Thiếu read_only_fields

```python
from rest_framework import serializers

# ❌ Trường tính toán và trường tự sinh bị người dùng ghi đè được
class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ["id", "body", "author", "created_at", "updated_at"]
        # client sửa được created_at, updated_at, author

# ✅ Đánh dấu trường chỉ đọc
class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ["id", "body", "author", "created_at", "updated_at"]
        read_only_fields = ["author", "created_at", "updated_at"]

# ✅ Gán trường chỉ đọc trong view (ví dụ người dùng hiện tại)
class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
```

## ViewSet

### Chọn đúng class cơ sở

```python
from rest_framework import viewsets

# ❌ ModelViewSet có đủ CRUD trong khi chỉ cần đọc
class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    # lộ destroy, update, create: tag không nên bị sửa tùy ý

# ✅ Chỉ đọc: dùng ReadOnlyModelViewSet
class TagViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    # chỉ có list và retrieve

# ✅ Cần tổ hợp thao tác riêng: dùng Mixin
from rest_framework import mixins

class TagViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    generics.GenericAPIView,
):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
```

### Giới hạn dữ liệu theo người dùng

```python
from rest_framework import viewsets

# ❌ Người dùng nào cũng thấy mọi dữ liệu
class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer

# ✅ get_queryset chỉ trả dữ liệu của người dùng hiện tại
class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer

    def get_queryset(self):
        return Document.objects.filter(
            owner=self.request.user
        ).select_related("owner")

# ✅ Quản trị viên thấy hết, người dùng thường thấy của mình
class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer

    def get_queryset(self):
        qs = Document.objects.select_related("owner")
        if self.request.user.is_staff:
            return qs
        return qs.filter(owner=self.request.user)

# ✅ perform_create tự gắn người dùng hiện tại
class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer

    def get_queryset(self):
        return Document.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
```

### Phân quyền

```python
from rest_framework import permissions, viewsets

# ❌ Không phân quyền
class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer

# ✅ Phân quyền cấp class
class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    permission_classes = [permissions.IsAuthenticated]

# ✅ Phân quyền theo action
class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        if self.action == "create":
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

# ✅ Quyền cấp object tự định nghĩa
class IsOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.owner == request.user
```

### Phân trang và throttling

```python
# settings.py

# ❌ Không cấu hình phân trang và throttling
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
}

# ✅ Phân trang và throttling toàn cục
REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
    },
}

# ✅ Paginator tự định nghĩa
from rest_framework.pagination import PageNumberPagination

class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    pagination_class = StandardPagination
```

## Async view

### Dùng ORM đồng bộ trong async view

```python
from asgiref.sync import sync_to_async
from django.http import JsonResponse

# ❌ Gọi thẳng ORM đồng bộ trong async view: chặn event loop
async def user_list(request):
    users = User.objects.all()  # ORM đồng bộ trong ngữ cảnh bất đồng bộ!
    data = [{"id": u.id, "name": u.username} for u in users]
    return JsonResponse(data, safe=False)

# ✅ Dùng async ORM (Django 4.1+)
async def user_list(request):
    users = User.objects.all()
    data = []
    async for user in users:  # duyệt bất đồng bộ
        data.append({"id": user.id, "name": user.username})
    return JsonResponse(data, safe=False)

# ✅ Dùng aget / afilter / acreate
async def user_detail(request, pk):
    user = await User.objects.aget(pk=pk)
    return JsonResponse({"id": user.id, "name": user.username})

# ✅ Truy vấn phức tạp dùng sync_to_async
@sync_to_async
def get_user_with_profile(pk):
    return User.objects.select_related("profile").get(pk=pk)

async def user_profile(request, pk):
    user = await get_user_with_profile(pk)
    return JsonResponse({
        "id": user.id,
        "name": user.username,
        "bio": user.profile.bio,
    })
```

### Thiếu await

```python
from django.http import JsonResponse

# ❌ Quên await: coroutine không chạy, nhận về object coroutine thay vì dữ liệu
async def user_detail(request, pk):
    user = User.objects.aget(pk=pk)  # thiếu await!
    # user là object coroutine, không phải instance User
    return JsonResponse({"name": user.username})  # RuntimeError

# ✅ Luôn await lời gọi async ORM
async def user_detail(request, pk):
    user = await User.objects.aget(pk=pk)
    return JsonResponse({"name": user.username})

# ✅ Dùng bản async của get_object_or_404
from django.shortcuts import aget_object_or_404

async def user_detail(request, pk):
    user = await aget_object_or_404(User, pk=pk)
    return JsonResponse({"name": user.username})
```

### Transaction trong async view

```python
from django.db import transaction
from asgiref.sync import sync_to_async

# ❌ transaction.atomic() là đồng bộ, không dùng thẳng trong code bất đồng bộ được
async def create_order(request):
    async with transaction.atomic():  # Lỗi! Không tương thích bất đồng bộ
        order = await Order.objects.acreate(total=100)
        await OrderItem.objects.acreate(order=order, product_id=1)
    return JsonResponse({"order_id": order.id})

# ✅ Bọc khối transaction bằng sync_to_async
@sync_to_async
def _create_order_with_items():
    with transaction.atomic():
        order = Order.objects.create(total=100)
        OrderItem.objects.create(order=order, product_id=1)
        return order.id

async def create_order(request):
    order_id = await _create_order_with_items()
    return JsonResponse({"order_id": order_id})

# ✅ Gói nhiều thao tác vào một sync_to_async
@sync_to_async
def _bulk_create_products(items):
    with transaction.atomic():
        products = Product.objects.bulk_create([Product(**i) for i in items])
        return [p.id for p in products]

async def import_products(request):
    ids = await _bulk_create_products(request.data)
    return JsonResponse({"ids": ids})
```

### Middleware đồng bộ làm chậm async

```python
# ❌ Middleware đồng bộ hạ async view xuống chạy đồng bộ
class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):  # đồng bộ, chặn async view
        start = time.time()
        response = self.get_response(request)
        elapsed = time.time() - start
        response["X-Elapsed"] = str(elapsed)
        return response

# ✅ Middleware hỗ trợ bất đồng bộ: async def __call__, đánh dấu instance trong __init__
import time
from asgiref.sync import iscoroutinefunction, markcoroutinefunction

class TimingMiddleware:
    async_capable = True
    sync_capable = False

    def __init__(self, get_response):
        self.get_response = get_response
        # get_response là hàm coroutine thì đánh dấu instance, Django mới await instance
        if iscoroutinefunction(self.get_response):
            markcoroutinefunction(self)

    async def __call__(self, request):
        start = time.time()
        response = await self.get_response(request)
        elapsed = time.time() - start
        response["X-Elapsed"] = str(elapsed)
        return response

# ✅ Cần hỗ trợ cả đồng bộ và bất đồng bộ: dùng hàm factory kèm decorator có sẵn
from django.utils.decorators import sync_and_async_middleware
```

### Duyệt bằng async for

```python
from django.http import JsonResponse

# ❌ Duyệt đồng bộ QuerySet lớn trong async view: chặn event loop
async def export_users(request):
    users = User.objects.all()
    data = []
    for user in users:  # duyệt đồng bộ
        data.append({"id": user.id, "name": user.username})
    return JsonResponse(data, safe=False)

# ✅ Duyệt bất đồng bộ bằng async for
async def export_users(request):
    data = []
    async for user in User.objects.all():
        data.append({"id": user.id, "name": user.username})
    return JsonResponse(data, safe=False)

# ✅ Dữ liệu lớn: aiterator() chia khối
async def export_large_dataset(request):
    data = []
    async for user in User.objects.all().aiterator(chunk_size=500):
        data.append({"id": user.id, "name": user.username})
    return JsonResponse(data, safe=False)

# ✅ Dùng values() để giảm bộ nhớ
async def lightweight_export(request):
    data = []
    async for row in User.objects.values("id", "username"):
        data.append(row)
    return JsonResponse(data, safe=False)
```

## Middleware và cấu hình

### Cấu hình bảo mật production

```python
# settings.py: cấu hình bắt buộc cho production

# ❌ Giá trị mặc định khi phát triển không được lọt lên production
DEBUG = True
SECRET_KEY = "django-insecure-..."
ALLOWED_HOSTS = ["*"]
SECURE_SSL_REDIRECT = False

# ✅ Cấu hình production

# --- Cơ bản ---
DEBUG = False
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]  # đọc từ biến môi trường
ALLOWED_HOSTS = ["example.com", "www.example.com"]

# --- HTTPS ---
SECURE_SSL_REDIRECT = True          # chuyển HTTP sang HTTPS
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# --- Header bảo mật ---
SECURE_HSTS_SECONDS = 31536000       # HSTS 1 năm
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True   # X-Content-Type-Options: nosniff
X_FRAME_OPTIONS = "DENY"             # chống clickjacking
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# --- Kiểm tra mật khẩu ---
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
]

# --- Session ---
SESSION_COOKIE_AGE = 3600 * 8  # 8 giờ
SESSION_SAVE_EVERY_REQUEST = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
```

### Kết nối CSDL an toàn

```python
# settings.py

# ❌ Mật khẩu bản rõ trong code
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "mydb",
        "USER": "admin",
        "PASSWORD": "hunter2",  # không hardcode mật khẩu
        "HOST": "localhost",
        "PORT": "5432",
    }
}

# ✅ Đọc từ biến môi trường
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "mydb"),
        "USER": os.environ.get("DB_USER", "mydb_user"),
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "OPTIONS": {
            "sslmode": "require",  # bắt buộc SSL
        },
        "CONN_MAX_AGE": 60,  # kết nối bền
    }
}
```

### Cấu hình CORS

```python
# settings.py (dùng django-cors-headers)

# ❌ Cho phép mọi origin
CORS_ALLOW_ALL_ORIGINS = True

# ✅ Giới hạn origin được phép
CORS_ALLOWED_ORIGINS = [
    "https://example.com",
    "https://app.example.com",
]

# ✅ CORS cho production
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "").split(",")
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
CORS_ALLOW_HEADERS = [
    "authorization",
    "content-type",
    "x-csrftoken",
]
```

### Cấu hình log

```python
# settings.py

# ❌ Cấu hình log mặc định (hoặc không cấu hình)
LOGGING = {}

# ✅ Cấu hình log production
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "/var/log/django/app.log",
            "maxBytes": 10 * 1024 * 1024,  # 10 MB
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["file"],
            "level": "INFO",
            "propagate": False,
        },
        "myapp": {
            "handlers": ["file"],
            "level": "DEBUG" if DEBUG else "INFO",
            "propagate": False,
        },
    },
}
```

## Checklist

### Bảo mật

- [ ] Không dùng `mark_safe` để render dữ liệu người dùng chưa escape
- [ ] CSRF middleware đang bật, không có `@csrf_exempt`
- [ ] Cookie session và CSRF đặt `Secure`, `HttpOnly`, `SameSite`
- [ ] Truy vấn SQL tham số hóa (ORM hoặc `raw()` có tham số), không nối chuỗi
- [ ] Upload file có giới hạn loại và kích thước
- [ ] `SECRET_KEY` đọc từ biến môi trường, không nằm trong repo
- [ ] `DEBUG = False` trên production

### HTTPS và header bảo mật

- [ ] `SECURE_SSL_REDIRECT = True`
- [ ] Đã đặt `SECURE_HSTS_SECONDS` (≥ 31536000)
- [ ] `SECURE_CONTENT_TYPE_NOSNIFF = True`
- [ ] `X_FRAME_OPTIONS` là `DENY` hoặc `SAMEORIGIN`
- [ ] `ALLOWED_HOSTS` không chứa `"*"`
- [ ] Kết nối CSDL dùng SSL

### N+1

- [ ] Quan hệ ForeignKey dùng `select_related`
- [ ] Quan hệ M2M / ngược dùng `prefetch_related`
- [ ] Không truy cập object liên quan trong vòng lặp
- [ ] Đếm bằng `count()` thay cho `len(queryset)`
- [ ] Kiểm tra tồn tại bằng `exists()` thay cho `if queryset`
- [ ] Tập dữ liệu lớn dùng `only()` / `defer()` hoặc `values()` để bớt trường
- [ ] QuerySet đã slice không bị duyệt lặp lại

### Serializer

- [ ] Model nhạy cảm không dùng `fields = "__all__"`
- [ ] Trường mật khẩu đặt `write_only=True`
- [ ] Có validate cấp trường và cấp object
- [ ] Ghi lồng có cài `create()` / `update()` hoặc dùng `read_only=True`
- [ ] Trường tính toán và trường tự sinh nằm trong `read_only_fields`
- [ ] Serializer không chứa trường không được phép sửa

### ViewSet

- [ ] Chỉ đọc thì dùng `ReadOnlyModelViewSet`
- [ ] `get_queryset()` giới hạn dữ liệu theo người dùng hiện tại
- [ ] Đã đặt `permission_classes`
- [ ] Khi tạo, dùng `perform_create()` tự gán owner/author
- [ ] Có phân trang (toàn cục hoặc theo ViewSet)
- [ ] Có throttling

### Async view

- [ ] Async view không gọi thẳng ORM đồng bộ (dùng `aget`/`afilter`/`sync_to_async`)
- [ ] Mọi lời gọi bất đồng bộ đều có `await`
- [ ] `transaction.atomic()` bọc trong `sync_to_async`
- [ ] Middleware đặt `async_capable = True` để không bị hạ xuống đồng bộ
- [ ] QuerySet lớn dùng `async for` kèm `aiterator()`

### Cấu hình production

- [ ] Dùng `CORS_ALLOWED_ORIGINS`, không dùng `CORS_ALLOW_ALL_ORIGINS = True`
- [ ] Đã cấu hình kiểm tra mật khẩu (độ dài tối thiểu, mật khẩu phổ biến)
- [ ] Thời gian hết hạn session hợp lý (`SESSION_COOKIE_AGE`)
- [ ] Log dùng RotatingFileHandler, không xuất ra stdout trên production
- [ ] Kết nối CSDL dùng `CONN_MAX_AGE` để giữ kết nối bền

# Kotlin / Android

Dùng khi review code Kotlin và ứng dụng Android. Phạm vi: scope và hủy coroutine, bẫy của Flow, recomposition trong Compose, null safety, rò rỉ bộ nhớ, phân tầng kiến trúc, mô hình hóa trạng thái bằng sealed class.

## Coroutine: scope và hủy

Mẫu đồng thời chung và ví dụ ở ngôn ngữ khác: xem [concurrency.md](../concurrency.md).

### Tránh GlobalScope

```kotlin
// ❌ GlobalScope không kiểm soát vòng đời, coroutine vẫn chạy sau khi Activity/Fragment bị hủy
GlobalScope.launch {
    val data = api.fetchData()
    binding.textView.text = data.title // Crash: view đã bị hủy
}

// ✅ Dùng viewModelScope, tự hủy khi ViewModel bị xóa
class MyViewModel(private val repo: Repository) : ViewModel() {
    fun loadData() {
        viewModelScope.launch {
            val data = repo.fetchData()
            _uiState.value = UiState.Success(data)
        }
    }
}

// ✅ Trong Activity/Fragment dùng lifecycleScope
class MyActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            val data = repo.fetchData()
            binding.textView.text = data.title
        }
    }
}
```

### Không nuốt CancellationException

```kotlin
// ❌ Bắt mọi exception làm mất tín hiệu hủy
viewModelScope.launch {
    try {
        repo.fetchData()
    } catch (e: Exception) {
        // CancellationException bị nuốt, coroutine không hủy được
        showError(e)
    }
}

// ✅ Ném lại CancellationException
viewModelScope.launch {
    try {
        repo.fetchData()
    } catch (e: CancellationException) {
        throw e // bắt buộc ném lại
    } catch (e: Exception) {
        showError(e)
    }
}

// ✅ Hoặc catch kèm ensureActive
viewModelScope.launch {
    try {
        repo.fetchData()
    } catch (e: Exception) {
        ensureActive() // ném lại nếu đã bị hủy
        showError(e)
    }
}
```

### Tác vụ nặng CPU phải kiểm tra hủy

```kotlin
// ❌ Tính toán nặng CPU không phản hồi lệnh hủy, coroutine đã hủy vẫn chạy hết
viewModelScope.launch(Dispatchers.Default) {
    for (item in largeList) {
        heavyComputation(item)
    }
}

// ✅ Định kỳ kiểm tra isActive hoặc gọi ensureActive
viewModelScope.launch(Dispatchers.Default) {
    for (item in largeList) {
        ensureActive() // ném CancellationException nếu đã bị hủy
        heavyComputation(item)
    }
}

// ✅ Hoặc dùng yield để nhường quyền chạy
viewModelScope.launch(Dispatchers.Default) {
    for (item in largeList) {
        yield() // kiểm tra hủy + nhường cho coroutine khác
        heavyComputation(item)
    }
}
```

### Thao tác chặn dùng runInterruptible

```kotlin
// ❌ Gọi I/O chặn trực tiếp trong coroutine, chặn thread của pool
viewModelScope.launch(Dispatchers.IO) {
    val result = blockingLibraryCall() // chặn thread IO
}

// ✅ Bọc lệnh chặn bằng runInterruptible, hỗ trợ ngắt khi hủy
viewModelScope.launch(Dispatchers.IO) {
    val result = runInterruptible {
        blockingLibraryCall() // bị ngắt khi hủy
    }
}
```

### Chọn đúng dispatcher

```kotlin
// ❌ Tác vụ nặng CPU dùng dispatcher IO (pool quá lớn, lãng phí tài nguyên)
viewModelScope.launch(Dispatchers.IO) {
    val bitmap = decodeImage(byteArray) // việc CPU chạy trên pool IO
}

// ✅ Nặng CPU dùng Default, I/O dùng IO
viewModelScope.launch(Dispatchers.Default) {
    val bitmap = decodeImage(byteArray) // việc CPU chạy trên pool Default
}

// ❌ Thao tác I/O dùng dispatcher Default (pool quá nhỏ, dễ đói)
viewModelScope.launch(Dispatchers.Default) {
    val response = okHttpClient.newCall(request).execute() // I/O trên pool Default
}

// ✅ I/O dùng dispatcher IO
viewModelScope.launch(Dispatchers.IO) {
    val response = okHttpClient.newCall(request).execute()
}
```

### launch và async

```kotlin
// ❌ Dùng async chỉ để fire-and-forget, không cần giá trị trả về
viewModelScope.launch {
    async { analytics.trackEvent("click") } // thừa
}

// ✅ Không cần giá trị trả về thì dùng launch
viewModelScope.launch {
    launch { analytics.trackEvent("click") }
}

// ✅ Cần giá trị trả về và có thể chạy song song thì dùng async
viewModelScope.launch {
    val deferredA = async { api.fetchA() }
    val deferredB = async { api.fetchB() }
    val result = combine(deferredA.await(), deferredB.await())
}
```

### Không dùng Job() phá quan hệ cha con

```kotlin
// ❌ Job() cắt đường truyền lệnh hủy từ coroutine cha
viewModelScope.launch {
    launch(Job()) { // tách khỏi scope cha
        importantWork() // không bị hủy khi viewModelScope hủy
    }
}

// ✅ Giữ quan hệ cha con mặc định
viewModelScope.launch {
    launch { // con của viewModelScope
        importantWork() // bị hủy khi viewModelScope hủy
    }
}

// ✅ Nếu thật sự cần vòng đời độc lập: quản lý rõ ràng và ghi lý do
class MyManager(private val scope: CoroutineScope) {
    // Vòng đời độc lập, quản lý bằng MyManager.shutdown()
    private val managerJob = Job(scope.coroutineContext[Job])
    private val managerScope = scope + managerJob + Dispatchers.IO

    fun shutdown() {
        managerJob.cancel()
    }
}
```

### Dùng NonCancellable đúng cách

```kotlin
// ❌ Bọc cả coroutine trong withContext(NonCancellable), không hủy được
viewModelScope.launch {
    withContext(NonCancellable) { // cả khối không hủy được
        val data = repo.fetchData() // không hủy được
        db.saveData(data) // không hủy được
        analytics.track("saved")
    }
}

// ✅ NonCancellable chỉ dùng cho thao tác dọn dẹp
viewModelScope.launch {
    try {
        val data = repo.fetchData()
        db.saveData(data)
    } catch (e: CancellationException) {
        throw e
    } finally {
        withContext(NonCancellable) {
            db.cleanup() // chỉ phần dọn dẹp không hủy được
        }
    }
}
```

## Bẫy của Flow

### Nhầm cold flow và hot flow

```kotlin
// ❌ Mỗi lần collect lại chạy lại khối flow {} (hiểu sai tính chất cold flow)
val userFlow = flow {
    emit(api.fetchUser()) // mỗi collector gọi một lần
}

// Hai collector = hai request mạng
lifecycleScope.launch { userFlow.collect { } }
lifecycleScope.launch { userFlow.collect { } }

// ✅ Dữ liệu dùng chung dùng StateFlow/SharedFlow (hot flow)
class MyViewModel(private val repo: Repository) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            _uiState.value = UiState.Success(repo.fetchUser())
        }
    }
}
// Nhiều collector dùng chung một StateFlow
```

### Không đổi context trong flow {}

```kotlin
// ❌ Dùng withContext trong flow builder, vi phạm ràng buộc
val dataFlow = flow {
    withContext(Dispatchers.IO) { // IllegalStateException
        emit(api.fetchData())
    }
}

// ✅ Dùng toán tử flowOn để đổi context phía upstream
val dataFlow = flow {
    emit(api.fetchData()) // chạy trên IO nhờ flowOn
}.flowOn(Dispatchers.IO)

// ✅ Hoặc dùng channelFlow / callbackFlow khi cần đổi context
val dataFlow = channelFlow {
    withContext(Dispatchers.IO) {
        send(api.fetchData()) // send() an toàn trong channelFlow
    }
}
```

### collect phải nhận biết vòng đời

```kotlin
// ❌ Collect trong Activity/Fragment không nhận biết vòng đời
lifecycleScope.launch {
    viewModel.uiState.collect { state ->
        binding.textView.text = state.title // crash nếu view đã bị hủy
    }
}

// ✅ Trong Fragment dùng viewLifecycleOwner.lifecycleScope + repeatOnLifecycle
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { state ->
            binding.textView.text = state.title
        }
    }
}

// ✅ Trong Compose dùng collectAsStateWithLifecycle
@Composable
fun MyScreen(viewModel: MyViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    // ...
}
```

### Exception transparency: dùng toán tử catch

```kotlin
// ❌ try-catch quanh collect để xử lý exception upstream
viewModelScope.launch {
    try {
        dataFlow.collect { data ->
            processData(data)
        }
    } catch (e: Exception) {
        // Bắt luôn exception của processData, không chỉ của upstream
        showError(e)
    }
}

// ✅ Dùng toán tử catch để giữ exception transparency
viewModelScope.launch {
    dataFlow
        .catch { e -> showError(e) } // chỉ bắt exception upstream
        .collect { data ->
            processData(data) // exception ở đây lan truyền bình thường
        }
}
```

### Chọn StateFlow hay SharedFlow

```kotlin
// ❌ Dùng SharedFlow giả làm StateFlow, mất ngữ nghĩa "giá trị mới nhất"
private val _state = MutableSharedFlow<UiState>()
val state: SharedFlow<UiState> = _state

// ✅ Trạng thái UI dùng StateFlow: luôn có giá trị, subscriber mới nhận ngay giá trị mới nhất
class MyViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()
}

// ✅ Sự kiện (thông báo một lần) dùng SharedFlow + replay(0)
class MyViewModel : ViewModel() {
    private val _navigationEvent = MutableSharedFlow<NavTarget>(extraBufferCapacity = 1)
    val navigationEvent: SharedFlow<NavTarget> = _navigationEvent.asSharedFlow()

    fun navigate(target: NavTarget) {
        _navigationEvent.tryEmit(target)
    }
}

// ✅ Channel cho sự kiện một lần (phương án thay thế)
private val _navigationEvent = Channel<NavTarget>(Channel.BUFFERED)
val navigationEvent = _navigationEvent.receiveAsFlow()
```

## Recomposition trong Jetpack Compose

### Tham số không ổn định gây recompose thừa

```kotlin
// ❌ Dùng class không ổn định làm tham số, Compose không biết có thay đổi hay không
data class UserProfile(
    val name: String,
    val friends: List<String>, // không ổn định: List không phải @Stable
)

@Composable
fun ProfileCard(profile: UserProfile) { // recompose cả khi profile không đổi
    Text(profile.name)
}

// ✅ Đánh dấu @Immutable hoặc dùng kiểu collection ổn định
@Immutable
data class UserProfile(
    val name: String,
    val friends: ImmutableList<String>, // kotlinx.collections.immutable
)

// ✅ Hoặc tách thuộc tính không ổn định thành tham số riêng
@Composable
fun ProfileCard(
    name: String, // ổn định: String là kiểu cơ bản
    friendCount: Int, // ổn định: Int là kiểu cơ bản
) {
    Text(name)
    Text("$friendCount friends")
}
```

### Lambda không ổn định và memoization

```kotlin
// ❌ Mỗi lần recompose tạo lambda mới, làm component con recompose không cần thiết
@Composable
fun MyScreen(viewModel: MyViewModel) {
    LazyColumn {
        items(items, key = { it.id }) { item ->
            ItemRow(
                item = item,
                onClick = { viewModel.handleClick(item.id) } // lambda mới mỗi lần recompose
            )
        }
    }
}

// ✅ Bọc lambda bằng remember, hoặc để ViewModel cung cấp callback ổn định
@Composable
fun MyScreen(viewModel: MyViewModel) {
    LazyColumn {
        items(items, key = { it.id }) { item ->
            ItemRow(
                item = item,
                onClick = remember(item.id) { { viewModel.handleClick(item.id) } }
            )
        }
    }
}
```

### Dùng derivedStateOf để tránh recompose tần suất cao

```kotlin
// ❌ Mỗi lần cuộn đều recompose cả component
@Composable
fun ScrollToTopButton(lazyListState: LazyListState) {
    val showButton = lazyListState.firstVisibleItemIndex > 0 // recompose mỗi lần cuộn
    if (showButton) {
        Button(onClick = { /* cuộn lên đầu */ }) {
            Text("Top")
        }
    }
}

// ✅ derivedStateOf chỉ kích hoạt recompose khi kết quả đổi
@Composable
fun ScrollToTopButton(lazyListState: LazyListState) {
    val showButton by remember {
        derivedStateOf { lazyListState.firstVisibleItemIndex > 0 }
    }
    if (showButton) {
        Button(onClick = { /* cuộn lên đầu */ }) {
            Text("Top")
        }
    }
}
```

### Không chạy side effect trong thân hàm Composable

```kotlin
// ❌ Gọi side effect trực tiếp trong thân Composable, chạy lại mỗi lần recompose
@Composable
fun MyScreen(userId: String, viewModel: MyViewModel) {
    viewModel.loadUser(userId) // gọi lại mỗi lần recompose
    val user by viewModel.user.collectAsStateWithLifecycle()
    Text(user?.name ?: "Loading...")
}

// ✅ LaunchedEffect chạy side effect khi key đổi
@Composable
fun MyScreen(userId: String, viewModel: MyViewModel) {
    LaunchedEffect(userId) {
        viewModel.loadUser(userId) // chỉ khi userId đổi
    }
    val user by viewModel.user.collectAsStateWithLifecycle()
    Text(user?.name ?: "Loading...")
}

// ✅ Khởi tạo một lần dùng remember { ... }
@Composable
fun MyScreen(viewModel: MyViewModel) {
    val initialData = remember { viewModel.getInitialData() }
}
```

### State hoisting

```kotlin
// ❌ Trạng thái và logic dính chặt trong Composable, không tái dùng, không test được
@Composable
fun ToggleButton() {
    var isChecked by remember { mutableStateOf(false) }
    Switch(
        checked = isChecked,
        onCheckedChange = { isChecked = it }
    )
}

// ✅ State hoisting: bên gọi kiểm soát trạng thái
@Composable
fun ToggleButton(
    isChecked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Switch(
        checked = isChecked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
    )
}

// ✅ Bên gọi giữ trạng thái
@Composable
fun ParentScreen() {
    var enabled by rememberSaveable { mutableStateOf(false) }
    ToggleButton(
        isChecked = enabled,
        onCheckedChange = { enabled = it },
    )
}
```

## Null safety

### Tránh non-null assertion !!

```kotlin
// ❌ Non-null assertion: null thì NPE ngay
val user = getUser()!!
val name = user.name!!

// ✅ Safe call + elvis
val name = getUser()?.name ?: "Unknown"

// ✅ requireNotNull kèm thông báo lỗi có nghĩa
val user = requireNotNull(getUser()) { "User must not be null at this point" }

// ✅ Trả về sớm
fun process(user: User?) {
    val nonNullUser = user ?: return
    nonNullUser.doSomething()
}
```

### lateinit, nullable và lazy

```kotlin
// ❌ lateinit cho giá trị có thể null (sai ngữ nghĩa)
lateinit var optionalConfig: Config // có thể không bao giờ được gán

// ✅ lateinit cho giá trị chắc chắn khởi tạo trước khi dùng
class MyActivity : AppCompatActivity() {
    lateinit var binding: ActivityMainBinding // gán trong onCreate

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
    }
}

// ✅ Chọn nullable hay lateinit theo thời điểm khởi tạo
// lateinit: vòng đời bảo đảm khởi tạo trước khi dùng
// nullable: không chắc có khởi tạo, cần kiểm tra null
// lazy: chắc chắn khởi tạo ở lần truy cập đầu

class MyViewModel(private val repo: Repository) : ViewModel() {
    // lazy: khởi tạo ở lần truy cập đầu, thread-safe
    val expensiveObject by lazy { ExpensiveObject(repo) }

    // nullable: có thể không bao giờ khởi tạo
    var cachedData: Data? = null
        private set
}
```

### Tương tác Java: rò rỉ platform type

```kotlin
// ❌ Java trả platform type (có thể null), Kotlin dùng như non-null
// Java:
// public User getUser() { return null; }
val name: String = javaService.getUser().name // NPE

// ✅ Nhận giá trị trả về từ Java bằng kiểu nullable
val user: User? = javaService.getUser()
val name = user?.name ?: "Unknown"

// ✅ Bọc API Java ở phía Kotlin để có kiểu an toàn
class SafeUserService(private val delegate: JavaUserService) {
    fun getUser(): User? = delegate.getUser() // nullable rõ ràng
}
```

## Rò rỉ bộ nhớ

### Không capture Context/View trong coroutine sống lâu

```kotlin
// ❌ Coroutine capture Context của Activity, Activity bị hủy vẫn không thu hồi được
class MyActivity : AppCompatActivity() {
    fun loadData() {
        // Rò rỉ Activity qua coroutine
        GlobalScope.launch {
            val data = repo.fetchData()
            // 'this' (Activity) bị capture
            binding.textView.text = data // Activity bị rò rỉ
        }
    }
}

// ✅ Dùng viewModelScope + nhận biết vòng đời
class MyViewModel(private val repo: Repository) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun loadData() {
        viewModelScope.launch {
            val data = repo.fetchData()
            _uiState.value = UiState.Success(data) // không tham chiếu Activity
        }
    }
}
```

### Hủy đăng ký listener

```kotlin
// ❌ Đăng ký listener nhưng không bao giờ hủy
class MyFragment : Fragment() {
    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) { }
        override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) { }
    }

    override fun onResume() {
        super.onResume()
        sensorManager.registerListener(sensorListener, sensor, SensorManager.SENSOR_DELAY_UI)
        // không bao giờ hủy đăng ký
    }
}

// ✅ Hủy đăng ký trong onPause/onDestroyView
override fun onResume() {
    super.onResume()
    sensorManager.registerListener(sensorListener, sensor, SensorManager.SENSOR_DELAY_UI)
}

override fun onPause() {
    super.onPause()
    sensorManager.unregisterListener(sensorListener)
}
```

### Hủy CoroutineScope tự tạo

```kotlin
// ❌ Tạo CoroutineScope nhưng không bao giờ hủy
class MyManager(private val scope: CoroutineScope) {
    private val job = SupervisorJob()
    private val managerScope = scope + job + Dispatchers.IO

    fun start() {
        managerScope.launch {
            while (isActive) {
                pollServer()
                delay(5000)
            }
        }
    }
    // Không bao giờ hủy, job sống mãi
}

// ✅ Có method tắt và hủy Job
class MyManager(private val scope: CoroutineScope) {
    private val job = SupervisorJob()
    private val managerScope = scope + job + Dispatchers.IO

    fun start() {
        managerScope.launch {
            while (isActive) {
                pollServer()
                delay(5000)
            }
        }
    }

    fun shutdown() {
        job.cancel()
    }
}

// ✅ Trong ViewModel dùng luôn viewModelScope có sẵn, không tự quản lý vòng đời
class MyViewModel : ViewModel() {
    private val scope = viewModelScope + Dispatchers.IO
    // Tự hủy khi ViewModel bị xóa
}
```

## Kiến trúc: ViewModel và Repository

### ViewModel không lộ trạng thái khả biến

```kotlin
// ❌ Lộ thẳng MutableStateFlow, bên ngoài sửa tùy ý
class MyViewModel : ViewModel() {
    val uiState = MutableStateFlow<UiState>(UiState.Loading) // khả biến

    fun load() {
        viewModelScope.launch {
            uiState.value = UiState.Success(repo.fetchData())
        }
    }
}

// ✅ Lộ interface bất biến, bên trong giữ bản khả biến
class MyViewModel(private val repo: Repository) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _uiState.value = UiState.Success(repo.fetchData())
        }
    }
}
```

### Đẩy logic nghiệp vụ xuống Repository

```kotlin
// ❌ ViewModel chứa xử lý dữ liệu và quy tắc nghiệp vụ
class UserViewModel(private val api: Api) : ViewModel() {
    private val _users = MutableStateFlow<List<User>>(emptyList())
    val users: StateFlow<List<User>> = _users.asStateFlow()

    fun loadUsers() {
        viewModelScope.launch {
            val raw = api.getUsers()
            val filtered = raw.filter { it.isActive }
            val sorted = filtered.sortedBy { it.name.lowercase() }
            val enriched = sorted.map { user ->
                user.copy(displayName = "${user.firstName} ${user.lastName}")
            }
            _users.value = enriched
        }
    }
}

// ✅ ViewModel chỉ quản lý trạng thái, logic nằm ở Repository
class UserRepository(private val api: Api) {
    suspend fun getActiveUsersSorted(): List<User> {
        return api.getUsers()
            .filter { it.isActive }
            .sortedBy { it.name.lowercase() }
            .map { it.copy(displayName = "${it.firstName} ${it.lastName}") }
    }
}

class UserViewModel(private val repo: UserRepository) : ViewModel() {
    private val _users = MutableStateFlow<List<User>>(emptyList())
    val users: StateFlow<List<User>> = _users.asStateFlow()

    fun loadUsers() {
        viewModelScope.launch {
            _users.value = repo.getActiveUsersSorted()
        }
    }
}
```

### Nguồn dữ liệu duy nhất (offline-first)

```kotlin
// ❌ ViewModel lấy thẳng từ mạng, không cache, offline không dùng được
class MyViewModel(private val api: Api) : ViewModel() {
    fun load() {
        viewModelScope.launch {
            _uiState.value = UiState.Success(api.fetchData())
        }
    }
}

// ✅ Repository là nguồn dữ liệu duy nhất: hiện cache cục bộ trước rồi cập nhật từ mạng
class MyRepository(
    private val api: Api,
    private val dao: DataDao,
) {
    val data: Flow<List<Data>> = dao.getAll()
        .map { entities -> entities.map { it.toDomain() } }

    suspend fun refresh() {
        val remote = api.fetchData()
        dao.replaceAll(remote.map { it.toEntity() })
    }
}

class MyViewModel(private val repo: MyRepository) : ViewModel() {
    val uiState = repo.data.map { UiState.Success(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UiState.Loading)

    fun refresh() {
        viewModelScope.launch { repo.refresh() }
    }
}
```

### Use case cho logic nghiệp vụ phức tạp

```kotlin
// ❌ Tên method của Repository thành cụm động từ, trách nhiệm phình to
class OrderRepository {
    suspend fun validateAndSubmitOrder(order: Order) { }
    suspend fun calculateOrderTotalWithDiscounts(order: Order): Money { }
    suspend fun checkInventoryAndReserve(items: List<Item>) { }
}

// ✅ Use case đóng gói logic nghiệp vụ phức tạp, Repository chỉ truy cập dữ liệu
class SubmitOrderUseCase(
    private val orderRepo: OrderRepository,
    private val inventoryRepo: InventoryRepository,
    private val paymentRepo: PaymentRepository,
) {
    suspend operator fun invoke(order: Order): Result<OrderConfirmation> {
        val validated = order.validate()
        inventoryRepo.reserve(validated.items)
        val total = CalculateOrderTotalUseCase().invoke(validated)
        return paymentRepo.charge(total).map { confirmation ->
            orderRepo.save(validated.copy(status = OrderStatus.CONFIRMED))
            confirmation
        }
    }
}

class OrderRepository {
    suspend fun save(order: Order) { }
    suspend fun getById(id: String): Order? { }
    fun observeOrders(): Flow<List<Order>> { }
}
```

## Sealed class và quản lý trạng thái

### Mô hình hóa trạng thái UI: không biểu diễn được trạng thái vô lý

```kotlin
// ❌ Ghép nhiều field nullable để biểu diễn trạng thái, sinh ra tổ hợp vô lý
data class UiState(
    val isLoading: Boolean = false,
    val data: List<Item>? = null,
    val error: String? = null,
)
// Vô lý: isLoading=true và error != null
// Vô lý: data != null và error != null

// ✅ Mô hình hóa bằng sealed class, các trạng thái loại trừ nhau
sealed interface UiState {
    data object Loading : UiState
    data class Success(val data: List<Item>) : UiState
    data class Error(val message: String, val cause: Throwable? = null) : UiState
}

class MyViewModel(private val repo: Repository) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()
}

// ✅ when exhaustive trong Compose
@Composable
fun MyScreen(viewModel: MyViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    when (state) {
        is UiState.Loading -> CircularProgressIndicator()
        is UiState.Success -> DataList((state as UiState.Success).data)
        is UiState.Error -> ErrorMessage((state as UiState.Error).message)
    }
}
```

### Mô hình hóa sự kiện điều hướng

```kotlin
// ❌ Dùng enum hoặc chuỗi cho sự kiện điều hướng, không mang được tham số
sealed class NavEvent {
    object ToDetail : NavEvent()
    object ToSettings : NavEvent()
}
// Truyền orderId cho ToDetail bằng cách nào?

// ✅ Sealed class mang tham số an toàn kiểu
sealed interface NavEvent {
    data class ToDetail(val orderId: String) : NavEvent
    data class ToSettings(val tab: SettingsTab) : NavEvent
    data class ToProfile(val userId: String, val mode: ProfileMode) : NavEvent
}

// ✅ Xử lý sự kiện điều hướng
navController.handleNavEvent { event ->
    when (event) {
        is NavEvent.ToDetail -> navController.navigate(DetailRoute(event.orderId))
        is NavEvent.ToSettings -> navController.navigate(SettingsRoute(event.tab))
        is NavEvent.ToProfile -> navController.navigate(ProfileRoute(event.userId, event.mode))
    }
}
```

### Bọc kết quả gọi mạng

```kotlin
// ❌ Dùng Result? hoặc nullable cho kết quả mạng, mất thông tin lỗi
suspend fun fetchUser(id: String): User? {
    return try {
        api.getUser(id)
    } catch (e: Exception) {
        null // lỗi gì?
    }
}

// ✅ Bọc kết quả mạng bằng sealed class
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class Error(val code: Int, val message: String) : NetworkResult<Nothing>
    data class Exception(val cause: Throwable) : NetworkResult<Nothing>
}

suspend fun fetchUser(id: String): NetworkResult<User> {
    return try {
        val response = api.getUser(id)
        if (response.isSuccessful) {
            NetworkResult.Success(response.body()!!)
        } else {
            NetworkResult.Error(response.code(), response.message())
        }
    } catch (e: Exception) {
        NetworkResult.Exception(e)
    }
}

// ✅ Ánh xạ sang trạng thái UI trong ViewModel
fun loadUser(id: String) {
    viewModelScope.launch {
        when (val result = repo.fetchUser(id)) {
            is NetworkResult.Success -> _uiState.value = UiState.Success(result.data)
            is NetworkResult.Error -> _uiState.value = UiState.Error("Server error: ${result.code}")
            is NetworkResult.Exception -> _uiState.value = UiState.Error(result.cause.message ?: "Unknown")
        }
    }
}
```

## Checklist

### Coroutine

- [ ] Không dùng `GlobalScope`, dùng `viewModelScope` / `lifecycleScope`
- [ ] `CancellationException` được ném lại, không bị nuốt
- [ ] Tác vụ nặng CPU dùng `Dispatchers.Default`, I/O dùng `Dispatchers.IO`
- [ ] Tác vụ CPU chạy lâu định kỳ gọi `ensureActive()` hoặc `yield()`
- [ ] Lệnh chặn được bọc bằng `runInterruptible`
- [ ] Không dùng `Job()` phá quan hệ coroutine cha con
- [ ] `NonCancellable` chỉ dùng cho dọn dẹp trong khối `finally`
- [ ] Không cần giá trị trả về dùng `launch`, cần kết quả song song dùng `async`

### Flow

- [ ] Phân biệt cold flow (`flow {}`) và hot flow (`StateFlow`/`SharedFlow`)
- [ ] Không dùng `withContext` trong builder `flow {}`, dùng toán tử `flowOn`
- [ ] `collect` đi kèm `repeatOnLifecycle` hoặc `collectAsStateWithLifecycle`
- [ ] Xử lý exception bằng toán tử `.catch`, không bọc `collect` bằng `try-catch`
- [ ] Trạng thái UI dùng `StateFlow`, sự kiện một lần dùng `SharedFlow` hoặc `Channel`

### Compose

- [ ] Tham số Composable dùng kiểu ổn định, tránh recompose thừa
- [ ] Tham số lambda bọc bằng `remember`, không tạo instance mới mỗi lần recompose
- [ ] Trạng thái dẫn xuất dùng `derivedStateOf` để tránh recompose tần suất cao
- [ ] Side effect dùng `LaunchedEffect` / `SideEffect`, không gọi trực tiếp trong thân hàm
- [ ] State hoisting đúng, Composable không giữ trạng thái và tái dùng được

### Null safety

- [ ] Không lạm dụng non-null assertion `!!`, dùng safe call `?.` hoặc elvis `?:`
- [ ] `lateinit` chỉ dùng cho property mà vòng đời bảo đảm khởi tạo
- [ ] Giá trị trả về từ Java nhận bằng kiểu nullable
- [ ] `lazy` dùng cho object tốn kém, khởi tạo ở lần truy cập đầu

### Rò rỉ bộ nhớ

- [ ] Coroutine không capture `Context` / `View` hay object vòng đời ngắn khác
- [ ] Listener được hủy đăng ký trong `onPause` / `onDestroyView`
- [ ] `CoroutineScope` tự tạo có cơ chế hủy
- [ ] Singleton không giữ tham chiếu `Activity` / `Fragment`

### Kiến trúc

- [ ] ViewModel không lộ `MutableStateFlow` / `MutableLiveData`, dùng interface bất biến
- [ ] Logic nghiệp vụ nằm ở Repository / Use case, ViewModel chỉ quản lý trạng thái
- [ ] Offline-first: Repository là nguồn dữ liệu duy nhất
- [ ] Logic nghiệp vụ phức tạp đóng gói thành class Use case riêng

### Sealed class và trạng thái

- [ ] Trạng thái UI mô hình hóa bằng sealed class, không biểu diễn được trạng thái vô lý
- [ ] Sự kiện điều hướng dùng sealed class mang tham số an toàn kiểu
- [ ] Kết quả request mạng bọc bằng sealed class, không mất thông tin lỗi
- [ ] Biểu thức `when` phủ mọi nhánh (exhaustive check)

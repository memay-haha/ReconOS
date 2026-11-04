# Dart và Flutter

Dùng khi review code Dart 3 và Flutter. Trọng tâm: widget rebuild, const constructor, null safety, isolate, bất đồng bộ trong `build`, bẫy state của Riverpod/Bloc, platform channel, key, dispose và khả năng test. File này không dạy ngôn ngữ.

## Widget rebuild và const constructor

Rebuild trong Flutter chỉ rẻ khi cây Element bỏ qua được phần việc. Khi review, đánh dấu widget cấp phát cây con mới, closure mới hoặc tra `Theme` ở mỗi frame trong khi `const` constructor hoặc tách widget riêng giữ được Element con.

### Ưu tiên `const` constructor cho cây con tĩnh

```dart
// ❌ Sai: mỗi lần cha rebuild lại cấp phát Text và Icon mới.
Widget build(BuildContext context) {
  return Row(
    children: [
      Icon(Icons.star),
      Text('Favorites'),
    ],
  );
}

// ✅ Đúng: widget const được chuẩn hóa và bỏ qua khi rebuild.
Widget build(BuildContext context) {
  return const Row(
    children: [
      Icon(Icons.star),
      Text('Favorites'),
    ],
  );
}
```

Câu hỏi review:
- Widget lá (`Text`, `Icon`, `SizedBox`, `Padding` với inset hằng) có `const` không?
- Thiếu `const` ở cha có chặn `const` cho cả cây con không?
- `const` có bị bỏ vì một tham số không const (màu từ `Theme.of`, một closure) làm hỏng constructor không?

### Tách widget, không dùng helper method, khi cần cô lập state

Method private trả về `Widget` được nhúng vào `build` của bên gọi. Widget trả về không có định danh Element riêng nên rebuild mỗi khi bên gọi rebuild.

```dart
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.user});
  final User user;

  // ❌ Sai: `_header()` rebuild cùng ProfilePage dù `user` không đổi.
  Widget _header() => Header(title: user.name);

  @override
  Widget build(BuildContext context) {
    return Column(children: [_header(), const Feed()]);
  }
}

// ✅ Đúng: widget riêng có Element riêng, Feed vẫn const.
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.user});
  final User user;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Header(title: user.name),
        const Feed(),
      ],
    );
  }
}
```

### Không gọi `setState` cho giá trị suy ra được

```dart
// ❌ Sai: lưu dữ liệu suy ra trong State, buộc rebuild để tính lại.
class CartBadge extends StatefulWidget { /* ... */ }

class _CartBadgeState extends State<CartBadge> {
  int _count = 0;

  void didUpdateWidget(CartBadge old) {
    super.didUpdateWidget(old);
    setState(() => _count = widget.items.length);
  }
}

// ✅ Đúng: suy ra trong build, chỉ setState khi dữ liệu nguồn đổi.
class CartBadge extends StatelessWidget {
  const CartBadge({super.key, required this.items});
  final List<Item> items;

  @override
  Widget build(BuildContext context) {
    return Text('${items.length}');
  }
}
```

### Phạm vi rebuild

- `setState` trên `State` ở cao rebuild cả cây con đó. Chỉ nâng state thật sự cần chia sẻ, bọc con tốn kém bằng `RepaintBoundary` hoặc tách ra.
- `ListView(children: [...])` dựng mọi con. Với danh sách dài, dùng `ListView.builder` / `SliverList`.
- Truyền `List`/`Map` mới cấp phát hoặc callback mới vào con lẽ ra dùng được `const` phá việc bỏ qua con. Giữ callback ổn định (`void Function()` lưu trên State) hoặc dựa vào định danh `Widget.canUpdate` qua `const` / widget tách riêng.

Mẫu hiệu năng UI chung: xem [Hiệu năng](../performance.md).

## Null safety và `late`

Null safety của Dart chỉ chặt bằng các kẽ hở code để lại (`!`, `late`, `as`). Coi chúng là tín hiệu review, không phải chuyện style.

### Tránh `!` trên giá trị trình biên dịch không chứng minh được

```dart
// ❌ Sai: toán tử bang giấu khả năng null và crash lúc chạy.
void openProfile(User? user) {
  Navigator.pushNamed(context, '/user/${user!.id}');
}

// ✅ Đúng: promote qua biến cục bộ hoặc return sớm.
void openProfile(User? user) {
  final id = user?.id;
  if (id == null) return;
  Navigator.pushNamed(context, '/user/$id');
}
```

### `late` là crash bị hoãn, không phải kiểu

`late` không có initializer ném `LateInitializationError` ở lần đọc đầu. `late final` có initializer là lazy init, trường hợp hợp lệ thường gặp (tốn kém, chỉ một lần).

```dart
class Session {
  // ❌ Sai: trường `late` được đọc từ method khác, constructor không bảo đảm đã gán.
  late String token;

  bool get isReady => token.isNotEmpty;
}

class Session {
  // ✅ Đúng: nullable tới khi gán, API làm sự vắng mặt hiện rõ.
  String? token;

  bool get isReady => token != null && token!.isNotEmpty;
}

class ThemeCache {
  // ✅ Đúng: `late final` lazy có initializer, lần đọc đầu tính một lần.
  late final Map<String, Color> _colors = _loadColors();
}
```

Câu hỏi review:
- `late` có được dùng vì tác giả không muốn dùng `?` hoặc tham số constructor không?
- Trường `late` gán trong `initState` có bị đọc từ listener có thể chạy sớm hơn (animation, callback platform) không?
- Có ép kiểu `as Foo` ở chỗ pattern (`if (x case final Foo foo)`) hoặc promote bằng `is` thất bại rõ ràng và cục bộ hơn không?

### Trường không được promote

```dart
class ProfileTile extends StatelessWidget {
  const ProfileTile({super.key, required this.user});
  final User? user;

  @override
  Widget build(BuildContext context) {
    // ❌ Sai: promote không áp dụng cho trường, đây là lỗi (`unchecked_use_of_nullable_value`).
    // return Text(user.name);

    // ✅ Đúng: promote biến cục bộ.
    final user = this.user;
    if (user == null) return const SizedBox.shrink();
    return Text(user.name);
  }
}
```

Crash do null vẫn là crash. Fail fast hay nuốt lỗi: xem [Xử lý lỗi](../error-handling.md).

## Isolate

> Mẫu đồng thời chung cho nhiều ngôn ngữ: xem [Bất đồng bộ và đồng thời](../concurrency.md).

Isolate UI của Flutter phải tránh việc nặng về JSON, ảnh và mã hóa. Isolate Dart không chia sẻ bộ nhớ, message phải gửi được.

### Không chặn isolate UI

```dart
// ❌ Sai: decode JSON lớn trên isolate UI làm giật frame.
final users = (jsonDecode(raw) as List)
    .map((e) => User.fromJson(e as Map<String, dynamic>))
    .toList();

// ✅ Đúng: `Isolate.run` (Dart 2.19+) / `compute` cho việc một lần.
final users = await Isolate.run(() {
  return (jsonDecode(raw) as List)
      .map((e) => User.fromJson(e as Map<String, dynamic>))
      .toList();
});
```

### Giới hạn của message

```dart
// ❌ Sai: closure, ReceivePort và nhiều kiểu của plugin không gửi được.
await Isolate.run(() => widget.onParsed());

// ✅ Đúng: gửi dữ liệu thuần, ánh xạ về kiểu UI trên isolate chính.
final dto = await Isolate.run(() => parseReport(bytes));
setState(() => report = Report.fromDto(dto));
```

Câu hỏi review:
- `jsonDecode`, decode ảnh hoặc mã hóa payload không nhỏ có chạy trên isolate UI không?
- Callback của isolate có bắt `BuildContext`, `State` hoặc controller của plugin không?
- Nếu spawn isolate sống lâu, `kill` / `pause` có đi cặp với dispose widget không?
- Lỗi của isolate có được đưa lên, hay `await Isolate.run` thiếu xử lý lỗi?

`compute` trong `flutter/foundation.dart` là wrapper mỏng. Trong code chỉ dùng Dart, ưu tiên `Isolate.run`. Cả hai đều không phải thread pool: spawn cho mỗi lời gọi nhỏ tốn hơn làm việc trực tiếp.

## Bất đồng bộ trong `build`

`build` phải đồng bộ và không có side effect. Future tạo trong `build` khởi động lại ở mỗi lần rebuild.

### Không bắt đầu I/O hay tạo `Future` mới trong `build`

```dart
// ❌ Sai: Future mới ở mỗi lần rebuild, request trước bị bỏ.
Widget build(BuildContext context) {
  return FutureBuilder<Profile>(
    future: api.fetchProfile(id),
    builder: (context, snap) { /* ... */ },
  );
}

// ✅ Đúng: cache Future trong State, fetch lại khi `id` đổi.
class ProfileView extends StatefulWidget {
  const ProfileView({super.key, required this.id});
  final String id;
  @override
  State<ProfileView> createState() => _ProfileViewState();
}

class _ProfileViewState extends State<ProfileView> {
  late Future<Profile> _future = api.fetchProfile(widget.id);

  @override
  void didUpdateWidget(ProfileView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id) {
      _future = api.fetchProfile(widget.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Profile>(
      future: _future,
      builder: (context, snap) { /* ... */ },
    );
  }
}
```

Gắn `ValueKey(id)` cho `ProfileView` cũng mount lại State và bắt đầu fetch mới. Cách nào cũng được. Future cache bằng `late final` mà không có `didUpdateWidget` bị cũ khi `id` đổi.

Quy tắc tương tự với `StreamBuilder`: không mở stream mới trong `build`. Tạo một lần (`initState`, provider, Bloc) và hủy khi dispose.

### `setState` sau `await` phải kiểm tra `mounted`

```dart
Future<void> _load() async {
  final data = await api.fetch();
  // ❌ Sai: widget có thể đã dispose trong lúc await.
  setState(() => _data = data);
}

Future<void> _load() async {
  final data = await api.fetch();
  if (!mounted) return;
  setState(() => _data = data);
}
```

Dùng `context.mounted` (Flutter 3.7+) trước khi dùng `BuildContext` sau khoảng chờ bất đồng bộ (`Navigator`, `ScaffoldMessenger`, `showDialog`). Lint `use_build_context_synchronously` tồn tại vì đây là một loại crash, không phải chuyện style.

### Không đánh dấu `build` là `async`

```dart
// ❌ Sai: build không được async, code không biên dịch hoặc helper bị lạm dụng.
Widget build(BuildContext context) async {
  final user = await repo.user();
  return Text(user.name);
}

// ✅ Đúng: giữ state bất đồng bộ trong State / notifier, build chỉ đọc.
```

Gọi `unawaited(load())` kiểu fire-and-forget trong `build` là cùng lỗi đó, chỉ thêm bước.

## Quản lý state: Riverpod và Bloc

Ví dụ dùng Riverpod và Bloc vì chúng phổ biến nhất trong review Flutter. Bẫy tương tự áp dụng cho Provider, GetX, Signals và `InheritedWidget` thuần: phạm vi rebuild, side effect trong build, vòng đời.

### Riverpod: `watch` và `read`, phạm vi rebuild

```dart
class CartButton extends ConsumerWidget {
  const CartButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ❌ Sai: watch toàn bộ giỏ, nút rebuild mỗi khi một item đổi.
    final cart = ref.watch(cartProvider);

    // ✅ Đúng: chỉ watch trường widget cần.
    final count = ref.watch(cartProvider.select((c) => c.items.length));
    return Badge(label: Text('$count'));
  }
}
```

```dart
void onPressed() {
  // ❌ Sai: `watch` trong callback / listener không phải subscription rebuild.
  // ref.watch(cartProvider).add(item);

  // ✅ Đúng: `read` cho thao tác một lần, `watch`/`select` chỉ trong `build`.
  ref.read(cartProvider.notifier).add(item);
}
```

Câu hỏi review:
- Có dùng `ref.watch` trong `initState`, gesture handler hoặc constructor của `Provider` không?
- Widget có `watch` object lớn trong khi `select` / provider suy ra là đủ không?
- Provider có dùng `ref` sau `dispose` không (thiếu `ref.onDispose` cho controller, stream)?
- Provider phạm vi màn hình có thiếu `autoDispose` nên rò rỉ sau khi pop không?

### Bloc: `create` và `value`, `buildWhen`, cubit đã đóng

`BlocProvider(create: ...)` trong `build` là cách dùng đúng tài liệu: `create` chạy một lần cho mỗi Element, không chạy lại mỗi lần rebuild. `updateShouldNotify` không điều khiển `create`. Lỗi thật là tạo instance bloc mới trong `build` rồi đưa vào `BlocProvider.value` (không sở hữu, không dispose, object mới mỗi lần rebuild). Vì `create` bắt `id` một lần, cha truyền `id` mới về sau không nạp lại trừ khi Element mount lại hoặc có dispatch cập nhật.

```dart
// ❌ Sai: ProfileBloc() mới mỗi lần rebuild, `value` không dispose bloc đó.
Widget build(BuildContext context) {
  return BlocProvider.value(
    value: ProfileBloc()..add(ProfileStarted(id)),
    child: const ProfileBody(),
  );
}

// ❌ Sai: UniqueKey mount lại mỗi lần rebuild, `create` chạy lại mỗi lần.
Widget build(BuildContext context) {
  return BlocProvider(
    key: UniqueKey(),
    create: (_) => ProfileBloc()..add(ProfileStarted(id)),
    child: const ProfileBody(),
  );
}

// ✅ Đúng: `create` sở hữu một instance, ValueKey(id) chỉ mount lại khi id đổi.
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      key: ValueKey(id),
      create: (_) => ProfileBloc()..add(ProfileStarted(id)),
      child: const ProfileBody(),
    );
  }
}
```

Cách khác: giữ nguyên bloc và trong `didUpdateWidget` dispatch `ProfileRequested(id)` khi `id` đổi. Không tạo `ProfileBloc()` thay thế ở đó.

```dart
// ❌ Sai: việc của listener nằm trong builder, còn rebuild với mọi state.
BlocBuilder<ProfileBloc, ProfileState>(
  builder: (context, state) {
    if (state is ProfileFailure) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(/* ... */);
      });
    }
    return ProfileBody(state: state);
  },
)

// ✅ Đúng: side effect trong BlocListener, lọc rebuild bằng buildWhen.
BlocConsumer<ProfileBloc, ProfileState>(
  listenWhen: (p, c) => c is ProfileFailure && p is! ProfileFailure,
  listener: (context, state) {
    final message = (state as ProfileFailure).message;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  },
  buildWhen: (p, c) => p.user != c.user || p.loading != c.loading,
  builder: (context, state) => ProfileBody(state: state),
)
```

Câu hỏi review:
- `Cubit`/`Bloc` có được đóng không (`BlocProvider` tự làm nếu `lazy`/`create` sở hữu bloc, bloc tạo thủ công phải `close`)?
- Có dispatch event từ `build` không?
- State có thiếu `Equatable` / `==` khiến mọi `emit` đều rebuild dù trường không đổi không?
- Logic nghiệp vụ có nằm trong widget (`context.read<FooBloc>().add` trộn với parse, I/O) thay vì trong bloc không?

Không coi `Obx` / `GetBuilder` của GetX là trường hợp đặc biệt: vẫn hỏi cùng các câu "ai sở hữu controller, ai rebuild, ai dispose".

## Platform channel

Method channel, event channel và Pigeon là ranh giới tin cậy và vòng đời. Lỗi hiện ra lúc chạy dưới dạng "missing plugin", không phải lúc biên dịch.

```dart
// ❌ Sai: map không kiểu, bỏ qua lỗi, lời gọi native nặng chặn isolate UI.
final result = await MethodChannel('app.wallet').invokeMethod('sign', {'tx': raw});
final signature = result as String;

// ✅ Đúng: API có kiểu (Pigeon hoặc wrapper), xử lý lỗi, không giả định chạy trên UI thread.
try {
  final signature = await walletHost.sign(SignRequest(tx: raw));
  if (!mounted) return;
  onSigned(signature);
} on PlatformException catch (e) {
  onSignFailed(e.code, e.message);
}
```

Câu hỏi review:
- Tên channel có là chuỗi chung dễ trùng (`app`, `native`) mà không có tiền tố domain không?
- Implementation Android/iOS của cùng method có phủ mọi kiểu tham số và null không?
- Phía Dart có giả định plugin đã đăng ký không (test, background isolate và engine add-to-app thường chưa đăng ký)?
- Dữ liệu nhị phân có truyền dạng bản sao `List<int>` thay vì `Uint8List` / bytes của Pigeon không?
- Subscription EventChannel có được hủy trong `dispose` không?
- Code native có làm việc đĩa/mạng trên main thread của platform không?

Dữ liệu từ platform là đầu vào không tin cậy: kiểm tra như payload mạng. Xem [Bảo mật](../security.md).

## Key

Key giữ định danh `State` / `Element` qua các lần rebuild. Key sai khiến state gắn nhầm dòng, thiếu key khiến state bị reset khi danh sách đổi thứ tự.

```dart
// ❌ Sai: không có key, sau khi xóa/đổi thứ tự, state của TextField dính theo index.
ListView(
  children: items.map((item) => TodoRow(item: item)).toList(),
)

// ❌ Sai: UniqueKey() trong build, mỗi lần rebuild là định danh mới, state luôn bị reset.
TodoRow(key: UniqueKey(), item: item)

// ✅ Đúng: id ổn định từ model.
ListView(
  children: [
    for (final item in items)
      TodoRow(key: ValueKey(item.id), item: item),
  ],
)
```

```dart
// ❌ Sai: GlobalKey tạo trong `build`, key mới mỗi lần rebuild, cộng thêm chi phí GlobalKey.
Widget build(BuildContext context) {
  final key = GlobalKey<FormState>();
  return Form(key: key, child: /* ... */);
}

// ✅ Đúng: GlobalKey hiếm khi cần, giữ trên State khi thật sự cần FormState.
class _EditorState extends State<Editor> {
  final _formKey = GlobalKey<FormState>();
  @override
  Widget build(BuildContext context) => Form(key: _formKey, child: /* ... */);
}
```

Câu hỏi review:
- Danh sách sắp xếp lại được / dismissible / có animation có dùng `ValueKey` / `ObjectKey` từ id model ổn định không?
- Có dùng `GlobalKey` để với vào `State` của con trong khi callback / `ValueNotifier` là đủ không?
- Có gắn key cho widget mà `runtimeType` đã định danh duy nhất (thường không cần) không?

## Dispose và vòng đời

Mọi thứ có `addListener`, subscription, ticker hoặc object native đi kèm đều cần `dispose` tương ứng. Flutter không tự làm thay.

```dart
class SearchField extends StatefulWidget {
  const SearchField({super.key});
  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> with SingleTickerProviderStateMixin {
  late final TextEditingController _controller;
  late final AnimationController _anim;
  StreamSubscription<Query>? _sub;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 200));
    _sub = queryStream.listen((q) {
      if (mounted) _controller.text = q.text;
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _anim.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(controller: _controller);
}
```

Câu hỏi review:
- `TextEditingController`, `ScrollController`, `FocusNode`, `AnimationController`, `TabController`, `PageController`: đã tạo thì đã dispose chưa?
- `StreamSubscription`, `Timer`, listener của `ChangeNotifier`, `WidgetsBindingObserver`: đã gỡ chưa?
- `AnimationController` có dùng `TickerProvider` chết cùng `State` (`SingleTickerProviderStateMixin`), không phải vsync bị rò rỉ không?
- Controller cấp route tạo trong `BlocProvider`/`Provider` có đặt callback `dispose` không?
- Controller của `Image.network` / video / camera có dừng khi route bị che, không chỉ khi pop không?

`dispose` không được dùng `BuildContext` (element đã unmount). Không gọi `setState` ở đó.

## Khả năng test

Review test như review code sản phẩm. Test Flutter phải pump cả app chỉ để khẳng định một chuỗi là dấu hiệu logic bị nhốt trong widget.

```dart
// ❌ Sai: parse và I/O nằm trong widget, test phải pump và mock mọi thứ.
class PriceLabel extends StatelessWidget {
  const PriceLabel({super.key, required this.raw});
  final String raw;

  @override
  Widget build(BuildContext context) {
    final n = NumberFormat.simpleCurrency().parse(raw);
    return Text(n.toString());
  }
}

// ✅ Đúng: hàm thuần / mapper được unit test, widget chỉ render.
String formatPrice(String raw, NumberFormat format) => format.format(format.parse(raw));

class PriceLabel extends StatelessWidget {
  const PriceLabel({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Text(text);
}
```

```dart
// ❌ Sai: test phụ thuộc thời gian thật và mạng.
testWidgets('loads profile', (tester) async {
  await tester.pumpWidget(const ProfilePage(id: '1'));
  await tester.pumpAndSettle();
  expect(find.text('Ada'), findsOneWidget);
});

// ✅ Đúng: inject bản giả, pump tới khi Future do test kiểm soát hoàn thành.
testWidgets('loads profile', (tester) async {
  final api = FakeProfileApi()..completeWith(Profile(name: 'Ada'));
  await tester.pumpWidget(ProfilePage(id: '1', api: api));
  await tester.pump();
  expect(find.text('Ada'), findsOneWidget);
});
```

Câu hỏi review:
- Logic mới có test được bằng `flutter test` mà không cần `IntegrationTestWidgetsFlutterBinding` không?
- Widget tương tác mà test (và người review) cần tìm có `Key`, mà không gắn `UniqueKey` trong `build` không?
- Platform channel có được mock (`TestDefaultBinaryMessengerBinding`) không?
- `pumpAndSettle` có treo vì animation vô hạn / stream polling không bao giờ rảnh không?
- `late` trong test có giấu bước setup bị thiếu không?

## Tài liệu chính thức

- [Dart language tour (null safety)](https://dart.dev/null-safety)
- [Effective Dart](https://dart.dev/effective-dart)
- [Flutter performance: best practices](https://docs.flutter.dev/perf/best-practices)
- [FutureBuilder class](https://api.flutter.dev/flutter/widgets/FutureBuilder-class.html)
- [Isolate.run](https://api.dart.dev/stable/dart-isolate/Isolate/run.html)
- [Riverpod: Refs (`watch` vs `read`)](https://riverpod.dev/docs/concepts2/refs)
- [Bloc: BlocListener vs BlocBuilder](https://bloclibrary.dev/bloc-concepts/)
- [Key class](https://api.flutter.dev/flutter/foundation/Key-class.html)

Tài liệu liên quan trong skill: [Xử lý lỗi](../error-handling.md), [Bất đồng bộ và đồng thời](../concurrency.md), [Hiệu năng](../performance.md), [Bảo mật](../security.md).

## Checklist

### Widget và rebuild

- [ ] Cây con tĩnh dùng `const` constructor
- [ ] Con tốn kém là widget tách riêng, không phải method `_buildFoo()`
- [ ] Danh sách dài dùng builder lazy, không dùng `children:` dựng sẵn toàn bộ
- [ ] Không dùng `setState` để lưu giá trị suy ra được trong `build`

### Null safety và `late`

- [ ] Không dùng `!` và `as` để bịt hệ thống kiểu
- [ ] `late` là lazy init (`late final x = ...`) hoặc thật sự được bảo đảm gán trước lần đọc đầu
- [ ] Trường nullable được promote qua biến cục bộ, không giả định khác null

### Isolate và bất đồng bộ

- [ ] Việc nặng về JSON / ảnh / mã hóa không chạy trên isolate UI
- [ ] Message của isolate là dữ liệu thuần gửi được
- [ ] `build` không tạo Future/Stream hay bắt đầu I/O
- [ ] `FutureBuilder`/`StreamBuilder` dùng lại future/stream đã cache, fetch lại khi id/đầu vào đổi
- [ ] `setState` / `BuildContext` sau `await` có kiểm tra `mounted` / `context.mounted`

### Quản lý state

- [ ] `ref.watch` / `context.watch` chỉ trong `build`, callback dùng `read`
- [ ] Rebuild được thu hẹp (`select`, `buildWhen`)
- [ ] Không tạo `Bloc`/`Cubit`/`ChangeNotifier` trong `build` rồi đưa vào `*.value`. Dùng `create`, gắn `ValueKey(id)` (không phải `UniqueKey()`) hoặc dùng `didUpdateWidget` để id mới nạp lại
- [ ] Provider/bloc sở hữu controller được dispose (`autoDispose`, `close`)

### Platform, key, dispose

- [ ] Lời gọi platform channel xử lý `PlatformException` và plugin thiếu
- [ ] Subscription EventChannel / native được hủy
- [ ] Con trong danh sách giữ `State` có `ValueKey` ổn định (không `UniqueKey()` trong `build`)
- [ ] Controller, ticker và subscription được dispose, `dispose` không dùng `context`

### Test

- [ ] Logic domain được unit test mà không cần pump widget
- [ ] Widget test inject bản giả, không gọi mạng hay platform channel thật
- [ ] Không dùng `pumpAndSettle` với animation không bao giờ dừng

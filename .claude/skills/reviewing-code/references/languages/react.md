# React

Dùng khi review code React: quy tắc Hooks, mức tối ưu hiệu năng vừa đủ, thiết kế component, và mẫu hiện đại của React 19, Server Components (RSC), TanStack Query v5.

## Quy tắc Hooks cơ bản

```tsx
// ❌ Gọi Hook có điều kiện: vi phạm quy tắc Hooks
function BadComponent({ isLoggedIn }) {
  if (isLoggedIn) {
    const [user, setUser] = useState(null);  // Error
  }
  return <div>...</div>;
}

// ✅ Gọi Hook ở cấp cao nhất của component
function GoodComponent({ isLoggedIn }) {
  const [user, setUser] = useState(null);
  if (!isLoggedIn) return <LoginPrompt />;
  return <div>{user?.name}</div>;
}
```

## Mẫu `useEffect`

```tsx
// ❌ Mảng dependency thiếu
function BadEffect({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, []);  // thiếu userId
}

// ✅ Mảng dependency đầy đủ
function GoodEffect({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchUser(userId).then(data => {
      if (!cancelled) setUser(data);
    });
    return () => { cancelled = true; };  // hàm cleanup
  }, [userId]);
}

// ❌ Dùng useEffect tính state dẫn xuất (anti-pattern)
function BadDerived({ items }) {
  const [filteredItems, setFilteredItems] = useState([]);
  useEffect(() => {
    setFilteredItems(items.filter(i => i.active));
  }, [items]);  // effect thừa và thêm một lần render
  return <List items={filteredItems} />;
}

// ✅ Tính thẳng khi render, hoặc dùng useMemo
function GoodDerived({ items }) {
  const filteredItems = useMemo(
    () => items.filter(i => i.active),
    [items]
  );
  return <List items={filteredItems} />;
}

// ❌ Dùng useEffect để phản hồi sự kiện
function BadEventEffect() {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (query) {
      analytics.track('search', { query });  // nên nằm trong event handler
    }
  }, [query]);
}

// ✅ Chạy side effect trong event handler
function GoodEvent() {
  const [query, setQuery] = useState('');
  const handleSearch = (q: string) => {
    setQuery(q);
    analytics.track('search', { query: q });
  };
}
```

## `useMemo` và `useCallback`

```tsx
// ❌ Tối ưu thừa: hằng số không cần useMemo
function OverOptimized() {
  const config = useMemo(() => ({ timeout: 5000 }), []);  // vô nghĩa
  const handleClick = useCallback(() => {
    console.log('clicked');
  }, []);  // vô nghĩa nếu không truyền cho component memo
}

// ✅ Chỉ tối ưu khi cần
function ProperlyOptimized() {
  const config = { timeout: 5000 };  // object đơn giản, khai báo thẳng
  const handleClick = () => console.log('clicked');
}

// ❌ Dependency của useCallback luôn đổi
function BadCallback({ data }) {
  // data là object mới mỗi lần render nên useCallback vô tác dụng
  const process = useCallback(() => {
    return data.map(transform);
  }, [data]);
}

// ✅ useMemo và useCallback đi cùng React.memo
const MemoizedChild = React.memo(function Child({ onClick, items }) {
  return <div onClick={onClick}>{items.length}</div>;
});

function Parent({ rawItems }) {
  const items = useMemo(() => processItems(rawItems), [rawItems]);
  const handleClick = useCallback(() => {
    console.log(items.length);
  }, [items]);
  return <MemoizedChild onClick={handleClick} items={items} />;
}
```

## Thiết kế component

```tsx
// ❌ Khai báo component bên trong component: mỗi lần render tạo component mới
function BadParent() {
  function ChildComponent() {  // hàm mới mỗi lần render
    return <div>child</div>;
  }
  return <ChildComponent />;
}

// ✅ Khai báo component bên ngoài
function ChildComponent() {
  return <div>child</div>;
}
function GoodParent() {
  return <ChildComponent />;
}

// ❌ Props luôn là tham chiếu mới
function BadProps() {
  return (
    <MemoizedComponent
      style={{ color: 'red' }}  // object mới mỗi lần render
      onClick={() => {}}         // hàm mới mỗi lần render
    />
  );
}

// ✅ Tham chiếu ổn định
const style = { color: 'red' };
function GoodProps() {
  const handleClick = useCallback(() => {}, []);
  return <MemoizedComponent style={style} onClick={handleClick} />;
}
```

## Error Boundary và Suspense

```tsx
// ❌ Không có error boundary
function BadApp() {
  return (
    <Suspense fallback={<Loading />}>
      <DataComponent />  {/* lỗi làm sập cả ứng dụng */}
    </Suspense>
  );
}

// ✅ Error Boundary bọc Suspense
function GoodApp() {
  return (
    <ErrorBoundary fallback={<ErrorUI />}>
      <Suspense fallback={<Loading />}>
        <DataComponent />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Server Components (RSC)

```tsx
// ❌ Dùng tính năng phía client trong Server Component
// app/page.tsx (mặc định là Server Component)
function BadServerComponent() {
  const [count, setCount] = useState(0);  // Error: RSC không dùng Hook
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// ✅ Tách logic tương tác sang Client Component
// app/counter.tsx
'use client';
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// app/page.tsx (Server Component)
async function GoodServerComponent() {
  const data = await fetchData();  // await trực tiếp được
  return (
    <div>
      <h1>{data.title}</h1>
      <Counter />  {/* Client Component */}
    </div>
  );
}

// ❌ Đặt 'use client' sai chỗ: cả cây thành client
// layout.tsx
'use client';  // mọi component con đều thành Client Component
export default function Layout({ children }) { ... }

// ✅ Chỉ dùng 'use client' cho component cần tương tác
// Cô lập logic client ở component lá
```

## Actions và form của React 19

React 19 thêm hệ thống Actions và Hook mới cho form, giúp xử lý thao tác bất đồng bộ và optimistic update gọn hơn.

### `useActionState`

```tsx
// ❌ Cách cũ: nhiều biến state
function OldForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState(null);

  const handleSubmit = async (formData: FormData) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await submitForm(formData);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsPending(false);
    }
  };
}

// ✅ React 19: useActionState gom về một chỗ
import { useActionState } from 'react';

function NewForm() {
  const [state, formAction, isPending] = useActionState(
    async (prevState, formData: FormData) => {
      try {
        const result = await submitForm(formData);
        return { success: true, data: result };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    { success: false, data: null, error: null }
  );

  return (
    <form action={formAction}>
      <input name="email" />
      <button disabled={isPending}>
        {isPending ? 'Submitting...' : 'Submit'}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

### `useFormStatus`

```tsx
// ❌ Truyền trạng thái form qua props
function BadSubmitButton({ isSubmitting }) {
  return <button disabled={isSubmitting}>Submit</button>;
}

// ✅ useFormStatus đọc trạng thái <form> cha, không cần props
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();
  // phải gọi trong component con nằm bên trong <form>
  return (
    <button disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  );
}

// ❌ Gọi useFormStatus trong component chứa form: không hoạt động
function BadForm() {
  const { pending } = useFormStatus();  // không lấy được trạng thái
  return (
    <form action={action}>
      <button disabled={pending}>Submit</button>
    </form>
  );
}

// ✅ useFormStatus phải nằm trong component con của form
function GoodForm() {
  return (
    <form action={action}>
      <SubmitButton />  {/* gọi useFormStatus bên trong */}
    </form>
  );
}
```

### `useOptimistic`

```tsx
// ❌ Chờ server trả lời rồi mới cập nhật UI
function SlowLike({ postId, likes }) {
  const [likeCount, setLikeCount] = useState(likes);
  const [isPending, setIsPending] = useState(false);

  const handleLike = async () => {
    setIsPending(true);
    const newCount = await likePost(postId);  // phải chờ
    setLikeCount(newCount);
    setIsPending(false);
  };
}

// ✅ useOptimistic phản hồi ngay, lỗi thì tự rollback
import { useOptimistic } from 'react';

function FastLike({ postId, likes }) {
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    likes,
    (currentLikes, increment: number) => currentLikes + increment
  );

  const handleLike = async () => {
    addOptimisticLike(1);  // cập nhật UI ngay
    try {
      await likePost(postId);  // đồng bộ nền
    } catch {
      // React tự rollback về giá trị likes ban đầu
    }
  };

  return <button onClick={handleLike}>{optimisticLikes} likes</button>;
}
```

### Server Actions (Next.js 15+)

```tsx
// ❌ Client tự gọi API
'use client';
function ClientForm() {
  const handleSubmit = async (formData: FormData) => {
    const res = await fetch('/api/submit', {
      method: 'POST',
      body: formData,
    });
    // ...
  };
}

// ✅ Server Action kèm useActionState
// actions.ts
'use server';
export async function createPost(prevState: any, formData: FormData) {
  const title = formData.get('title');
  await db.posts.create({ title });
  revalidatePath('/posts');
  return { success: true };
}

// form.tsx
'use client';
import { createPost } from './actions';

function PostForm() {
  const [state, formAction, isPending] = useActionState(createPost, null);
  return (
    <form action={formAction}>
      <input name="title" />
      <SubmitButton />
    </form>
  );
}
```

## Suspense và streaming SSR

Suspense và streaming là tính năng cốt lõi từ React 18, dùng rộng trong framework như Next.js 15.

### Suspense cơ bản

```tsx
// ❌ Tự quản lý trạng thái loading kiểu cũ
function OldComponent() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData().then(setData).finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Spinner />;
  return <DataView data={data} />;
}

// ✅ Suspense khai báo trạng thái loading
function NewComponent() {
  return (
    <Suspense fallback={<Spinner />}>
      <DataView />  {/* bên trong dùng use() hoặc thư viện lấy dữ liệu hỗ trợ Suspense */}
    </Suspense>
  );
}
```

### Nhiều Suspense boundary độc lập

```tsx
// ❌ Một boundary: mọi phần chờ nhau cùng tải
function BadLayout() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Header />
      <MainContent />  {/* chậm */}
      <Sidebar />      {/* nhanh */}
    </Suspense>
  );
}

// ✅ Boundary riêng: từng phần stream độc lập
function GoodLayout() {
  return (
    <>
      <Header />  {/* hiện ngay */}
      <div className="flex">
        <Suspense fallback={<ContentSkeleton />}>
          <MainContent />  {/* tải độc lập */}
        </Suspense>
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />      {/* tải độc lập */}
        </Suspense>
      </div>
    </>
  );
}
```

### Streaming trong Next.js 15

```tsx
// app/page.tsx: streaming tự động
export default async function Page() {
  // await này không chặn cả trang
  const data = await fetchSlowData();
  return <div>{data}</div>;
}

// app/loading.tsx: Suspense boundary tự động
export default function Loading() {
  return <Skeleton />;
}
```

### Hook `use()` (React 19)

```tsx
// ✅ Đọc Promise trong component
import { use } from 'react';

function Comments({ commentsPromise }) {
  const comments = use(commentsPromise);  // tự kích hoạt Suspense
  return (
    <ul>
      {comments.map(c => <li key={c.id}>{c.text}</li>)}
    </ul>
  );
}

// Component cha tạo Promise, component con tiêu thụ
function Post({ postId }) {
  const commentsPromise = fetchComments(postId);  // không await
  return (
    <article>
      <PostContent id={postId} />
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </article>
  );
}
```

## TanStack Query v5

TanStack Query là thư viện lấy dữ liệu phổ biến nhất trong React, v5 là bản ổn định hiện tại.

### Cấu hình cơ bản

```tsx
// ❌ Cấu hình mặc định không phù hợp
const queryClient = new QueryClient();  // mặc định có thể không hợp production

// ✅ Cấu hình khuyến nghị cho production
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // dữ liệu coi là mới trong 5 phút
      gcTime: 1000 * 60 * 30,    // thu gom rác sau 30 phút (v5 đổi tên từ cacheTime)
      retry: 3,
      refetchOnWindowFocus: false,  // tùy nhu cầu
    },
  },
});
```

### `queryOptions` (mới trong v5)

```tsx
// ❌ Lặp lại queryKey và queryFn
function Component1() {
  const { data } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => fetchUser(userId),
  });
}

function prefetchUser(queryClient, userId) {
  queryClient.prefetchQuery({
    queryKey: ['users', userId],  // lặp
    queryFn: () => fetchUser(userId),  // lặp
  });
}

// ✅ queryOptions định nghĩa một chỗ, an toàn kiểu
import { queryOptions } from '@tanstack/react-query';

const userQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ['users', userId],
    queryFn: () => fetchUser(userId),
  });

function Component1({ userId }) {
  const { data } = useQuery(userQueryOptions(userId));
}

function prefetchUser(queryClient, userId) {
  queryClient.prefetchQuery(userQueryOptions(userId));
}

// getQueryData cũng an toàn kiểu
const user = queryClient.getQueryData(userQueryOptions(userId).queryKey);
```

### Bẫy thường gặp

```tsx
// ❌ staleTime bằng 0 gây request thừa
useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  // staleTime mặc định 0, mỗi lần component mount đều refetch
});

// ✅ Đặt staleTime hợp lý
useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  staleTime: 1000 * 60,  // không request lại trong 1 phút
});

// ❌ queryFn dùng tham chiếu không có trong queryKey
function BadQuery({ filters }) {
  useQuery({
    queryKey: ['items'],  // queryKey thiếu filters
    queryFn: () => fetchItems(filters),  // filters đổi không làm request lại
  });
}

// ✅ queryKey chứa mọi tham số ảnh hưởng dữ liệu
function GoodQuery({ filters }) {
  useQuery({
    queryKey: ['items', filters],  // filters là một phần của queryKey
    queryFn: () => fetchItems(filters),
  });
}
```

### `useSuspenseQuery`

`useSuspenseQuery` khác `useQuery` ở nhiều điểm. Nắm các giới hạn dưới đây trước khi chọn.

#### Giới hạn của `useSuspenseQuery`

| Đặc điểm | `useQuery` | `useSuspenseQuery` |
|---|---|---|
| Tùy chọn `enabled` | ✅ Có | ❌ Không |
| `placeholderData` | ✅ Có | ❌ Không |
| Kiểu `data` | `T \| undefined` | `T` (chắc chắn có giá trị) |
| Xử lý lỗi | thuộc tính `error` | ném lên Error Boundary |
| Trạng thái loading | thuộc tính `isLoading` | treo lên Suspense |

#### Thay thế khi không có `enabled`

```tsx
// ❌ Dùng enabled để truy vấn có điều kiện
function BadSuspenseQuery({ userId }) {
  const { data } = useSuspenseQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    enabled: !!userId,  // useSuspenseQuery không hỗ trợ enabled
  });
}

// ✅ Render có điều kiện bằng cách ghép component
function GoodSuspenseQuery({ userId }) {
  // useSuspenseQuery bảo đảm data có kiểu T, không phải T | undefined
  const { data } = useSuspenseQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });
  return <UserProfile user={data} />;
}

function Parent({ userId }) {
  if (!userId) return <NoUserSelected />;
  return (
    <Suspense fallback={<UserSkeleton />}>
      <GoodSuspenseQuery userId={userId} />
    </Suspense>
  );
}
```

#### Khác biệt khi xử lý lỗi

```tsx
// ❌ useSuspenseQuery không có thuộc tính error dùng được
function BadErrorHandling() {
  const { data, error } = useSuspenseQuery({...});
  if (error) return <Error />;  // error luôn null
}

// ✅ Xử lý lỗi bằng Error Boundary
function GoodErrorHandling() {
  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <Suspense fallback={<Loading />}>
        <DataComponent />
      </Suspense>
    </ErrorBoundary>
  );
}

function DataComponent() {
  // lỗi ném lên Error Boundary
  const { data } = useSuspenseQuery({
    queryKey: ['data'],
    queryFn: fetchData,
  });
  return <Display data={data} />;
}
```

#### Khi nào chọn `useSuspenseQuery`

```tsx
// ✅ Phù hợp:
// 1. Luôn cần dữ liệu (truy vấn không điều kiện)
// 2. Component phải có dữ liệu mới render được
// 3. Dùng mẫu Suspense của React 19
// 4. Server Component kèm hydration phía client

// ❌ Không phù hợp:
// 1. Truy vấn có điều kiện (kích hoạt theo thao tác người dùng)
// 2. Cần placeholderData hoặc dữ liệu ban đầu
// 3. Cần xử lý loading/error ngay trong component
// 4. Nhiều truy vấn phụ thuộc nhau

// ✅ Nhiều truy vấn độc lập: dùng useSuspenseQueries
function MultipleQueries({ userId }) {
  const [userQuery, postsQuery] = useSuspenseQueries({
    queries: [
      { queryKey: ['user', userId], queryFn: () => fetchUser(userId) },
      { queryKey: ['posts', userId], queryFn: () => fetchPosts(userId) },
    ],
  });
  // hai truy vấn chạy song song, xong cả hai mới render
  return <Profile user={userQuery.data} posts={postsQuery.data} />;
}
```

### Optimistic update (v5 đơn giản hơn)

```tsx
// ❌ Tự quản lý cache cho optimistic update (phức tạp)
const mutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] });
    const previousTodos = queryClient.getQueryData(['todos']);
    queryClient.setQueryData(['todos'], (old) => [...old, newTodo]);
    return { previousTodos };
  },
  onError: (err, newTodo, context) => {
    queryClient.setQueryData(['todos'], context.previousTodos);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});

// ✅ v5: dùng variables cho optimistic UI
function TodoList() {
  const { data: todos } = useQuery(todosQueryOptions);
  const { mutate, variables, isPending } = useMutation({
    mutationFn: addTodo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  return (
    <ul>
      {todos?.map(todo => <TodoItem key={todo.id} todo={todo} />)}
      {/* hiện tạm todo đang thêm */}
      {isPending && <TodoItem todo={variables} isOptimistic />}
    </ul>
  );
}
```

### Thay đổi trường trạng thái trong v5

```tsx
// v4: isLoading là lần tải đầu hoặc các lần lấy sau
// v5: isPending là chưa có dữ liệu, isLoading = isPending && isFetching

const { data, isPending, isFetching, isLoading } = useQuery({...});

// isPending: cache chưa có dữ liệu (lần tải đầu)
// isFetching: đang request (kể cả refresh nền)
// isLoading: isPending && isFetching (đang tải lần đầu)

// ❌ Chuyển thẳng code v4
if (isLoading) return <Spinner />;  // trong v5 hành vi có thể khác

// ✅ Nêu rõ ý định
if (isPending) return <Spinner />;  // hiện loading khi chưa có dữ liệu
// hoặc
if (isLoading) return <Spinner />;  // đang tải lần đầu
```

## Checklist

### Quy tắc Hooks

- [ ] Hook gọi ở cấp cao nhất của component hoặc custom Hook.
- [ ] Không gọi Hook trong điều kiện hoặc vòng lặp.
- [ ] Mảng dependency của `useEffect` đầy đủ.
- [ ] `useEffect` có hàm cleanup (subscription, timer, request).
- [ ] Không dùng `useEffect` để tính state dẫn xuất.

### Tối ưu hiệu năng (vừa đủ)

- [ ] `useMemo`/`useCallback` chỉ dùng khi thật cần.
- [ ] `React.memo` đi kèm props có tham chiếu ổn định.
- [ ] Không khai báo component con bên trong component.
- [ ] Không tạo object, hàm mới trong JSX (trừ khi truyền cho component không memo).
- [ ] Danh sách dài dùng virtualization (react-window, react-virtual).

### Thiết kế component

- [ ] Component một trách nhiệm, không quá 200 dòng.
- [ ] Tách logic khỏi phần hiển thị (custom Hook).
- [ ] Interface props rõ ràng, dùng TypeScript.
- [ ] Tránh props drilling (cân nhắc Context hoặc composition).

### Quản lý state

- [ ] State đặt gần nơi dùng (phạm vi nhỏ nhất cần thiết).
- [ ] State phức tạp dùng `useReducer`.
- [ ] State toàn cục dùng Context hoặc thư viện state.
- [ ] Tránh state thừa (ưu tiên dẫn xuất hơn lưu trữ).

### Xử lý lỗi

- [ ] Vùng quan trọng có Error Boundary.
- [ ] Suspense đi cùng Error Boundary.
- [ ] Thao tác bất đồng bộ có xử lý lỗi.

### Server Components (RSC)

- [ ] `'use client'` chỉ dùng cho component cần tương tác.
- [ ] Server Component không dùng Hook hoặc event handler.
- [ ] Client Component đặt ở nút lá khi có thể.
- [ ] Lấy dữ liệu trong Server Component.

### Form React 19

- [ ] Dùng `useActionState` thay cho nhiều `useState`.
- [ ] `useFormStatus` gọi trong component con của form.
- [ ] Không dùng `useOptimistic` cho nghiệp vụ quan trọng (thanh toán...).
- [ ] Server Action đánh dấu đúng `'use server'`.

### Suspense và streaming

- [ ] Chia Suspense boundary theo trải nghiệm người dùng.
- [ ] Mỗi Suspense có Error Boundary tương ứng.
- [ ] Fallback có ý nghĩa (skeleton tốt hơn spinner).
- [ ] Tránh await dữ liệu chậm ở cấp layout.

### TanStack Query

- [ ] `queryKey` chứa mọi tham số ảnh hưởng dữ liệu.
- [ ] Đặt `staleTime` hợp lý (không để mặc định 0).
- [ ] `useSuspenseQuery` không dùng `enabled`.
- [ ] Mutation thành công thì invalidate truy vấn liên quan.
- [ ] Phân biệt `isPending` và `isLoading`.

### Test

- [ ] Dùng `@testing-library/react`.
- [ ] Truy vấn phần tử qua `screen`.
- [ ] Dùng `userEvent` thay `fireEvent`.
- [ ] Ưu tiên truy vấn `*ByRole`.
- [ ] Test hành vi, không test chi tiết implementation.

# Svelte / SvelteKit

Dùng khi review code Svelte 5 và SvelteKit: hệ reactivity Runes, ranh giới server/client, Form Actions, chuyển Store sang `$state`, chuyển cú pháp Svelte 4 sang 5, hiệu năng và bảo mật.

## Runes: `$state` / `$derived` / `$effect`

### Cách dùng `$state` cơ bản

```svelte
<!-- ❌ Dùng $state cho giá trị không bao giờ đổi -->
<script lang="ts">
  let config = $state({ timeout: 5000 });  // không cần reactive
  const API_URL = $state('/api');           // hằng số không cần $state
</script>

<!-- ✅ Khai báo hằng số trực tiếp -->
<script lang="ts">
  const config = { timeout: 5000 };
  const API_URL = '/api';

  // $state chỉ cho giá trị thay đổi
  let count = $state(0);
  let user = $state<User | null>(null);
</script>
```

### `$state.raw` cho object lớn

```svelte
<!-- ❌ Dữ liệu lớn bất biến dùng reactivity sâu -->
<script lang="ts">
  // dữ liệu bị proxy sâu, tốn chi phí
  let data = $state(hugeApiResponse);
</script>

<!-- ✅ $state.raw tránh proxy sâu -->
<script lang="ts">
  let data = $state.raw(hugeApiResponse);

  // chỉ kích hoạt cập nhật khi thay cả object
  async function refresh() {
    data = await fetchLatestData();  // ✅ kích hoạt reactivity
  }

  // ❌ sửa thuộc tính lồng không kích hoạt cập nhật
  // data.items[0].name = 'new';  // không render lại
</script>
```

### `$state.snapshot` khi đưa cho thư viện bên ngoài

```svelte
<!-- ❌ Đưa thẳng object $state cho thư viện ngoài -->
<script lang="ts">
  let state = $state({ x: 0, y: 0 });

  onMount(() => {
    // thư viện ngoài có thể không xử lý đúng object Proxy
    chartLibrary.update(state);  // state là Proxy
  });
</script>

<!-- ✅ $state.snapshot lấy bản sao object thường -->
<script lang="ts">
  let state = $state({ x: 0, y: 0 });

  onMount(() => {
    // $state.snapshot trả về object thường (Svelte 5)
    chartLibrary.update($state.snapshot(state));
  });
</script>
```

### Destructure `$state` làm mất reactivity

```svelte
<!-- ❌ Destructure object $state làm mất reactivity -->
<script lang="ts">
  let state = $state({ count: 0, name: 'Svelte' });
  let { count, name } = state;  // count và name là giá trị thường
</script>
<p>{count}</p>  <!-- ❌ không cập nhật khi state.count đổi -->

<!-- ✅ Truy cập trực tiếp thuộc tính $state -->
<script lang="ts">
  let state = $state({ count: 0, name: 'Svelte' });
</script>
<p>{state.count}</p>  <!-- ✅ vẫn reactive -->

<!-- ✅ Hoặc khai báo từng $state riêng -->
<script lang="ts">
  let count = $state(0);
  let name = $state('Svelte');
</script>
```

### Dùng `$derived` đúng cách

```svelte
<!-- ❌ Anti-pattern số 1: dùng $effect để đồng bộ state -->
<script lang="ts">
  let firstName = $state('John');
  let lastName = $state('Doe');
  let fullName = $state('');

  // không dùng $effect để đồng bộ state dẫn xuất
  $effect(() => {
    fullName = `${firstName} ${lastName}`;  // effect thừa
  });
</script>

<!-- ✅ Dùng $derived tính giá trị dẫn xuất -->
<script lang="ts">
  let firstName = $state('John');
  let lastName = $state('Doe');
  let fullName = $derived(`${firstName} ${lastName}`);
</script>
```

### `$derived` không được có side effect

```svelte
<!-- ❌ Side effect trong $derived -->
<script lang="ts">
  let items = $state<Item[]>([]);
  let count = $derived(() => {
    console.log('recalculating');  // side effect
    analytics.track('count', items.length);  // side effect
    return items.length;
  });
</script>

<!-- ✅ $derived chỉ để tính toán thuần -->
<script lang="ts">
  let items = $state<Item[]>([]);
  let count = $derived(items.length);

  // side effect đặt trong $effect
  $effect(() => {
    analytics.track('count', count);
  });
</script>
```

### Dùng `$effect` đúng cách

#### `$effect` hay `$derived`

```svelte
<!-- ❌ $effect để đồng bộ state (anti-pattern lớn nhất) -->
<script lang="ts">
  let searchQuery = $state('');
  let results = $state([]);

  $effect(() => {
    results = searchQuery ? items.filter(i => i.name.includes(searchQuery)) : items;
  });
</script>

<!-- ✅ Dùng $derived -->
<script lang="ts">
  let searchQuery = $state('');
  let results = $derived(
    searchQuery ? items.filter(i => i.name.includes(searchQuery)) : items
  );
</script>
```

#### Vòng lặp vô hạn

```svelte
<!-- ❌ Cập nhật chính phụ thuộc của mình trong $effect → lặp vô hạn -->
<script lang="ts">
  let count = $state(0);

  $effect(() => {
    console.log(count);
    count++;  // sửa phụ thuộc trong effect → lặp vô hạn
  });
</script>

<!-- ✅ Không sửa state đang được theo dõi trong $effect -->
<script lang="ts">
  let count = $state(0);
  let log = $state<string[]>([]);

  $effect(() => {
    // đọc count, ghi vào state khác
    log = [...log, `count is ${count}`];
  });
</script>
```

#### Hàm cleanup

```svelte
<!-- ❌ Thiếu hàm cleanup → rò rỉ bộ nhớ -->
<script lang="ts">
  let roomId = $state('');

  $effect(() => {
    const ws = new WebSocket(`ws://example.com/${roomId}`);
    ws.onmessage = (e) => {
      messages = [...messages, JSON.parse(e.data)];
    };
    // không dọn dẹp, WebSocket rò rỉ khi roomId đổi
  });
</script>

<!-- ✅ Trả về hàm cleanup -->
<script lang="ts">
  let roomId = $state('');

  $effect(() => {
    const ws = new WebSocket(`ws://example.com/${roomId}`);
    ws.onmessage = (e) => {
      messages = [...messages, JSON.parse(e.data)];
    };
    return () => ws.close();  // dọn dẹp khi chạy lại
  });
</script>

<!-- ✅ Dọn dẹp timer -->
<script lang="ts">
  $effect(() => {
    const id = setInterval(() => {
      console.log('tick');
    }, 1000);
    return () => clearInterval(id);
  });
</script>
```

#### Bẫy theo dõi trong `$effect` async

```svelte
<!-- ❌ State đọc sau await không được theo dõi -->
<script lang="ts">
  let userId = $state('1');
  let preference = $state('dark');

  $effect(async () => {
    const user = await fetchUser(userId);   // userId có được theo dõi
    const theme = preference;               // không được theo dõi (đọc sau await)
    applyTheme(user, theme);
  });
</script>

<!-- ✅ Đọc mọi phụ thuộc trước await -->
<script lang="ts">
  let userId = $state('1');
  let preference = $state('dark');

  $effect(async () => {
    const currentPref = preference;  // đọc trước await
    const user = await fetchUser(userId);
    applyTheme(user, currentPref);
  });
</script>
```

#### Loại phụ thuộc bằng `untrack`

```svelte
<!-- ❌ Vô tình theo dõi phụ thuộc không cần -->
<script lang="ts">
  let data = $state<Data | null>(null);
  let debugMode = $state(false);

  $effect(() => {
    if (debugMode) {  // debugMode thành phụ thuộc
      console.log('data changed', data);
    }
  });
</script>

<!-- ✅ untrack loại phụ thuộc không liên quan -->
<script lang="ts">
  import { untrack } from 'svelte';

  let data = $state<Data | null>(null);
  let debugMode = $state(false);

  $effect(() => {
    if (untrack(() => debugMode)) {  // debugMode không được theo dõi
      console.log('data changed', data);
    }
  });
</script>
```

## Hàm load (server và client)

### `+page.server.js` và `+page.js`

```typescript
// ❌ Truy cập CSDL hoặc secret trong +page.js
// src/routes/admin/+page.js
export async function load({ fetch }) {
  // universal load chạy cả trên server lẫn client
  const data = await db.query('SELECT * FROM users');  // trình duyệt không có db
  return { users: data };
}

// ✅ Logic server đặt trong +page.server.js
// src/routes/admin/+page.server.js
import { db } from '$lib/server/db';

export async function load() {
  const users = await db.query('SELECT * FROM users');
  return { users };
}
```

```typescript
// ✅ +page.js cho dữ liệu dùng được cả ở client (ví dụ gộp nhiều fetch)
// src/routes/dashboard/+page.js
export async function load({ fetch, parent }) {
  const [analytics, notifications] = await Promise.all([
    fetch('/api/analytics').then(r => r.json()),
    fetch('/api/notifications').then(r => r.json())
  ]);
  return { analytics, notifications };
}
```

### Waterfall do `await parent()`

```typescript
// ❌ await parent tuần tự → waterfall
// src/routes/blog/[slug]/+page.js
export async function load({ parent, fetch }) {
  const parentData = await parent();  // chờ parent
  const post = await fetch(`/api/posts/${parentData.blogId}`);
  return { post };
}

// ✅ Chạy song song khi được, bỏ await parent không cần thiết
// src/routes/blog/[slug]/+page.js
export async function load({ parent, fetch }) {
  // chỉ await parent khi thật sự cần dữ liệu của nó
  const post = await fetch('/api/posts/slug');
  return { post };
}

// ✅ Nếu thật sự cần dữ liệu parent thì không tránh được waterfall, nhưng ghi chú rõ
// src/routes/blog/[slug]/+page.js
export async function load({ parent, fetch }) {
  const { blogId } = await parent();  // bắt buộc: cần blogId để dựng URL bài viết
  const post = await fetch(`/api/posts/${blogId}`);
  return { post };
}
```

### Giá trị trả về không serialize được

```typescript
// ❌ Server load trả về giá trị không serialize được
// src/routes/api/+page.server.js
export async function load() {
  return {
    stream: fs.createReadStream('data.csv'),  // không serialize được
    callback: () => console.log('hi'),        // hàm không serialize được
    date: new Date(),                         // được: devalue serialize tốt Date/Map/Set
  };
}

// ✅ Chỉ trả về dữ liệu serialize được
// src/routes/api/+page.server.js
export async function load() {
  return {
    data: await readFile('data.csv', 'utf-8'),
    timestamp: Date.now(),
  };
}
```

## Form Actions

### Xử lý side effect bằng POST

```svelte
<!-- ❌ Dùng GET/hàm load cho side effect -->
<script lang="ts">
  import { goto } from '$app/navigation';

  async function deleteUser(id: string) {
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    goto('/users');  // side effect qua điều hướng phía client
  }
</script>
<button onclick={() => deleteUser(user.id)}>Delete</button>

<!-- ✅ Dùng form actions -->
```

```typescript
// src/routes/users/+page.server.js
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
  delete: async ({ request, locals }) => {
    const formData = await request.formData();
    const id = formData.get('id');

    if (!id) return fail(400, { message: 'Missing id' });

    await locals.db.users.delete(id);
    throw redirect(303, '/users');
  }
};
```

```svelte
<!-- form có progressive enhancement -->
<script lang="ts">
  import { enhance } from '$app/forms';
</script>

<form method="POST" action="?/delete" use:enhance>
  <input type="hidden" name="id" value={user.id} />
  <button type="submit">Delete</button>
</form>
```

### `fail()` không lộ thông tin nhạy cảm

```typescript
// ❌ fail() trả về thông tin nhạy cảm
// src/routes/login/+page.server.js
export const actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData();
    const user = await locals.db.users.findByEmail(formData.get('email'));

    return fail(401, {
      password: formData.get('password'),  // ❌ lộ mật khẩu trong page data
      hint: user.passwordHint,             // ❌ lộ dữ liệu nội bộ
    });
  }
};

// ✅ Chỉ trả về thông báo lỗi an toàn
export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email');

    return fail(401, {
      email,                    // ✅ trả lại an toàn
      incorrect: true,          // ✅ cờ lỗi chung chung
    });
  }
};
```

### Progressive enhancement với `use:enhance`

```svelte
<!-- ❌ Form không dùng use:enhance → chỉ có hành vi gốc như khi không có JS -->
<form method="POST" action="?/create">
  <input name="title" />
  <button type="submit">Create</button>
</form>

<!-- ✅ use:enhance cho trải nghiệm SPA + progressive enhancement -->
<script lang="ts">
  import { enhance } from '$app/forms';
</script>

<form method="POST" action="?/create" use:enhance={() => {
  return ({ update }) => {
    update({ reset: false });  // tùy chỉnh hành vi
  };
}}>
  <input name="title" />
  <button type="submit">Create</button>
</form>

<!-- ✅ Có trạng thái đang tải -->
<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    submitting = true;
    return ({ update }) => {
      update();
      submitting = false;
    };
  }}
>
  <button type="submit" disabled={submitting}>
    {submitting ? 'Creating...' : 'Create'}
  </button>
</form>
```

## Chuyển Store sang `$state`

### `writable`/`readable` → `$state`

```typescript
// ❌ Mẫu store kiểu cũ (Svelte 4)
// src/lib/stores/user.js
import { writable, derived } from 'svelte/store';

export const user = writable(null);
export const isLoggedIn = derived(user, $user => !!$user);

// dùng với tiền tố $
// $user = { name: 'John' };

// ✅ Svelte 5: state dùng chung trong file .svelte.js
// src/lib/stores/user.svelte.js
let currentUser = $state<User | null>(null);

export function getUser() {
  return currentUser;
}

export function setUser(user: User | null) {
  currentUser = user;
}

export function isLoggedIn() {
  return currentUser !== null;
}
```

### Cú pháp store tiền tố `$` là cú pháp cũ

```svelte
<!-- ❌ Tự subscribe store bằng tiền tố $ là mẫu cũ -->
<script lang="ts">
  import { count } from '$lib/stores/count';
  // $count là cú pháp cũ trong Svelte 5
</script>
<p>{$count}</p>

<!-- ✅ Mẫu runes của Svelte 5 -->
<script lang="ts">
  import { getCount } from '$lib/stores/count.svelte';

  let count = $derived(getCount());
</script>
<p>{count}</p>

<!-- ✅ Hoặc dùng thẳng getter reactive từ $state được export -->
<script lang="ts">
  // count.svelte.js export một tham chiếu reactive
  import { counter } from '$lib/stores/count.svelte';
</script>
<p>{counter.value}</p>
```

### Đuôi file `.svelte.js` / `.svelte.ts`

```typescript
// ❌ Dùng runes trong file .js thường → lỗi biên dịch
// src/lib/utils.js
let state = $state(0);  // runes chỉ chạy trong file .svelte.js

// ✅ Dùng đuôi .svelte.js
// src/lib/utils.svelte.js
let state = $state(0);

export function getState() {
  return state;
}

export function setState(val: number) {
  state = val;
}
```

## Ranh giới SSR và CSR

### Chế độ SPA `ssr = false`

```typescript
// ❌ Tắt SSR ở layout gốc → toàn bộ thành CSR
// src/routes/+layout.js
export const ssr = false;  // cả ứng dụng thành SPA

// ✅ Chỉ tắt SSR ở trang cần
// src/routes/admin/dashboard/+page.js
export const ssr = false;  // chỉ trang này bỏ SSR

// ✅ Tốt hơn: cấu hình theo route
// src/routes/editor/+page.js
export const ssr = false;  // editor cần API trình duyệt, bỏ SSR
```

### Biến toàn cục của trình duyệt khi SSR

```svelte
<!-- ❌ Truy cập API trình duyệt ở cấp cao nhất của module -->
<script lang="ts">
  const height = window.innerHeight;        // ReferenceError khi SSR
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');  // sập
</script>

<!-- ✅ Truy cập trong onMount hoặc sau khi kiểm tra browser -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let height = $state(0);

  onMount(() => {
    height = window.innerHeight;
  });

  // hoặc kiểm tra điều kiện
  const prefersDark = browser
    ? matchMedia('(prefers-color-scheme: dark)').matches
    : false;
</script>
```

### `prerender` xung đột với actions

```typescript
// ❌ Định nghĩa actions trong trang prerender → lỗi biên dịch
// src/routes/contact/+page.server.js
export const prerender = true;

export const actions = {
  // Lỗi: trang prerender không dùng được server-side form actions
  default: async ({ request }) => { /* ... */ }
};

// ✅ Trang prerender không dùng server actions
// src/routes/about/+page.server.js
export const prerender = true;
// không actions: trang tĩnh

// ✅ Trang cần actions thì không prerender
// src/routes/contact/+page.server.js
export const actions = {
  default: async ({ request }) => {
    // xử lý submit form
  }
};
```

## Chuyển câu lệnh reactive (Svelte 4 → 5)

### `$:` → `$derived` / `$effect`

```svelte
<!-- ❌ Câu lệnh reactive Svelte 4 -->
<script lang="ts">
  let count = 0;
  let doubled = 0;

  $: doubled = count * 2;              // gán reactive
  $: if (count > 10) console.log('big');
</script>

<!-- ✅ Runes Svelte 5 -->
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);   // giá trị dẫn xuất

  $effect(() => {
    if (count > 10) console.log('big');
  });
</script>
```

### `export let` → `$props()`

```svelte
<!-- ❌ Props Svelte 4 -->
<script lang="ts">
  export let title: string;
  export let count = 0;
</script>

<!-- ✅ $props() Svelte 5 -->
<script lang="ts">
  let { title, count = 0 }: { title: string; count?: number } = $props();
</script>
```

### `on:click` → `onclick`

```svelte
<!-- ❌ Sự kiện dạng directive Svelte 4 -->
<button on:click={handleClick}>Click</button>
<button on:click={() => count++}>Increment</button>

<!-- ✅ Sự kiện dạng thuộc tính HTML Svelte 5 -->
<button onclick={handleClick}>Click</button>
<button onclick={() => count++}>Increment</button>
```

### `createEventDispatcher` → callback props

```svelte
<!-- ❌ Dispatch event Svelte 4 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleDelete() {
    dispatch('delete', { id: 42 });
  }
</script>

<!-- ✅ Callback props Svelte 5 -->
<script lang="ts">
  let { ondelete }: { ondelete?: (e: { id: number }) => void } = $props();

  function handleDelete() {
    ondelete?.({ id: 42 });
  }
</script>

<!-- cách dùng ở component cha -->
<Child ondelete={(e) => removeItem(e.id)} />
```

### `slot` → `@render children()`

```svelte
<!-- ❌ Slot Svelte 4 -->
<!-- Card.svelte -->
<div class="card">
  <slot />
</div>

<!-- ✅ Snippet Svelte 5 -->
<!-- Card.svelte -->
<script lang="ts">
  let { children } = $props();
</script>
<div class="card">
  {@render children()}
</div>

<!-- slot có tên → snippet có tên -->
<!-- Layout.svelte -->
<script lang="ts">
  let { header, children, footer } = $props();
</script>
<div>
  <header>{@render header?.()}</header>
  <main>{@render children()}</main>
  <footer>{@render footer?.()}</footer>
</div>

<!-- cách dùng ở component cha -->
<Layout>
  {#snippet header()}<h1>Title</h1>{/snippet}
  <p>Body content</p>
  {#snippet footer()}<p>Footer</p>{/snippet}
</Layout>
```

### `beforeUpdate` / `afterUpdate` → `$effect.pre`

```svelte
<!-- ❌ Lifecycle hook Svelte 4 -->
<script lang="ts">
  import { beforeUpdate, afterUpdate } from 'svelte';

  let count = 0;

  beforeUpdate(() => {
    console.log('about to update', count);
  });

  afterUpdate(() => {
    console.log('updated', count);
    document.title = `Count: ${count}`;
  });
</script>

<!-- ✅ $effect và $effect.pre Svelte 5 -->
<script lang="ts">
  let count = $state(0);

  // $effect.pre chạy trước khi cập nhật DOM (như beforeUpdate)
  $effect.pre(() => {
    console.log('about to update', count);
  });

  // $effect chạy sau khi cập nhật DOM (như afterUpdate)
  $effect(() => {
    console.log('updated', count);
    document.title = `Count: ${count}`;
  });
</script>
```

## Hiệu năng

### `$state.raw` cho dữ liệu lớn bất biến

```svelte
<!-- ❌ Proxy sâu dữ liệu lớn bất biến -->
<script lang="ts">
  let searchResults = $state(largeResultArray);  // proxy sâu trên từng phần tử
</script>

<!-- ✅ $state.raw tránh proxy sâu -->
<script lang="ts">
  let searchResults = $state.raw<SearchResult[]>([]);

  async function search(query: string) {
    searchResults = await fetchResults(query);  // thay cả mảng
  }
</script>
```

### `{#each}` có key

```svelte
<!-- ❌ each không key → DOM diff kém hiệu quả -->
{#each items as item}
  <div>{item.name}</div>
{/each}

<!-- ✅ each có key duy nhất -->
{#each items as item (item.id)}
  <div>{item.name}</div>
{/each}

<!-- ✅ key ghép -->
{#each items as item (`${item.category}-${item.id}`)}
  <div>{item.name}</div>
{/each}
```

### Streaming và Promise trong load

```typescript
// ❌ Chờ tuần tự mọi dữ liệu → trang bị chặn
// src/routes/+page.server.js
export async function load({ params }) {
  const posts = await getPosts();       // chậm
  const comments = await getComments(); // chậm
  const tags = await getTags();         // chậm
  return { posts, comments, tags };
}

// ✅ Tải song song dữ liệu độc lập
export async function load({ params }) {
  return {
    posts: getPosts(),       // trả thẳng promise để stream
    comments: getComments(),
    tags: getTags(),
  };
}
```

```svelte
<!-- stream trong template bằng {#await} -->
{#await data.posts}
  <p>Loading posts...</p>
{:then posts}
  <ul>
    {#each posts as post (post.id)}
      <li>{post.title}</li>
    {/each}
  </ul>
{:catch error}
  <p>Failed to load posts: {error.message}</p>
{/await}
```

## Bảo mật

Svelte/SvelteKit tự escape biểu thức trong template. Trọng tâm review: chỗ dùng `{@html}`, lộ `$env/static/private`, cơ chế chống CSRF có sẵn.

Phòng XSS chung cho nhiều framework (ví dụ React, Vue, Angular, Svelte và cấu hình CSP) nằm trong [xss.md](../xss.md).

### Không lộ biến môi trường riêng

```typescript
// ❌ Lộ secret phía server trong universal load
// src/routes/admin/+page.js (universal: chạy cả ở client)
export async function load() {
  return {
    apiKey: process.env.SECRET_API_KEY,    // lộ vào bundle client
    dbUrl: import.meta.env.DATABASE_URL,    // lộ ra trình duyệt
  };
}

// ✅ Biến môi trường riêng chỉ dùng trong server load
// src/routes/admin/+page.server.js (chỉ server)
export async function load({ locals }) {
  // secret ở lại server
  const data = await fetch(process.env.SECRET_API_KEY + '/admin');
  return { data };  // chỉ gửi dữ liệu dẫn xuất về client
}

// ✅ Biến công khai dùng tiền tố PUBLIC_
// .env
// PUBLIC_API_URL=https://api.example.com
// SECRET_API_KEY=xxx  (không có PUBLIC_ = chỉ server)
```

### Cô lập code server trong `$lib/server/`

```typescript
// ❌ Code server đặt ở chỗ client import được
// src/lib/db.js
import { SECRET_DB_URL } from '$env/static/private';
// component client nào import file này cũng lấy được secret

// ✅ Đặt trong $lib/server/ → client import thì lỗi biên dịch
// src/lib/server/db.js
import { SECRET_DB_URL } from '$env/static/private';

export async function query(sql: string) {
  // an toàn: client không import được từ $lib/server/
}

// chỉ dùng trong file server
// src/routes/api/users/+server.js
import { query } from '$lib/server/db';
```

### Chống CSRF có sẵn

```typescript
// ✅ SvelteKit có sẵn chống CSRF
// Header Origin được kiểm tra tự động cho POST/PUT/DELETE/PATCH
// Form actions không cần thêm CSRF token

// ❌ Không tắt kiểm tra CSRF (trừ khi có lý do đủ mạnh)
// svelte.config.js
export default {
  kit: {
    // không làm thế này nếu chưa hiểu hệ quả
    // csrf: { checkOrigin: false },
  },
};
```

### Cấu hình cookie an toàn

```typescript
// ❌ Cấu hình cookie không an toàn
// src/hooks.server.js
export async function handle({ event, resolve }) {
  const token = event.cookies.get('session');
  // cookie thiếu cờ httpOnly, secure, sameSite
  event.cookies.set('session', token, {
    path: '/',
    // thiếu: httpOnly, secure, sameSite
  });
}

// ✅ Cấu hình cookie an toàn
import { dev } from '$app/environment';

event.cookies.set('session', token, {
  path: '/',
  httpOnly: true,          // JS không đọc được
  secure: !dev,            // chỉ HTTPS ở production
  sameSite: 'lax',         // chống CSRF
  maxAge: 60 * 60 * 24 * 7 // 1 tuần, hạn dùng tường minh
});
```

## Checklist

### Runes: `$state` / `$derived` / `$effect`

- [ ] `$state` chỉ dùng cho giá trị thay đổi, hằng số khai báo trực tiếp
- [ ] Dữ liệu lớn bất biến dùng `$state.raw`
- [ ] Không destructure object `$state` (mất reactivity)
- [ ] Đưa cho thư viện ngoài bằng `$state.snapshot` (object thường)
- [ ] `$derived` không có side effect
- [ ] Không dùng `$effect` thay `$derived` để đồng bộ state
- [ ] `$effect` không sửa state đang được theo dõi (tránh lặp vô hạn)
- [ ] `$effect` có hàm cleanup (subscription, timer, WebSocket)
- [ ] `$effect` async đọc mọi state cần theo dõi trước `await`
- [ ] Dùng `untrack` để loại phụ thuộc không liên quan

### Hàm load

- [ ] Logic server đặt trong `+page.server.js` (không phải `+page.js`)
- [ ] Tránh waterfall `await parent()` không cần thiết
- [ ] Dữ liệu độc lập tải song song (`Promise.all` hoặc trả thẳng Promise)
- [ ] Server load chỉ trả về dữ liệu serialize được

### Form Actions

- [ ] Thao tác có side effect (thêm, xóa, sửa) dùng form actions + POST
- [ ] `fail()` không trả về thông tin nhạy cảm (mật khẩu, dữ liệu nội bộ)
- [ ] Dùng `use:enhance` cho progressive enhancement

### Chuyển Store

- [ ] `writable`/`readable` → `$state` trong file `.svelte.js`
- [ ] Không dùng runes trong file `.js` thường
- [ ] Không dùng cú pháp store tiền tố `$` kiểu cũ

### Ranh giới SSR và CSR

- [ ] Không tắt SSR toàn cục ở layout gốc
- [ ] API trình duyệt (`window`, `document`) dùng trong `onMount` hoặc sau kiểm tra `browser`
- [ ] Trang prerender không có server actions

### Chuyển Svelte 4 → 5

- [ ] `$:` → `$derived` / `$effect`
- [ ] `export let` → `$props()`
- [ ] `on:click` → `onclick`
- [ ] `createEventDispatcher` → callback props
- [ ] `slot` → `@render children()`
- [ ] `beforeUpdate`/`afterUpdate` → `$effect.pre` / `$effect`

### Hiệu năng

- [ ] Dữ liệu lớn bất biến dùng `$state.raw`
- [ ] `{#each}` có key duy nhất
- [ ] Hàm load trả về Promise để stream
- [ ] Dữ liệu độc lập tải song song

### Bảo mật

- [ ] Biến môi trường riêng chỉ dùng trong server load
- [ ] Code server đặt trong `$lib/server/`
- [ ] Không tắt chống CSRF có sẵn
- [ ] Cookie đặt `httpOnly`, `secure`, `sameSite`
- [ ] Server load không lộ secret và dữ liệu nội bộ

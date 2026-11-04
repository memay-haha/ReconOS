# TypeScript và JavaScript

Dùng khi review code TypeScript hoặc JavaScript: hệ thống kiểu, generic, kiểu nâng cao, chế độ strict, async/await, immutability, ESLint, test, phân giải module và tính năng TS 4.9+/5.x.

## Nền tảng an toàn kiểu

### Tránh `any`

```typescript
// ❌ any vô hiệu hóa kiểm tra kiểu
function processData(data: any) {
  return data.value;  // không kiểm tra kiểu, có thể sập lúc chạy
}

// ✅ Khai báo kiểu đúng
interface DataPayload {
  value: string;
}
function processData(data: DataPayload) {
  return data.value;
}

// ✅ Kiểu chưa biết: dùng unknown kèm type guard
function processUnknown(data: unknown) {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return (data as { value: string }).value;
  }
  throw new Error('Invalid data');
}
```

### Thu hẹp kiểu

```typescript
// ❌ Ép kiểu không an toàn
function getLength(value: string | string[]) {
  return (value as string[]).length;  // sai khi value là string
}

// ✅ Dùng type guard
function getLength(value: string | string[]): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return value.length;
}

// ✅ Dùng toán tử in
interface Dog { bark(): void }
interface Cat { meow(): void }

function speak(animal: Dog | Cat) {
  if ('bark' in animal) {
    animal.bark();
  } else {
    animal.meow();
  }
}
```

### Kiểu literal và `as const`

```typescript
// ❌ Kiểu quá rộng
const config = {
  endpoint: '/api',
  method: 'GET'  // kiểu là string
};

// ✅ as const cho kiểu literal
const config = {
  endpoint: '/api',
  method: 'GET'
} as const;  // method có kiểu 'GET'

// ✅ Truyền vào tham số hàm
function request(method: 'GET' | 'POST', url: string) { ... }
request(config.method, config.endpoint);  // hợp lệ
```

## Mẫu generic

### Generic cơ bản

```typescript
// ❌ Lặp code
function getFirstString(arr: string[]): string | undefined {
  return arr[0];
}
function getFirstNumber(arr: number[]): number | undefined {
  return arr[0];
}

// ✅ Dùng generic
function getFirst<T>(arr: T[]): T | undefined {
  return arr[0];
}
```

### Ràng buộc generic

```typescript
// ❌ Generic không ràng buộc, không truy cập được thuộc tính
function getProperty<T>(obj: T, key: string) {
  return obj[key];  // Error: không index được
}

// ✅ Ràng buộc bằng keyof
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'Alice', age: 30 };
getProperty(user, 'name');  // kiểu trả về string
getProperty(user, 'age');   // kiểu trả về number
getProperty(user, 'foo');   // Error: 'foo' không thuộc keyof User
```

### Giá trị mặc định của generic

```typescript
// ✅ Cho kiểu mặc định hợp lý
interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  message: string;
}

// Có thể bỏ tham số generic
const response: ApiResponse = { data: null, status: 200, message: 'OK' };
// Hoặc chỉ định
const userResponse: ApiResponse<User> = { ... };
```

### Utility type có sẵn

```typescript
// ✅ Dùng utility type có sẵn
interface User {
  id: number;
  name: string;
  email: string;
}

type PartialUser = Partial<User>;         // mọi thuộc tính tùy chọn
type RequiredUser = Required<User>;       // mọi thuộc tính bắt buộc
type ReadonlyUser = Readonly<User>;       // mọi thuộc tính chỉ đọc
type UserKeys = keyof User;               // 'id' | 'name' | 'email'
type NameOnly = Pick<User, 'name'>;       // { name: string }
type WithoutId = Omit<User, 'id'>;        // { name: string; email: string }
type UserRecord = Record<string, User>;   // { [key: string]: User }
```

## Kiểu nâng cao

### Conditional type

```typescript
// ✅ Trả kiểu khác nhau theo kiểu đầu vào
type IsString<T> = T extends string ? true : false;

type A = IsString<string>;  // true
type B = IsString<number>;  // false

// ✅ Lấy kiểu phần tử mảng
type ElementType<T> = T extends (infer U)[] ? U : never;

type Elem = ElementType<string[]>;  // string

// ✅ Lấy kiểu trả về của hàm (có sẵn ReturnType)
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
```

### Mapped type

```typescript
// ✅ Biến đổi mọi thuộc tính của kiểu object
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

interface User {
  name: string;
  age: number;
}

type NullableUser = Nullable<User>;
// { name: string | null; age: number | null }

// ✅ Thêm tiền tố cho tên khóa
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type UserGetters = Getters<User>;
// { getName: () => string; getAge: () => number }
```

### Template literal type

```typescript
// ✅ Tên sự kiện an toàn kiểu
type EventName = 'click' | 'focus' | 'blur';
type HandlerName = `on${Capitalize<EventName>}`;
// 'onClick' | 'onFocus' | 'onBlur'

// ✅ Kiểu route API
type ApiRoute = `/api/${string}`;
const route: ApiRoute = '/api/users';  // OK
const badRoute: ApiRoute = '/users';   // Error
```

### Discriminated union

```typescript
// ✅ Dùng thuộc tính phân biệt để an toàn kiểu
type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

function handleResult(result: Result<User, Error>) {
  if (result.success) {
    console.log(result.data.name);  // TypeScript biết có data
  } else {
    console.log(result.error.message);  // TypeScript biết có error
  }
}

// ✅ Mẫu Redux Action
type Action =
  | { type: 'INCREMENT'; payload: number }
  | { type: 'DECREMENT'; payload: number }
  | { type: 'RESET' };

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case 'INCREMENT':
      return state + action.payload;  // biết kiểu payload
    case 'DECREMENT':
      return state - action.payload;
    case 'RESET':
      return 0;  // nhánh này không có payload
  }
}
```

## Cấu hình strict

### `tsconfig.json` khuyến nghị

```json
{
  "compilerOptions": {
    // ✅ Tùy chọn strict bắt buộc bật
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,

    // ✅ Nên bật thêm
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

### Tác động của `noUncheckedIndexedAccess`

```typescript
// tsconfig: "noUncheckedIndexedAccess": true

const arr = [1, 2, 3];
const first = arr[0];  // kiểu number | undefined

// ❌ Dùng thẳng có thể lỗi
console.log(first.toFixed(2));  // Error: có thể undefined

// ✅ Kiểm tra trước
if (first !== undefined) {
  console.log(first.toFixed(2));
}

// ✅ Hoặc non-null assertion khi chắc chắn
console.log(arr[0]!.toFixed(2));
```

## Xử lý bất đồng bộ

### Xử lý lỗi Promise

```typescript
// ❌ Hàm async không xử lý lỗi
async function fetchUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();  // lỗi mạng, lỗi HTTP không xử lý
}

// ✅ Xử lý lỗi đầy đủ
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
    throw error;
  }
}
```

### `Promise.all` và `Promise.allSettled`

```typescript
// ❌ Promise.all: một promise lỗi thì cả nhóm lỗi
async function fetchAllUsers(ids: string[]) {
  const users = await Promise.all(ids.map(fetchUser));
  return users;
}

// ✅ Promise.allSettled lấy đủ mọi kết quả
async function fetchAllUsers(ids: string[]) {
  const results = await Promise.allSettled(ids.map(fetchUser));

  const users: User[] = [];
  const errors: Error[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      users.push(result.value);
    } else {
      errors.push(result.reason);
    }
  }

  return { users, errors };
}
```

### Race condition

```typescript
// ❌ Request cũ có thể ghi đè kết quả request mới
function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    fetch(`/api/search?q=${query}`)
      .then(r => r.json())
      .then(setResults);  // request cũ có thể về sau
  }, [query]);
}

// ✅ Dùng AbortController
function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/search?q=${query}`, { signal: controller.signal })
      .then(r => r.json())
      .then(setResults)
      .catch(e => {
        if (e.name !== 'AbortError') throw e;
      });

    return () => controller.abort();
  }, [query]);
}
```

## Immutability

### `Readonly` và `ReadonlyArray`

```typescript
// ❌ Tham số có thể bị sửa ngoài ý muốn
function processUsers(users: User[]) {
  users.sort((a, b) => a.name.localeCompare(b.name));  // sửa mảng gốc
  return users;
}

// ✅ readonly chặn sửa
function processUsers(users: readonly User[]): User[] {
  return [...users].sort((a, b) => a.name.localeCompare(b.name));
}

// ✅ Chỉ đọc sâu
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};
```

### Tham số hàm bất biến

```typescript
// ✅ Bảo vệ dữ liệu bằng as const và readonly
function createConfig<T extends readonly string[]>(routes: T) {
  return routes;
}

const routes = createConfig(['home', 'about', 'contact'] as const);
// kiểu readonly ['home', 'about', 'contact']
```

## Quy tắc ESLint

### Quy tắc `@typescript-eslint` khuyến nghị

```javascript
// eslint.config.js (flat config, typescript-eslint v8)
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  // Bộ quy tắc cần thông tin kiểu, thay recommended-requiring-type-checking cũ
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Quy tắc có kiểu tự tìm tsconfig tương ứng
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ✅ An toàn kiểu
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // ✅ Thực hành tốt
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // ✅ Phong cách code
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
);
```

### Sửa lỗi ESLint thường gặp

```typescript
// ❌ no-floating-promises: Promise phải được xử lý
async function save() { ... }
save();  // Error: Promise chưa xử lý

// ✅ Xử lý tường minh
await save();
// hoặc
save().catch(console.error);
// hoặc bỏ qua có chủ đích
void save();

// ❌ no-misused-promises: không dùng Promise ở chỗ không phải async
const items = [1, 2, 3];
items.forEach(async (item) => {  // Error
  await processItem(item);
});

// ✅ Dùng for...of
for (const item of items) {
  await processItem(item);
}
// hoặc Promise.all
await Promise.all(items.map(processItem));
```

## Test

### Chọn Vitest hay Jest

```typescript
// ✅ Dự án mới: nên dùng Vitest (tích hợp Vite, hỗ trợ ESM gốc)
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});

// ✅ Dự án đang dùng Jest có thể giữ, chú ý khác biệt cấu hình
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
export default config;
```

### Test kiểu (tsd, expect-type)

```typescript
// ✅ Kiểm tra suy luận kiểu bằng expect-type
import { expectTypeOf } from 'vitest';

function getFirst<T>(arr: T[]): T | undefined {
  return arr[0];
}

it('should infer correct return type', () => {
  const result = getFirst([1, 2, 3]);
  expectTypeOf(result).toEqualTypeOf<number | undefined>();
});

// ✅ Kiểm tra chữ ký hàm
const fn = (a: string, b: number) => a.repeat(b);
expectTypeOf(fn).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(fn).returns.toBeString();

// ❌ Sai kiểu bị bắt lúc biên dịch
const result = getFirst(['a', 'b']);
// @ts-expect-error: kiểu không khớp
expectTypeOf(result).toEqualTypeOf<number>();
```

### Snapshot test

```typescript
// ✅ Snapshot hợp với: cấu trúc đầu ra ổn định, object cấu hình, thông báo lỗi
it('should match serialized config', () => {
  const config = createAppConfig();
  expect(config).toMatchSnapshot();
});

// ❌ Tránh: object lớn, dữ liệu động, giá trị ngẫu nhiên
it('should not snapshot large payloads', () => {
  const hugePayload = { users: generateRandomUsers(1000) };
  // snapshot quá dài khó review, khi đổi không rõ ý định
});

// ✅ Đoạn nhỏ: dùng inline snapshot
it('should generate correct error message', () => {
  expect(formatError('INVALID_INPUT')).toMatchInlineSnapshot(
    `"Error: Invalid input provided"`
  );
});

// ✅ Giá trị động: dùng property matcher của snapshot
it('should match user with generated id', () => {
  expect(createUser('Alice')).toMatchSnapshot({
    id: expect.any(String),
    createdAt: expect.any(Date),
  });
});
```

### Chiến lược mock

```typescript
// ✅ Vitest: vi.mock tự hoist
import { vi, describe, it, expect } from 'vitest';

vi.mock('./api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
}));

it('should display user', async () => {
  const { fetchUser } = await import('./api');
  const user = await fetchUser('1');
  expect(user.name).toBe('Alice');
});

// ✅ Jest: jest.mock cũng tự hoist
jest.mock('./database', () => ({
  query: jest.fn().mockResolvedValue([{ id: 1 }]),
}));

// ❌ Tránh mock một phần: test đang kiểm mock chứ không kiểm hành vi thật
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  calculateTotal: jest.fn(), // các hàm khác là thật, riêng hàm này giả
}));
```

### Công cụ hỗ trợ test

```typescript
// ✅ Test DOM bằng testing-library
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('should submit form', async () => {
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getByText('Welcome, Alice!')).toBeInTheDocument();
});

// ✅ Mock API bằng MSW (Mock Service Worker)
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, name: 'Alice' });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Phân giải module

### Khác biệt và bẫy giữa ESM và CJS

```typescript
// ❌ Cú pháp CJS không chạy trong ESM
// package.json: "type": "module"
const fs = require('fs');           // Error: require is not defined
module.exports = { foo: 'bar' };    // Error: module is not defined

// ✅ Cú pháp ESM đúng
import fs from 'node:fs';
export const foo = 'bar';

// ✅ Lấy __dirname trong ESM
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ❌ require động trong ESM
const moduleName = 'lodash';
const _ = require(moduleName); // Error

// ✅ import động trong ESM
const _ = await import(moduleName);
```

### `paths` trong tsconfig và alias đường dẫn

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@utils/*": ["./src/utils/*"]
    }
  }
}
```

```typescript
// Trước khi dùng alias
import { Button } from '../../components/ui/Button';
import { formatDate } from '../../../utils/date';

// ✅ Sau khi dùng alias: rõ ràng, không gãy khi chuyển file
import { Button } from '@components/ui/Button';
import { formatDate } from '@utils/date';
```

```typescript
// ⚠️ paths trong tsconfig chỉ tác động lúc biên dịch TS, không tác động lúc chạy
// Cần bundler (Vite, webpack) hoặc tsx phân giải alias

// vite.config.ts
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});

// ⚠️ Khi phát hành gói npm, paths không tự phân giải
// Cần tsc-alias hoặc tsconfig-paths
```

### Trường `exports` trong `package.json`

```json
// package.json
{
  "name": "my-library",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./utils": {
      "import": "./dist/utils.mjs",
      "require": "./dist/utils.cjs",
      "types": "./dist/utils.d.ts"
    },
    "./*": "./dist/*"
  }
}
```

```typescript
// ✅ Phía dùng gói
import { foo } from 'my-library';        // phân giải theo "."
import { bar } from 'my-library/utils';   // phân giải theo "./utils"

// ❌ Đường dẫn không có trong exports thì không truy cập được
import { secret } from 'my-library/internal'; // Error
```

### `import()` động và tách code

```typescript
// ✅ Nạp module có điều kiện
async function loadChartLibrary() {
  if (typeof window === 'undefined') return null; // bỏ qua khi SSR
  const { Chart } = await import('chart.js');
  return Chart;
}

// ✅ Lazy load component React
const AdminPanel = lazy(() => import('./AdminPanel'));
// dùng cùng Suspense
<Suspense fallback={<Loading />}>
  <AdminPanel />
</Suspense>

// ✅ Có xử lý lỗi
const AdminPanel = lazy(() =>
  import('./AdminPanel').catch(() => ({
    default: () => <ErrorFallback />,
  }))
);
```

## Tính năng TS 4.9+ và 5.x

### Từ khóa `satisfies` (TS 4.9+)

```typescript
// ❌ Không có satisfies: kiểu quá rộng
const palette = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
};
// palette.red có kiểu string, mất giá trị chính xác '#ff0000'

// ✅ satisfies giữ kiểu literal và vẫn kiểm cấu trúc
const palette = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
} satisfies Record<string, `#${string}`>;

// palette.red có kiểu '#ff0000' (không phải string)
// thêm thuộc tính mới vẫn bị kiểm định dạng
```

```typescript
// ✅ satisfies kiểm object khớp interface
interface UserConfig {
  theme: 'light' | 'dark';
  locale: string;
}

const config = {
  theme: 'dark',
  locale: 'en-US',
} satisfies UserConfig;
// config.theme có kiểu 'dark' (không phải 'light' | 'dark')
// mọi thuộc tính đều qua kiểm tra của satisfies
```

### Tham số kiểu `const` (TS 5.0+)

```typescript
// ❌ Trước đây: cần as const
function getRoutes<T extends readonly string[]>(routes: T) {
  return routes;
}
const routes = getRoutes(['home', 'about'] as const);

// ✅ TS 5.0+: tham số kiểu const
function getRoutes<const T extends readonly string[]>(routes: T) {
  return routes;
}
const routes = getRoutes(['home', 'about']);
// routes có kiểu readonly ['home', 'about']
```

```typescript
// ✅ Thực tế: object cấu hình an toàn kiểu
declare function createConfig<const T extends Record<string, unknown>>(
  config: T
): T;

const config = createConfig({
  api: { url: 'https://api.example.com', version: 2 },
  features: { newDashboard: true },
});
// config.api.url có kiểu literal 'https://api.example.com'
```

### Decorator Stage 3 (TS 5.0+)

```typescript
// ✅ Decorator Stage 3 (TS 5.0+, không cần experimentalDecorators)
function logged<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext
) {
  return function (this: This, ...args: Args): Return {
    console.log(`Calling ${String(context.name)} with`, args);
    return target.apply(this, args);
  };
}

class Calculator {
  @logged
  add(a: number, b: number): number {
    return a + b;
  }
}

// Output: Calling add with [1, 2]
new Calculator().add(1, 2);
```

```typescript
// ⚠️ Decorator Stage 3 khác experimentalDecorators cũ
// Bản cũ: cần "experimentalDecorators": true trong tsconfig
// Bản mới (TS 5.0+): hỗ trợ mặc định, không cần cấu hình

// ❌ Chữ ký decorator cũ (vẫn chạy nhưng là legacy)
function deprecated<T extends { new (...args: any[]): {} }>(constructor: T) {
  return class extends constructor { /* ... */ };
}

// ✅ Decorator mới phân biệt theo kiểu context
function sealed<T extends { new (...args: any[]): {} }>(
  target: T,
  context: ClassDecoratorContext
) {
  // context.kind === 'class'
}
```

### Khai báo `using` (quản lý tài nguyên tường minh, TS 5.2+)

```typescript
// ✅ Tự dọn dẹp bằng Symbol.dispose
class TempFile implements Disposable {
  private path: string;

  constructor() {
    this.path = `/tmp/file-${Date.now()}`;
  }

  write(data: string) { /* ... */ }

  [Symbol.dispose]() {
    // tự dọn dù hàm thoát bình thường hay do exception
    fs.unlinkSync(this.path);
    console.log(`Cleaned up: ${this.path}`);
  }
}

function processFile() {
  using file = new TempFile(); // khai báo using
  file.write('data');
  // hết phạm vi thì tự gọi file[Symbol.dispose]()
}
```

```typescript
// ✅ AsyncDisposable cho tài nguyên bất đồng bộ (TS 5.2+)
class DatabaseConnection implements AsyncDisposable {
  private db: sqlite3.Database;

  async connect() {
    this.db = new sqlite3.Database(':memory:');
  }

  async [Symbol.asyncDispose]() {
    await this.db.close();
  }
}

async function query() {
  await using conn = new DatabaseConnection(); // await using
  await conn.connect();
  // hết phạm vi thì tự await conn[Symbol.asyncDispose]()
}
```

### Cải tiến enum (TS 5.0+)

```typescript
// ✅ Mọi enum giờ là union enum (TS 5.0+)
enum Color {
  Red = 'RED',
  Green = 'GREEN',
}

// Trước: Color dùng làm kiểu thì hành vi không nhất quán
// Nay: Color là union của các literal chuỗi, suy luận kiểu tốt hơn
const color: Color = Color.Red;
```

## Checklist

### Hệ thống kiểu

- [ ] Không dùng `any` (thay bằng `unknown` kèm type guard).
- [ ] Interface và type đầy đủ, đặt tên có nghĩa.
- [ ] Dùng generic để tái sử dụng code.
- [ ] Union type được thu hẹp kiểu đúng.
- [ ] Dùng utility type (`Partial`, `Pick`, `Omit`...).

### Generic

- [ ] Generic có ràng buộc phù hợp (`extends`).
- [ ] Tham số generic có giá trị mặc định hợp lý.
- [ ] Không generic hóa quá mức (nguyên tắc KISS).

### Chế độ strict

- [ ] `tsconfig.json` bật `strict: true`.
- [ ] Bật `noUncheckedIndexedAccess`.
- [ ] Không dùng `@ts-ignore` (dùng `@ts-expect-error`).

### Code bất đồng bộ

- [ ] Hàm async có xử lý lỗi.
- [ ] Promise rejection được xử lý.
- [ ] Không có floating promise (Promise không ai xử lý).
- [ ] Request đồng thời dùng `Promise.all` hoặc `Promise.allSettled`.
- [ ] Race condition xử lý bằng `AbortController`.

### Immutability

- [ ] Không sửa trực tiếp tham số hàm.
- [ ] Tạo object, mảng mới bằng spread.
- [ ] Cân nhắc modifier `readonly`.

### ESLint

- [ ] Dùng `@typescript-eslint/recommended`.
- [ ] Không còn cảnh báo hoặc lỗi ESLint.
- [ ] Dùng `consistent-type-imports`.

# Đợt 2b: Giao diện tài khoản và phân quyền, kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng nhập bằng tài khoản thật trên S01, quản lý tài khoản và xem nhật ký thao tác trên S12, đóng đợt 2.

**Architecture:** Next.js chỉ hiển thị và gọi API. Trình duyệt chỉ nói chuyện với origin của Next, còn Next chuyển tiếp `/api/*` sang Backend API, nhờ vậy `Origin` luôn khớp `RECONOS_PUBLIC_ORIGIN` và cookie `SameSite=Lax` gửi kèm. Một bộ tên token màu dùng cho cả hai theme: `@theme` giữ giá trị sáng, khối `[data-theme="dark"]` ghi đè. Server component ở layout kiểm tra phiên, phần còn lại là client component lấy dữ liệu qua hook TanStack Query trong `src/lib/`.

**Tech Stack:** TypeScript, Next.js 16, React 19, Tailwind CSS 4, TanStack Query 5, TanStack Table 8, Vitest, Testing Library, Playwright. Phần backend: Python 3.15, FastAPI, SQLAlchemy 2 async.

**Spec:** [2026-11-04-batch2b-frontend-design.md](../specs/2026-11-04-batch2b-frontend-design.md)

## Global Constraints

- Đặc tả là tài liệu trong `docs/`. Gặp chỗ chưa có quyết định hoặc tài liệu mâu thuẫn: dừng, hỏi người dùng, không tự chọn.
- Comment, docstring, thông báo lỗi, commit message viết tiếng Anh. Chữ hiển thị trên giao diện viết tiếng Việt.
- Bật `strict` trong TypeScript. ❌ Không dùng kiểu `any`.
- ❌ Không đặt nghiệp vụ trong frontend: kiểm tra scope, kiểm tra quyền, tính trạng thái. Ẩn nút theo vai trò chỉ để tiện dùng, không thay cho kiểm tra quyền ở backend.
- ❌ Không gọi `fetch` trực tiếp trong component, không gọi API trong `useEffect`. Gọi Backend API chỉ qua client trong `src/lib/`.
- ❌ Không dùng `dangerouslySetInnerHTML`.
- Component trong `src/components/` chỉ nhận dữ liệu qua props, không gọi API.
- Chỉ dùng server component cho layout và kiểm tra phiên để chuyển hướng tới S01.
- Hiển thị nhãn và trạng thái theo [glossary](../../appendix/glossary.md) và giá trị liệt kê trong [schema.md](../../data/schema.md), không theo chữ trên mockup khi hai bên khác nhau.
- Vai trò chỉ có Superadmin, Admin, User.
- Phân trang danh sách bằng cursor với nút Trước và Sau. ❌ Không nhảy tới trang số N.
- Lỗi API theo RFC 9457: hiển thị `title`, lỗi từng trường theo `errors`.
- Hiển thị đúng từ chiều rộng 390 px. Đạt WCAG 2.1 AA ở cả hai theme.
- ❌ Không sửa tay khối `@theme` của `src/styles/globals.css`. Sửa bảng token rồi chạy lại script.
- ❌ Không dựng phần mockup đã ghi trong [tech-debt.md](../../tech-debt.md): MFA, FIDO2, WebAuthn, SSO SAML, Active Directory, mTLS, API Tokens, vai trò ngoài glossary.
- Đặt test unit cạnh file mã, test E2E trong `frontend/e2e/`.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Lệnh hay dùng

Chạy từ gốc repo.

| Lệnh | Việc |
|---|---|
| `pnpm --dir frontend test` | Vitest |
| `pnpm --dir frontend lint` | ESLint |
| `pnpm --dir frontend exec tsc --noEmit` | Kiểm tra kiểu |
| `pnpm --dir frontend exec prettier --write .` | Định dạng |
| `pnpm --dir frontend exec playwright test` | E2E, cần `make dev-up` và backend đang chạy |
| `make lint`, `make test`, `make e2e` | Toàn repo |

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `frontend/scripts/generate-tokens.mjs` | Đọc bảng token trong `design-system.md`, sinh `globals.css` |
| `frontend/src/styles/globals.css` | File sinh ra. ❌ Không sửa tay |
| `frontend/src/styles/tokens.test.ts` | Script sinh lại khớp file đã commit, và tương phản đạt AA |
| `frontend/src/lib/api-client.ts` | Gọi `/api/v1`, dựng lỗi RFC 9457 thành kiểu dùng được |
| `frontend/src/lib/query-provider.tsx` | Provider của TanStack Query |
| `frontend/src/lib/auth.ts` | `useMe`, `useLogin`, `useLogout` |
| `frontend/src/lib/session.ts` | `readSession` cho server component |
| `frontend/src/lib/users.ts` | Hook danh sách và thao tác tài khoản |
| `frontend/src/lib/sessions.ts` | Hook phiên đăng nhập |
| `frontend/src/lib/audit-logs.ts` | Hook nhật ký thao tác |
| `frontend/src/components/theme-toggle.tsx` | Nút đổi theme |
| `frontend/src/components/sidebar.tsx` | Sidebar 16 mục, chỉ Users bấm được |
| `frontend/src/components/topbar.tsx` | Topbar: đổi theme, menu đăng xuất |
| `frontend/src/components/pagination.tsx` | Nút Trước, Sau và tổng số |
| `frontend/src/components/field-error.tsx` | Hiển thị lỗi RFC 9457 theo trường |
| `frontend/src/app/login/page.tsx` | S01 |
| `frontend/src/app/(app)/layout.tsx` | Kiểm tra phiên, bọc shell |
| `frontend/src/app/(app)/users/page.tsx` | S12 |
| `frontend/e2e/login.spec.ts` | E2E luồng đăng nhập |
| `backend/app/user/service.py` | Thêm `list_active_sessions`, lọc phiên hết hạn |
| `backend/app/user/router.py` | Thêm `GET /user-sessions` |

---

### Task 1: Bảng token và script sinh

**Files:**
- Modify: `docs/design/design-system.md`
- Create: `frontend/scripts/generate-tokens.mjs`
- Create: `frontend/src/styles/tokens.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: script `frontend/scripts/generate-tokens.mjs` chạy được bằng `node`, đọc `docs/design/design-system.md` và ghi `frontend/src/styles/globals.css`. Lệnh `pnpm --dir frontend tokens`. Hàm xuất `generateCss(markdown: string): string` để test gọi trực tiếp.

Nhiệm vụ của task này là dựng đường ống sinh token và chứng minh nó tái tạo đúng file hiện có. Giá trị theme sáng thuộc Task 2.

- [ ] **Step 1: Thêm bảng token vào design-system.md**

Thêm một mục mới ngay sau mục `### Color Strategy & Roles`, giữ nguyên phần văn xuôi đã có:

```markdown
### Token Table

Script `frontend/scripts/generate-tokens.mjs` đọc bảng này để sinh `frontend/src/styles/globals.css`. Mỗi dòng một token. Cột `light` để trống nghĩa là token không đổi theo theme.

| token | dark | light |
|---|---|---|
| color-surface | #14161c |  |
| color-surface-dim | #0a141e |  |
```

Chép đủ 130 token từ `frontend/src/styles/globals.css` vào bảng, theo đúng thứ tự trong file, giữ nguyên tên nhóm bằng một dòng tiêu đề phụ `| **Colors** | | |` trước mỗi nhóm. Cột `light` để trống hết ở task này.

- [ ] **Step 2: Viết test cho script sinh**

Tạo `frontend/src/styles/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateCss } from '../../scripts/generate-tokens.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const designSystem = readFileSync(`${repoRoot}/docs/design/design-system.md`, 'utf8');
const committedCss = readFileSync(`${repoRoot}/frontend/src/styles/globals.css`, 'utf8');

describe('token generator', () => {
  it('reproduces the committed stylesheet exactly', () => {
    // A hand edit to globals.css, or a token table that drifts from it, fails here.
    expect(generateCss(designSystem)).toBe(committedCss);
  });

  it('emits every token from the table', () => {
    const tableTokens = [...designSystem.matchAll(/^\| (color-[\w-]+|[\w-]+) \|/gm)].map(
      (m) => m[1],
    );
    expect(tableTokens.length).toBeGreaterThan(100);
    for (const token of tableTokens) {
      expect(generateCss(designSystem)).toContain(`--${token}:`);
    }
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, không nạp được `../../scripts/generate-tokens.mjs`.

- [ ] **Step 4: Viết script sinh**

Tạo `frontend/scripts/generate-tokens.mjs`:

```js
// Generates src/styles/globals.css from the token table in the design system.
// The stylesheet is never edited by hand: docs/design/design-system.md is the
// single source, and tokens.test.ts fails when the two drift apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEADER = `/* Design tokens generated from docs/design/design-system.md. Do not hand-edit:
   change the token table first, then run \`pnpm --dir frontend tokens\`. */
@import "tailwindcss";
`;

/** Rows of the token table, in document order, with their group headings. */
export function parseTokenTable(markdown) {
  const section = markdown.split('### Token Table')[1];
  if (section === undefined) throw new Error('design-system.md has no Token Table section');
  const rows = [];
  let group = null;
  for (const line of section.split('\n')) {
    const groupMatch = /^\|\s*\*\*(.+?)\*\*\s*\|/.exec(line);
    if (groupMatch) {
      group = groupMatch[1];
      continue;
    }
    const cells = /^\|\s*([\w-]+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$/.exec(line);
    if (cells) rows.push({ group, name: cells[1], dark: cells[2], light: cells[3] });
  }
  if (rows.length === 0) throw new Error('token table is empty');
  return rows;
}

export function generateCss(markdown) {
  const rows = parseTokenTable(markdown);
  const lines = [HEADER, '', '@theme {'];
  let group = null;
  for (const row of rows) {
    if (row.group !== group) {
      group = row.group;
      lines.push(`  /* ${group} */`);
    }
    // The light value is the default; a token with no light value is theme invariant.
    lines.push(`  --${row.name}: ${row.light === '' ? row.dark : row.light};`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

function main() {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const markdown = readFileSync(`${repoRoot}/docs/design/design-system.md`, 'utf8');
  writeFileSync(`${repoRoot}/frontend/src/styles/globals.css`, generateCss(markdown), 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 5: Thêm lệnh vào package.json**

Thêm vào mục `scripts`: `"tokens": "node scripts/generate-tokens.mjs"`.

- [ ] **Step 6: Chạy script rồi chạy test**

```bash
pnpm --dir frontend tokens
pnpm --dir frontend test
```

Expected: PASS. Nếu test báo lệch, so sánh phần khác nhau: hoặc bảng token chép thiếu dòng, hoặc thứ tự nhóm sai. Sửa bảng token, không sửa `globals.css`.

- [ ] **Step 7: Lint và commit**

```bash
pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit && pnpm --dir frontend exec prettier --write .
git add docs/design/design-system.md frontend/
git commit -m "build(frontend): generate the token stylesheet from the design system

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bảng màu sáng và kiểm tra tương phản

**Files:**
- Modify: `docs/design/design-system.md`
- Modify: `frontend/src/styles/globals.css` (sinh lại, không sửa tay)
- Modify: `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: `generateCss`, `parseTokenTable` từ Task 1.
- Produces: cột `light` của bảng token đã điền cho 78 token màu. Hàm xuất `contrastRatio(foreground: string, background: string): number` trong `frontend/src/styles/contrast.ts`.

- [ ] **Step 1: Viết test tương phản**

Tạo `frontend/src/styles/contrast.ts` với một hàm tính tỉ lệ tương phản theo WCAG 2.1, rồi thêm test vào `tokens.test.ts`:

```ts
import { contrastRatio } from './contrast';
import { parseTokenTable } from '../../scripts/generate-tokens.mjs';

/** Pairs the UI actually renders: foreground token on background token. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['color-fg', 'color-bg'],
  ['color-fg', 'color-surface'],
  ['color-fg-muted', 'color-surface'],
  ['color-on-surface', 'color-surface'],
  ['color-on-surface-variant', 'color-surface'],
  ['color-on-primary', 'color-primary'],
  ['color-on-primary-container', 'color-primary-container'],
  ['color-on-error', 'color-error'],
  ['color-on-error-container', 'color-error-container'],
  ['color-good', 'color-good-soft'],
  ['color-warn', 'color-warn-soft'],
  ['color-crit', 'color-crit-soft'],
  ['color-info', 'color-info-soft'],
];

describe.each([['dark'], ['light']] as const)('%s theme contrast', (theme) => {
  const rows = parseTokenTable(designSystem);
  const value = (name: string): string => {
    const row = rows.find((r) => r.name === name);
    if (row === undefined) throw new Error(`unknown token ${name}`);
    return theme === 'dark' ? row.dark : row.light === '' ? row.dark : row.light;
  };

  it.each(PAIRS)('%s on %s reaches WCAG AA', (fg, bg) => {
    expect(contrastRatio(value(fg), value(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

it('every colour token has a light value', () => {
  const missing = parseTokenTable(designSystem)
    .filter((r) => r.name.startsWith('color-') && r.light === '')
    .map((r) => r.name);
  expect(missing).toEqual([]);
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, cột `light` còn trống và chưa có `contrast.ts`.

- [ ] **Step 3: Viết hàm tính tương phản**

Tạo `frontend/src/styles/contrast.ts`:

```ts
/** WCAG 2.1 relative luminance and contrast ratio, for the token contrast test. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) throw new Error(`not a six digit hex colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * (n & 0xff)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Điền cột light cho 78 token màu**

Suy giá trị sáng từ cùng màu gốc của bảng tối, không chọn màu mới:

- Họ vai trò Material 3 (`surface*`, `on-*`, `primary*`, `secondary*`, `tertiary*`, `error*`, `outline*`, `*-fixed*`): dùng đúng cặp sáng và tối của cùng màu gốc. Màu gốc accent là `#22d3ee` như `design-system.md` đã ghi.
- Họ ngữ nghĩa của dự án: đảo chiều thang độ sáng. `bg` và `surface` từ gần đen thành gần trắng, `fg` từ sáng thành tối, `border` đậm hơn nền, các cặp `*-soft` và `*-bd` giữ nguyên sắc nhưng đổi độ sáng để chữ trên nó vẫn đạt AA.
- 4 màu `asset-*` giữ nguyên sắc, chỉ chỉnh độ sáng nếu cần để đạt AA trên nền sáng.

Chạy `pnpm --dir frontend tokens` sau mỗi lần sửa bảng.

- [ ] **Step 5: Chạy test tới khi đạt**

Run: `pnpm --dir frontend test`
Expected: PASS. Cặp nào chưa đạt 4,5 thì chỉnh độ sáng của token chữ hoặc token nền trong bảng, chạy lại script, chạy lại test. ❌ Không hạ ngưỡng trong test.

- [ ] **Step 6: Lint và commit**

```bash
pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit && pnpm --dir frontend exec prettier --write .
git add docs/design/ frontend/
git commit -m "feat(frontend): add the light palette and prove its contrast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Đổi theme khi chạy

**Files:**
- Modify: `frontend/scripts/generate-tokens.mjs`
- Modify: `frontend/src/styles/tokens.test.ts`
- Create: `frontend/src/components/theme-toggle.tsx`
- Create: `frontend/src/components/theme-toggle.test.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: bảng token từ Task 2.
- Produces: `globals.css` có thêm khối `[data-theme="dark"]`. Component `<ThemeToggle />`. Khóa lưu lựa chọn: `reconos-theme`, giá trị `light` hoặc `dark`.

- [ ] **Step 1: Thêm test cho khối ghi đè**

Thêm vào `tokens.test.ts`:

```ts
it('overrides every theme dependent token under data-theme dark', () => {
  const css = generateCss(designSystem);
  const dark = css.split('[data-theme="dark"]')[1];
  expect(dark).toBeDefined();
  for (const row of parseTokenTable(designSystem)) {
    if (row.light === '' || row.light === row.dark) continue;
    expect(dark).toContain(`--${row.name}: ${row.dark};`);
  }
});

it('keeps theme invariant tokens out of the override block', () => {
  const dark = generateCss(designSystem).split('[data-theme="dark"]')[1];
  for (const row of parseTokenTable(designSystem)) {
    if (row.light === '') expect(dark).not.toContain(`--${row.name}:`);
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, `globals.css` chưa có khối `[data-theme="dark"]`.

- [ ] **Step 3: Sinh khối ghi đè**

Trong `generateCss`, sau khi đóng `@theme`, thêm:

```js
  const themed = rows.filter((row) => row.light !== '' && row.light !== row.dark);
  lines.push('');
  lines.push('/* Dark theme. The toggle sets data-theme on <html>; without it the');
  lines.push('   media query follows the operating system. */');
  lines.push('@media (prefers-color-scheme: dark) {');
  lines.push('  :root:not([data-theme="light"]) {');
  for (const row of themed) lines.push(`    --${row.name}: ${row.dark};`);
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push(':root[data-theme="dark"] {');
  for (const row of themed) lines.push(`  --${row.name}: ${row.dark};`);
  lines.push('}');
```

Chạy `pnpm --dir frontend tokens`, rồi `pnpm --dir frontend test`. Expected: PASS.

- [ ] **Step 4: Viết test cho nút đổi theme**

Tạo `frontend/src/components/theme-toggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the operating system until the reader chooses', () => {
    render(<ThemeToggle />);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('writes the choice to the document and remembers it', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /giao diện/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('reconos-theme')).toBe('dark');
  });

  it('restores the remembered choice', () => {
    localStorage.setItem('reconos-theme', 'light');
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
```

Cài `@testing-library/user-event` nếu chưa có: `pnpm --dir frontend add -D @testing-library/user-event`.

- [ ] **Step 5: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, chưa có `theme-toggle.tsx`.

- [ ] **Step 6: Viết nút đổi theme**

Tạo `frontend/src/components/theme-toggle.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'reconos-theme';
type Theme = 'light' | 'dark';

function remembered(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function ThemeToggle() {
  // null means "follow the operating system": no data-theme attribute is set.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const choice = remembered();
    setTheme(choice);
    if (choice !== null) document.documentElement.setAttribute('data-theme', choice);
  }, []);

  const toggle = () => {
    const next: Theme =
      theme === 'dark'
        ? 'light'
        : theme === 'light'
          ? 'dark'
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'light'
            : 'dark';
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Đổi giao diện sáng tối"
      className="rounded-md border border-border px-3 py-2 text-fg hover:bg-surface-2"
    >
      {theme === 'dark' ? 'Sáng' : 'Tối'}
    </button>
  );
}
```

- [ ] **Step 7: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add docs/design/ frontend/
git commit -m "feat(frontend): switch themes from one token vocabulary

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Chuyển tiếp API và client gọi API

**Files:**
- Modify: `frontend/next.config.ts`
- Create: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/lib/api-client.test.ts`
- Create: `frontend/.env.example`

**Interfaces:**
- Produces: trong `frontend/src/lib/api-client.ts`:
  - `class ApiError extends Error` với `status: number`, `code: string`, `title: string`, `detail?: string`, `fieldErrors: Record<string, string>`, `retryAfterSeconds?: number`.
  - `async function apiRequest<T>(path: string, init?: RequestInit): Promise<T>` gọi `/api/v1${path}`, trả `undefined as T` cho `204`.
  - `function fieldErrorsOf(error: unknown): Record<string, string>`.

- [ ] **Step 1: Viết test**

Tạo `frontend/src/lib/api-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest } from './api-client';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('prefixes the versioned api path so the browser stays on one origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/auth/me');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/me');
  });

  it('sends cookies, because the session lives in one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/auth/me');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('returns undefined for 204 rather than failing to parse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(204, null)));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns an RFC 9457 body into an ApiError with field errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(422, {
          type: 'https://reconos/errors/validation-error',
          title: 'Validation error',
          status: 422,
          code: 'validation_error',
          detail: 'request failed validation',
          errors: [{ field: 'new_password', code: 'password_too_weak' }],
        }),
      ),
    );
    const error = await apiRequest('/auth/password', { method: 'POST' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect(api.status).toBe(422);
    expect(api.code).toBe('validation_error');
    expect(api.fieldErrors.new_password).toBe('password_too_weak');
  });

  it('reads Retry-After on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(429, { title: 'Rate limited', status: 429, code: 'rate_limited' }, {
          'retry-after': '900',
        }),
      ),
    );
    const error = (await apiRequest('/auth/login', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(error.retryAfterSeconds).toBe(900);
  });

  it('still raises an ApiError when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
    );
    const error = (await apiRequest('/users').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, chưa có `api-client.ts`.

- [ ] **Step 3: Viết client**

Tạo `frontend/src/lib/api-client.ts`:

```ts
/** The only place the frontend talks to Backend API.
 *
 * Requests go to the Next origin and Next forwards /api/* to the backend, so
 * Origin always matches RECONOS_PUBLIC_ORIGIN and the SameSite=Lax session
 * cookie travels with them: docs/api/architecture.md.
 */

const API_PREFIX = '/api/v1';

interface ProblemDetails {
  readonly title?: string;
  readonly status?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly errors?: ReadonlyArray<{ readonly field: string; readonly code: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly fieldErrors: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(status: number, problem: ProblemDetails, retryAfter: string | null) {
    const title = problem.title ?? 'Yêu cầu không thành công';
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code ?? 'unknown';
    this.title = title;
    this.detail = problem.detail;
    this.fieldErrors = Object.fromEntries(
      (problem.errors ?? []).map((item) => [item.field, item.code]),
    );
    const seconds = retryAfter === null ? Number.NaN : Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) this.retryAfterSeconds = seconds;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...init.headers },
  });

  if (!response.ok) {
    let problem: ProblemDetails = {};
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      // A proxy or gateway can answer with HTML. The status still matters.
    }
    throw new ApiError(response.status, problem, response.headers.get('retry-after'));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldErrors : {};
}
```

- [ ] **Step 4: Chạy test, xác nhận đạt**

Run: `pnpm --dir frontend test`
Expected: PASS

- [ ] **Step 5: Chuyển tiếp /api/* sang backend**

Sửa `frontend/next.config.ts`:

```ts
import type { NextConfig } from 'next';

// The browser only ever talks to the Next origin. Next forwards /api/* to
// Backend API, which keeps Origin equal to RECONOS_PUBLIC_ORIGIN for the CSRF
// check and lets the SameSite=Lax session cookie travel: docs/api/architecture.md.
// Production routes /api/ at Nginx instead: docs/ops/deployment.md.
const apiUrl = process.env.RECONOS_API_URL ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  // Standalone output keeps the runtime image small: docs/ops/deployment.md
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
```

Tạo `frontend/.env.example`:

```
# URL of Backend API. The Next server forwards /api/* here.
RECONOS_API_URL=http://127.0.0.1:8000
```

- [ ] **Step 6: Kiểm tra bằng tay**

```bash
make dev-up
uv run uvicorn app.main:app --app-dir backend --port 8000 &
pnpm --dir frontend dev &
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/v1/health
```

Expected: `200`. Dừng hai tiến trình sau khi xong.

- [ ] **Step 7: Lint và commit**

```bash
pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit && pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): one origin for the browser, one client for the API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Provider và hook xác thực

**Files:**
- Create: `frontend/src/lib/query-provider.tsx`
- Create: `frontend/src/lib/auth.ts`
- Create: `frontend/src/lib/session.ts`
- Create: `frontend/src/lib/auth.test.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `ApiError` từ Task 4.
- Produces:
  - `<QueryProvider>` trong `query-provider.tsx`.
  - Trong `auth.ts`: `interface CurrentUser { id: string; username: string; display_name: string; role: 'superadmin' | 'admin' | 'user' }`, `useMe(): UseQueryResult<CurrentUser>`, `useLogin(): UseMutationResult<void, unknown, { username: string; password: string }>`, `useLogout(): UseMutationResult<void, unknown, void>`, hằng `authKeys = { me: ['auth', 'me'] as const }`.
  - Trong `session.ts`: `async function readSession(): Promise<CurrentUser | null>` chạy ở server component, đọc cookie bằng `next/headers` và gọi thẳng `RECONOS_API_URL`. Để riêng file vì `auth.ts` khai báo `'use client'`, còn hàm này chỉ chạy ở server.

- [ ] **Step 1: Viết test cho hook**

Tạo `frontend/src/lib/auth.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLogin, useMe } from './auth';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

const ME = { id: '1', username: 'rootadmin', display_name: 'Root', role: 'superadmin' };

describe('useMe', () => {
  it('reads the signed in account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(ME)));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.username).toBe('rootadmin');
  });

  it('does not retry a 401, because no session is a normal state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 'unauthenticated' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useLogin', () => {
  it('posts the credentials and never puts them in the query cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ username: 'rootadmin', password: 'secret value here' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/auth/login');
    expect(init.method).toBe('POST');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, chưa có `auth.ts`.

- [ ] **Step 3: Viết provider**

Tạo `frontend/src/lib/query-provider.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { ApiError } from './api-client';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A 4xx is an answer, not a failure to reach the server.
            retry: (failureCount, error) =>
              error instanceof ApiError && error.status < 500 ? false : failureCount < 2,
            staleTime: 30_000,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 4: Viết hook và hàm đọc phiên phía server**

Tạo `frontend/src/lib/auth.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export interface CurrentUser {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly role: 'superadmin' | 'admin' | 'user';
}

export const authKeys = { me: ['auth', 'me'] as const };

export function useMe() {
  return useQuery({ queryKey: authKeys.me, queryFn: () => apiRequest<CurrentUser>('/auth/me') });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiRequest<void>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    // Nothing in the cache belongs to the account that just left.
    onSuccess: () => client.clear(),
  });
}
```

Tạo `frontend/src/lib/session.ts` cho phía server:

```ts
import { cookies } from 'next/headers';

import type { CurrentUser } from './auth';

/** Reads the session from a server component.
 *
 * The rewrite in next.config.ts only covers requests the browser sends, so a
 * server component calls Backend API directly and forwards the cookie header.
 */
export async function readSession(): Promise<CurrentUser | null> {
  const apiUrl = process.env.RECONOS_API_URL ?? 'http://127.0.0.1:8000';
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader === '') return null;

  const response = await fetch(`${apiUrl}/api/v1/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as CurrentUser;
}
```

- [ ] **Step 5: Bọc provider ở layout gốc**

Trong `frontend/src/app/layout.tsx`, bọc `{children}` bằng `<QueryProvider>` và thêm `import { QueryProvider } from '@/lib/query-provider';`.

- [ ] **Step 6: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): query provider and the authentication hooks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Màn hình đăng nhập S01

**Files:**
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/login/login-form.tsx`
- Create: `frontend/src/app/login/login-form.test.tsx`

**Interfaces:**
- Consumes: `useLogin` từ Task 5, `ApiError` từ Task 4, `readSession` từ Task 5.
- Produces: route `/login`.

Mockup: `docs/design/screens/s01-login.html`. Dựng theo bố cục và token của nó, không chép chữ tiếng Anh.

- [ ] **Step 1: Viết test**

Tạo `frontend/src/app/login/login-form.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './login-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

async function submit(username: string, password: string) {
  await userEvent.type(screen.getByLabelText(/tên đăng nhập/i), username);
  await userEvent.type(screen.getByLabelText(/mật khẩu/i), password);
  await userEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
}

describe('LoginForm', () => {
  it('sends the account to the users screen after signing in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    wrap(<LoginForm />);
    await submit('rootadmin', 'troutmoonlit7Ladder');
    await screen.findByRole('button', { name: /đăng nhập/i });
    expect(push).toHaveBeenCalledWith('/users');
  });

  it('shows one message for every rejected sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ title: 'Unauthenticated', status: 401, code: 'unauthenticated' }),
          { status: 401, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    wrap(<LoginForm />);
    await submit('rootadmin', 'wrong password here');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /tên đăng nhập hoặc mật khẩu không đúng/i,
    );
  });

  it('tells the reader how long the lockout lasts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: 'Rate limited', status: 429, code: 'rate_limited' }), {
          status: 429,
          headers: { 'content-type': 'application/problem+json', 'retry-after': '900' },
        }),
      ),
    );
    wrap(<LoginForm />);
    await submit('rootadmin', 'wrong password here');
    expect(await screen.findByRole('alert')).toHaveTextContent(/15 phút/i);
  });

  it('never renders the password back into the document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { container } = wrap(<LoginForm />);
    await submit('rootadmin', 'troutmoonlit7Ladder');
    expect(container.innerHTML).not.toContain('troutmoonlit7Ladder');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, chưa có `login-form.tsx`.

- [ ] **Step 3: Viết form**

Tạo `frontend/src/app/login/login-form.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { useLogin } from '@/lib/auth';

/** Every rejected sign in gets the same sentence: the backend answers the same
 * 401 for a wrong username, a wrong password and a locked account, and the
 * screen must not add a distinction the API deliberately removed. */
const REJECTED = 'Tên đăng nhập hoặc mật khẩu không đúng.';

function lockoutMessage(seconds: number | undefined): string {
  if (seconds === undefined) return 'Đã thử sai quá nhiều lần. Thử lại sau.';
  return `Đã thử sai quá nhiều lần. Thử lại sau ${Math.ceil(seconds / 60)} phút.`;
}

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          setPassword('');
          router.push('/users');
        },
      },
    );
  };

  const error = login.error;
  const message =
    error instanceof ApiError
      ? error.status === 429
        ? lockoutMessage(error.retryAfterSeconds)
        : error.status === 401
          ? REJECTED
          : error.title
      : error !== null
        ? 'Không gọi được máy chủ. Kiểm tra kết nối rồi thử lại.'
        : null;

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-fg">
        Tên đăng nhập
        <input
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-fg"
        />
      </label>
      <label className="flex flex-col gap-1 text-fg">
        Mật khẩu
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-fg"
        />
      </label>
      {message !== null && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-crit">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={login.isPending}
        className="rounded-md bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
      >
        {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Viết trang**

Tạo `frontend/src/app/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { LoginForm } from './login-form';

export default async function LoginPage() {
  // Someone who already has a session has no business on the sign in screen.
  if ((await readSession()) !== null) redirect('/users');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
      <h1 className="font-headline-lg text-headline-lg text-fg">ReconOS</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 5: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): the sign in screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Khung ứng dụng và kiểm tra phiên

**Files:**
- Create: `frontend/src/app/(app)/layout.tsx`
- Create: `frontend/src/components/sidebar.tsx`
- Create: `frontend/src/components/sidebar.test.tsx`
- Create: `frontend/src/components/topbar.tsx`
- Create: `frontend/src/components/topbar.test.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `readSession` từ Task 5, `useLogout` từ Task 5, `<ThemeToggle />` từ Task 3, `CurrentUser` từ Task 5.
- Produces: `<Sidebar />`, `<Topbar user={user} />`, nhóm route `(app)` đã kiểm tra phiên.

- [ ] **Step 1: Viết test cho sidebar**

Tạo `frontend/src/components/sidebar.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS, Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/users' }));

describe('Sidebar', () => {
  it('lists every designed screen except the sign in one', () => {
    expect(NAV_ITEMS).toHaveLength(16);
    expect(NAV_ITEMS.some((item) => item.label === 'Đăng nhập')).toBe(false);
  });

  it('only lets the reader reach a screen that exists', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/users');
  });

  it('says which batch brings each screen that is not built yet', () => {
    render(<Sidebar />);
    const pending = screen.getByText('Dashboard').closest('li');
    expect(pending).not.toBeNull();
    expect(within(pending as HTMLElement).getByText(/đợt 10/i)).toBeInTheDocument();
  });

  it('marks the current screen for assistive technology', () => {
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /tài khoản/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test`
Expected: FAIL, chưa có `sidebar.tsx`.

- [ ] **Step 3: Viết sidebar**

Tạo `frontend/src/components/sidebar.tsx`. Danh sách 16 mục lấy từ `docs/design/screens/index.json`, trừ S01. Mục chưa có màn hình thì `href` là `null` và `batch` ghi đợt sẽ có, theo `docs/roadmap.md`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  readonly label: string;
  /** null until the batch named below builds the screen. */
  readonly href: string | null;
  readonly batch: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Tổng quan', href: null, batch: 'Đợt 10' },
  { label: 'Theo dõi tài sản', href: null, batch: 'Đợt 5' },
  { label: 'Domain', href: null, batch: 'Đợt 5' },
  { label: 'Chi tiết domain', href: null, batch: 'Đợt 5' },
  { label: 'Thư viện screenshot', href: null, batch: 'Đợt 7' },
  { label: 'Chi tiết screenshot', href: null, batch: 'Đợt 7' },
  { label: 'Program', href: null, batch: 'Đợt 3' },
  { label: 'Chi tiết program', href: null, batch: 'Đợt 3' },
  { label: 'Hàng đợi job', href: null, batch: 'Đợt 4' },
  { label: 'Quản lý program', href: null, batch: 'Đợt 3' },
  { label: 'Tài khoản và phân quyền', href: '/users', batch: 'Đợt 2' },
  { label: 'Tình trạng hệ thống', href: null, batch: 'Đợt 4' },
  { label: 'Cấu hình Osmedeus', href: null, batch: 'Đợt 5' },
  { label: 'Cấu hình Vigolium', href: null, batch: 'Đợt 9' },
  { label: 'Tool module', href: null, batch: 'Đợt 4' },
  { label: 'Finding', href: null, batch: 'Đợt 6' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng chính" className="w-64 shrink-0 border-r border-border bg-surface">
      <ul className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <li key={item.label}>
            {item.href === null ? (
              <span className="flex flex-col rounded-md px-3 py-2 text-fg-faint">
                {item.label}
                <span className="text-fg-faint">{item.batch}</span>
              </span>
            ) : (
              <Link
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                className="block rounded-md px-3 py-2 text-fg hover:bg-surface-2 aria-[current=page]:bg-accent-soft"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Viết test cho topbar**

Tạo `frontend/src/components/topbar.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/auth';

import { Topbar } from './topbar';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const USER: CurrentUser = {
  id: '1',
  username: 'rootadmin',
  display_name: 'Quản trị gốc',
  role: 'superadmin',
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Topbar user={USER} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe('Topbar', () => {
  it('shows who is signed in and their role', () => {
    wrap();
    expect(screen.getByText('Quản trị gốc')).toBeInTheDocument();
    expect(screen.getByText(/superadmin/i)).toBeInTheDocument();
  });

  it('sends the reader back to the sign in screen after signing out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    wrap();
    await userEvent.click(screen.getByRole('button', { name: /đăng xuất/i }));
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('offers the theme toggle', () => {
    wrap();
    expect(screen.getByRole('button', { name: /giao diện/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Viết topbar**

Tạo `frontend/src/components/topbar.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

import type { CurrentUser } from '@/lib/auth';
import { useLogout } from '@/lib/auth';

import { ThemeToggle } from './theme-toggle';

const ROLE_LABEL: Record<CurrentUser['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
};

export function Topbar({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const logout = useLogout();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3">
      <span className="font-headline-sm text-fg">ReconOS</span>
      <div className="flex items-center gap-3">
        <span className="flex flex-col text-right">
          <span className="text-fg">{user.display_name}</span>
          <span className="text-fg-muted">{ROLE_LABEL[user.role]}</span>
        </span>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}
          className="rounded-md border border-border px-3 py-2 text-fg hover:bg-surface-2"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Viết layout kiểm tra phiên**

Tạo `frontend/src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { readSession } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The only authorization decision the frontend makes is "is there a session".
  // Everything finer is the backend's: docs/security/authorization.md.
  const user = await readSession();
  if (user === null) redirect('/login');

  return (
    <div className="flex min-h-dvh flex-col">
      <Topbar user={user} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 px-margin py-margin">{children}</main>
      </div>
    </div>
  );
}
```

Sửa `frontend/src/app/page.tsx` thành chuyển hướng:

```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/users');
}
```

Xóa `frontend/src/app/page.test.tsx`: trang này giờ chỉ chuyển hướng, không còn gì để kiểm.

- [ ] **Step 7: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): the application shell behind a session check

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Backend, danh sách phiên đang hoạt động

**Files:**
- Modify: `backend/app/user/service.py`
- Modify: `backend/app/user/router.py`
- Modify: `backend/tests/test_user_endpoints.py`
- Modify: `docs/api/openapi.yaml` (đã thêm sẵn, chỉ đối chiếu)

**Interfaces:**
- Consumes: `decode_time_cursor`, `encode_cursor`, `Page`, `MAX_LIMIT` trong `app.core.pagination`; `UserSession` trong `app.core.identity`; `get_int_setting` trong `app.core.system_setting`; `Superadmin` trong `app.user.router`.
- Produces: `async def list_active_sessions(session, *, limit, cursor) -> Page[UserSessionResponse]` và endpoint `GET /api/v1/user-sessions`. `list_sessions_for_user` cũng chỉ trả phiên chưa hết hạn.

- [ ] **Step 1: Viết test**

Thêm vào `backend/tests/test_user_endpoints.py`:

```python
async def _expired_session(db_session: AsyncSession, user: User) -> UserSession:
    from datetime import UTC, datetime, timedelta

    from app.core.security import hash_session_id, new_session_id

    row = UserSession(
        user_id=user.id,
        session_hash=hash_session_id(new_session_id()),
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 403), (UserRole.USER, 403)],
)
async def test_all_sessions_by_role(client: AsyncClient, logged_in, role, expected) -> None:
    await logged_in(role=role)
    assert (await client.get("/api/v1/user-sessions")).status_code == expected


async def test_all_sessions_without_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/user-sessions")).status_code == 401


async def test_all_sessions_counts_only_live_ones(
    client: AsyncClient, logged_in, user_factory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    await _expired_session(db_session, victim)
    body = (await client.get("/api/v1/user-sessions")).json()
    # Only the Superadmin's own live session is left.
    assert body["total"] == 1


async def test_per_user_sessions_hide_expired_ones(
    client: AsyncClient, logged_in, user_factory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    await _expired_session(db_session, victim)
    body = (await client.get(f"/api/v1/users/{victim.id}/sessions")).json()
    assert body["total"] == 0
    assert body["items"] == []


async def test_all_sessions_rejects_a_bad_cursor(client: AsyncClient, logged_in) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get("/api/v1/user-sessions?cursor=not-a-cursor")).status_code == 400
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `uv run pytest backend/tests/test_user_endpoints.py -k session -v`
Expected: FAIL, `GET /api/v1/user-sessions` trả 404 và endpoint theo tài khoản vẫn đếm phiên hết hạn.

- [ ] **Step 3: Viết điều kiện lọc và service**

Thêm vào `backend/app/user/service.py`:

```python
async def _live_session_filter(session: AsyncSession) -> ColumnElement[bool]:
    """A session is live while both clocks still allow it.

    The same two rules load_current_user applies: the absolute lifetime in
    expires_at, and the idle window counted from last_seen_at.
    """
    idle_minutes = await get_int_setting(session, "session_idle_timeout_minutes")
    now = datetime.now(UTC)
    return and_(
        UserSession.expires_at > now,
        UserSession.last_seen_at > now - timedelta(minutes=idle_minutes),
    )


async def list_active_sessions(
    session: AsyncSession, *, limit: int, cursor: str | None
) -> Page[UserSessionResponse]:
    size = _clamp(limit)
    live = await _live_session_filter(session)
    stmt = (
        select(UserSession)
        .where(live)
        .order_by(UserSession.created_at.desc(), UserSession.id.desc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(UserSession.created_at, UserSession.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).scalars().all())
    total = await session.scalar(select(func.count()).select_from(UserSession).where(live)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[UserSessionResponse](
        items=[UserSessionResponse.model_validate(row, from_attributes=True) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )
```

Trong `list_sessions_for_user`, thêm `await _live_session_filter(session)` vào cả truy vấn danh sách và truy vấn đếm, cạnh điều kiện `UserSession.user_id == user_id`.

Thêm import còn thiếu: `and_` và `ColumnElement` từ `sqlalchemy`, `timedelta` từ `datetime`.

- [ ] **Step 4: Viết endpoint**

Thêm vào `backend/app/user/router.py`:

```python
@router.get("/user-sessions", response_model=Page[UserSessionResponse], tags=["user"])
async def list_all_sessions(
    actor: Superadmin, session: DbDep, limit: int = DEFAULT_LIMIT, cursor: str | None = None
) -> Page[UserSessionResponse]:
    return await service.list_active_sessions(session, limit=limit, cursor=cursor)
```

⚠️ Khai báo nó TRƯỚC `DELETE /user-sessions/{user_session_id}` trong file, để đường dẫn tĩnh không bị đường dẫn có tham số nuốt mất.

- [ ] **Step 5: Chạy test**

```bash
uv run pytest backend/tests -q
uv run pytest backend/tests --cov=app.core.security --cov-branch -q
uv run ruff format backend && uv run ruff check backend && uv run mypy backend
```

Expected: tất cả đạt, `app.core.security` vẫn 100% nhánh, số cảnh báo vẫn đúng 1.

- [ ] **Step 6: Đối chiếu openapi.yaml**

`GET /user-sessions` đã có trong `docs/api/openapi.yaml`. Xác nhận đường dẫn, phương thức và `x-roles: [superadmin]` khớp mã. Chạy test đối chiếu route:

Run: `uv run pytest backend/tests/test_app_surface.py -v`
Expected: PASS. Nếu hỏng vì route mới chưa có trong danh sách của test, thêm nó vào.

- [ ] **Step 7: Commit**

```bash
git add backend/ docs/
git commit -m "feat(user): list every live session, and stop listing dead ones

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Hai component dùng chung, phân trang và lỗi theo trường

**Files:**
- Create: `frontend/src/components/pagination.tsx`
- Create: `frontend/src/components/pagination.test.tsx`
- Create: `frontend/src/components/field-error.tsx`
- Create: `frontend/src/components/field-error.test.tsx`

**Interfaces:**
- Consumes: không có. Người gọi truyền sẵn dữ liệu qua props.
- Produces:
  - `interface PageInfo { readonly total: number; readonly totalIsEstimate: boolean; readonly nextCursor: string | null }`
  - `function Pagination(props: { page: PageInfo; canGoBack: boolean; onBack: () => void; onNext: () => void }): ReactElement`
  - `function useCursorStack(): { cursor: string | null; canGoBack: boolean; goNext: (next: string | null) => void; goBack: () => void; reset: () => void }`
  - `function FieldError(props: { errors: Record<string, string>; field: string }): ReactElement | null`

Cursor không cho nhảy tới trang số N, nên nút Trước cần nhớ cursor đã đi qua. `useCursorStack` giữ ngăn xếp đó.

- [ ] **Step 1: Viết test cho phân trang**

Tạo `frontend/src/components/pagination.test.tsx`:

```tsx
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, useCursorStack } from './pagination';

describe('Pagination', () => {
  it('disables Trước on the first page', () => {
    render(
      <Pagination
        page={{ total: 42, totalIsEstimate: false, nextCursor: 'c1' }}
        canGoBack={false}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeEnabled();
  });

  it('disables Sau on the last page', () => {
    render(
      <Pagination
        page={{ total: 42, totalIsEstimate: false, nextCursor: null }}
        canGoBack
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeEnabled();
  });

  it('says the total is an estimate when the backend says so', () => {
    render(
      <Pagination
        page={{ total: 1000, totalIsEstimate: true, nextCursor: null }}
        canGoBack={false}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText(/khoảng 1\.000/i)).toBeInTheDocument();
  });

  it('writes an exact total in the Vietnamese thousands format', () => {
    render(
      <Pagination
        page={{ total: 1234, totalIsEstimate: false, nextCursor: null }}
        canGoBack={false}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText(/1\.234/)).toBeInTheDocument();
  });

  it('reports a click on each button', async () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    render(
      <Pagination
        page={{ total: 42, totalIsEstimate: false, nextCursor: 'c1' }}
        canGoBack
        onBack={onBack}
        onNext={onNext}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trước' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('useCursorStack', () => {
  it('walks forward and back through the cursors it was given', () => {
    const { result } = renderHook(() => useCursorStack());
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);

    act(() => result.current.goNext('c1'));
    expect(result.current.cursor).toBe('c1');
    expect(result.current.canGoBack).toBe(true);

    act(() => result.current.goNext('c2'));
    expect(result.current.cursor).toBe('c2');

    act(() => result.current.goBack());
    expect(result.current.cursor).toBe('c1');

    act(() => result.current.goBack());
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it('returns to the first page when the list is reloaded', () => {
    const { result } = renderHook(() => useCursorStack());
    act(() => result.current.goNext('c1'));
    act(() => result.current.reset());
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test pagination`
Expected: FAIL, chưa có `pagination.tsx`.

- [ ] **Step 3: Viết phân trang**

Tạo `frontend/src/components/pagination.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';

export interface PageInfo {
  readonly total: number;
  readonly totalIsEstimate: boolean;
  readonly nextCursor: string | null;
}

/** Keyset pagination can only move one page at a time, so the cursors already
 * visited are the only way back. Index -1 is the first page, whose cursor is
 * null. */
export function useCursorStack() {
  const [stack, setStack] = useState<readonly string[]>([]);

  const goNext = useCallback((next: string | null) => {
    if (next === null) return;
    setStack((current) => [...current, next]);
  }, []);
  const goBack = useCallback(() => setStack((current) => current.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);

  return {
    cursor: stack.length === 0 ? null : (stack[stack.length - 1] as string),
    canGoBack: stack.length > 0,
    goNext,
    goBack,
    reset,
  };
}

const COUNT = new Intl.NumberFormat('vi-VN');

export function Pagination({
  page,
  canGoBack,
  onBack,
  onNext,
}: {
  page: PageInfo;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const total = COUNT.format(page.total);
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-fg-muted">
        {page.totalIsEstimate ? `Khoảng ${total} dòng` : `${total} dòng`}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className="rounded-md border border-border px-3 py-2 text-fg disabled:opacity-50"
        >
          Trước
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page.nextCursor === null}
          className="rounded-md border border-border px-3 py-2 text-fg disabled:opacity-50"
        >
          Sau
        </button>
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Viết test cho lỗi theo trường**

Tạo `frontend/src/components/field-error.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldError } from './field-error';

describe('FieldError', () => {
  it('renders nothing when the field is clean', () => {
    const { container } = render(<FieldError errors={{}} field="username" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the message for its own field', () => {
    render(<FieldError errors={{ username: 'Đã có tài khoản này.' }} field="username" />);
    expect(screen.getByText('Đã có tài khoản này.')).toBeInTheDocument();
  });

  it('ignores a message belonging to another field', () => {
    const { container } = render(
      <FieldError errors={{ new_password: 'Mật khẩu quá yếu.' }} field="username" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 5: Viết lỗi theo trường**

Tạo `frontend/src/components/field-error.tsx`:

```tsx
export function FieldError({ errors, field }: { errors: Record<string, string>; field: string }) {
  const message = errors[field];
  if (message === undefined) return null;
  return (
    <span role="alert" className="text-crit">
      {message}
    </span>
  );
}
```

- [ ] **Step 6: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): the pagination and field error components

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Thẻ số liệu và danh sách tài khoản

**Files:**
- Create: `frontend/src/lib/users.ts`
- Create: `frontend/src/lib/sessions.ts`
- Create: `frontend/src/lib/users.test.tsx`
- Create: `frontend/src/app/(app)/users/page.tsx`
- Create: `frontend/src/app/(app)/users/user-table.tsx`
- Create: `frontend/src/app/(app)/users/user-table.test.tsx`
- Create: `frontend/src/app/(app)/users/stat-cards.tsx`

**Interfaces:**
- Consumes: `apiRequest` (Task 4), `Pagination`, `useCursorStack`, `PageInfo` (Task 9), `useMe` (Task 5).
- Produces:
  - Trong `users.ts`: `interface UserRow`, `interface UserPage`, `userKeys`, `useUsers(cursor: string | null)`.
  - Trong `sessions.ts`: `interface SessionRow`, `sessionKeys`, `useActiveSessionCount()`.
  - `function UserTable(props: { users: readonly UserRow[]; selectedId: string | null; onSelect: (id: string) => void }): ReactElement`
  - `function StatCards(props: { userTotal: number; sessionTotal: number }): ReactElement`
  - Route `/users`.

Kiểu khớp `UserResponse` và `UserSessionResponse` trong `docs/api/openapi.yaml`. Dùng đúng tên trường của API, không đổi sang camelCase.

- [ ] **Step 1: Viết test cho hook danh sách**

Tạo `frontend/src/lib/users.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUsers } from './users';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

const PAGE = {
  items: [
    {
      id: '1',
      username: 'rootadmin',
      display_name: 'Quản trị gốc',
      role: 'superadmin',
      is_locked: false,
      created_at: '2026-11-04T08:00:00Z',
      last_login_at: null,
    },
  ],
  next_cursor: 'c1',
  total: 1,
  total_is_estimate: false,
};

describe('useUsers', () => {
  it('reads the first page without a cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUsers(null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users');
    expect(result.current.data?.items[0]?.username).toBe('rootadmin');
  });

  it('passes the cursor on for a later page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUsers('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users?cursor=c1');
  });

  it('surfaces a rejected request as an error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 })),
    );
    const { result } = renderHook(() => useUsers(null), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test users`
Expected: FAIL, chưa có `users.ts`.

- [ ] **Step 3: Viết hook tài khoản và phiên**

Tạo `frontend/src/lib/users.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { CurrentUser } from './auth';

export interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly role: CurrentUser['role'];
  readonly is_locked: boolean;
  readonly created_at: string;
  readonly last_login_at: string | null;
}

export interface UserPage {
  readonly items: readonly UserRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export const userKeys = {
  all: ['users'] as const,
  page: (cursor: string | null) => ['users', 'page', cursor] as const,
};

function withCursor(path: string, cursor: string | null): string {
  return cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}

export function useUsers(cursor: string | null) {
  return useQuery({
    queryKey: userKeys.page(cursor),
    queryFn: () => apiRequest<UserPage>(withCursor('/users', cursor)),
  });
}
```

Tạo `frontend/src/lib/sessions.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
  readonly last_seen_at: string;
  readonly expires_at: string;
}

export interface SessionPage {
  readonly items: readonly SessionRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export const sessionKeys = {
  all: ['sessions'] as const,
  active: ['sessions', 'active'] as const,
  ofUser: (userId: string) => ['sessions', 'user', userId] as const,
};

export function useActiveSessionCount() {
  return useQuery({
    queryKey: sessionKeys.active,
    queryFn: () => apiRequest<SessionPage>('/user-sessions'),
    select: (page) => page.total,
  });
}
```

- [ ] **Step 4: Viết test cho bảng**

Tạo `frontend/src/app/(app)/users/user-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { UserTable } from './user-table';

const ROWS: UserRow[] = [
  {
    id: '1',
    username: 'rootadmin',
    display_name: 'Quản trị gốc',
    role: 'superadmin',
    is_locked: false,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: '2026-11-04T09:30:00Z',
  },
  {
    id: '2',
    username: 'analyst',
    display_name: 'Người phân tích',
    role: 'user',
    is_locked: true,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: null,
  },
];

describe('UserTable', () => {
  it('writes each role with its glossary name', () => {
    render(<UserTable users={ROWS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Superadmin')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('marks a locked account', () => {
    render(<UserTable users={ROWS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Đã khóa')).toBeInTheDocument();
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
  });

  it('says so when an account has never signed in', () => {
    render(<UserTable users={ROWS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Chưa đăng nhập')).toBeInTheDocument();
  });

  it('reports which row the reader picked', async () => {
    const onSelect = vi.fn();
    render(<UserTable users={ROWS} selectedId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('row', { name: /analyst/ }));
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('says the list is empty instead of showing an empty table', () => {
    render(<UserTable users={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/chưa có tài khoản nào/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Viết bảng và thẻ số liệu**

Tạo `frontend/src/app/(app)/users/user-table.tsx`:

```tsx
'use client';

import type { UserRow } from '@/lib/users';

const ROLE_LABEL: Record<UserRow['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
};

const MOMENT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function moment(value: string | null): string {
  return value === null ? 'Chưa đăng nhập' : MOMENT.format(new Date(value));
}

export function UserTable({
  users,
  selectedId,
  onSelect,
}: {
  users: readonly UserRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (users.length === 0) {
    return <p className="py-8 text-center text-fg-muted">Chưa có tài khoản nào.</p>;
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border text-fg-muted">
          <th scope="col" className="px-3 py-2">
            Tên đăng nhập
          </th>
          <th scope="col" className="px-3 py-2">
            Tên hiển thị
          </th>
          <th scope="col" className="px-3 py-2">
            Vai trò
          </th>
          <th scope="col" className="px-3 py-2">
            Trạng thái
          </th>
          <th scope="col" className="px-3 py-2">
            Đăng nhập gần nhất
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((row) => (
          <tr
            key={row.id}
            onClick={() => onSelect(row.id)}
            aria-selected={row.id === selectedId}
            className="cursor-pointer border-b border-border text-fg hover:bg-surface-2 aria-selected:bg-accent-soft"
          >
            <td className="px-3 py-2">{row.username}</td>
            <td className="px-3 py-2">{row.display_name}</td>
            <td className="px-3 py-2">{ROLE_LABEL[row.role]}</td>
            <td className="px-3 py-2">
              <span className={row.is_locked ? 'text-crit' : 'text-good'}>
                {row.is_locked ? 'Đã khóa' : 'Hoạt động'}
              </span>
            </td>
            <td className="px-3 py-2">{moment(row.last_login_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Tạo `frontend/src/app/(app)/users/stat-cards.tsx`:

```tsx
const COUNT = new Intl.NumberFormat('vi-VN');

export function StatCards({
  userTotal,
  sessionTotal,
}: {
  userTotal: number;
  sessionTotal: number;
}) {
  const cards = [
    { label: 'Tổng tài khoản', value: userTotal },
    { label: 'Phiên đang hoạt động', value: sessionTotal },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border bg-surface p-4">
          <p className="text-fg-muted">{card.label}</p>
          <p className="font-headline-lg text-headline-lg text-fg">{COUNT.format(card.value)}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Viết trang S12**

Tạo `frontend/src/app/(app)/users/page.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useActiveSessionCount } from '@/lib/sessions';
import { useUsers } from '@/lib/users';

import { StatCards } from './stat-cards';
import { UserTable } from './user-table';

export default function UsersPage() {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const users = useUsers(cursor);
  const sessionCount = useActiveSessionCount();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-headline-lg text-headline-lg text-fg">Tài khoản và phân quyền</h1>

      <StatCards userTotal={users.data?.total ?? 0} sessionTotal={sessionCount.data ?? 0} />

      {users.isPending && <p className="text-fg-muted">Đang tải danh sách tài khoản…</p>}
      {users.isError && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-crit">
          Không tải được danh sách tài khoản.
        </p>
      )}
      {users.data !== undefined && (
        <>
          <UserTable users={users.data.items} selectedId={selectedId} onSelect={setSelectedId} />
          <Pagination
            page={{
              total: users.data.total,
              totalIsEstimate: users.data.total_is_estimate,
              nextCursor: users.data.next_cursor,
            }}
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(users.data.next_cursor)}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): the account list and its two stat cards

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Tạo, sửa, khóa, mở khóa tài khoản

**Files:**
- Modify: `frontend/src/lib/users.ts`
- Create: `frontend/src/app/(app)/users/user-form.tsx`
- Create: `frontend/src/app/(app)/users/user-form.test.tsx`
- Create: `frontend/src/app/(app)/users/user-actions.tsx`
- Create: `frontend/src/app/(app)/users/user-actions.test.tsx`
- Modify: `frontend/src/app/(app)/users/page.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `fieldErrorsOf` (Task 4), `FieldError` (Task 9), `useMe` (Task 5), `userKeys`, `UserRow` (Task 10).
- Produces:
  - Trong `users.ts`: `useCreateUser()`, `useUpdateUser(userId: string)`, `useLockUser()`, `useUnlockUser()`. Mỗi mutation thành công thì `invalidateQueries({ queryKey: userKeys.all })`.
  - `function UserForm(props: { mode: 'create' | 'edit'; user?: UserRow; onDone: () => void }): ReactElement`
  - `function UserActions(props: { user: UserRow; isSelf: boolean }): ReactElement`

Vai trò trong `<select>` chỉ có ba giá trị `superadmin`, `admin`, `user`.

- [ ] **Step 1: Thêm mutation vào users.ts**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface UserCreateBody {
  readonly username: string;
  readonly display_name: string;
  readonly password: string;
  readonly role: UserRow['role'];
}

export interface UserUpdateBody {
  readonly display_name?: string;
  readonly role?: UserRow['role'];
}

function useUserMutation<TBody>(send: (body: TBody) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => client.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useCreateUser() {
  return useUserMutation((body: UserCreateBody) =>
    apiRequest<UserRow>('/users', { method: 'POST', body: JSON.stringify(body) }),
  );
}

export function useUpdateUser(userId: string) {
  return useUserMutation((body: UserUpdateBody) =>
    apiRequest<UserRow>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useLockUser() {
  return useUserMutation((userId: string) =>
    apiRequest<void>(`/users/${userId}/lock`, { method: 'POST' }),
  );
}

export function useUnlockUser() {
  return useUserMutation((userId: string) =>
    apiRequest<void>(`/users/${userId}/unlock`, { method: 'POST' }),
  );
}
```

- [ ] **Step 2: Viết test cho form**

Tạo `frontend/src/app/(app)/users/user-form.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { UserForm } from './user-form';

const EXISTING: UserRow = {
  id: '2',
  username: 'analyst',
  display_name: 'Người phân tích',
  role: 'user',
  is_locked: false,
  created_at: '2026-11-04T08:00:00Z',
  last_login_at: null,
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('UserForm in create mode', () => {
  it('offers exactly the three roles the glossary defines', () => {
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Superadmin', 'Admin', 'User']);
  });

  it('posts the new account and closes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...EXISTING, id: '3' }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    wrap(<UserForm mode="create" onDone={onDone} />);

    await userEvent.type(screen.getByLabelText(/tên đăng nhập/i), 'analyst');
    await userEvent.type(screen.getByLabelText(/tên hiển thị/i), 'Người phân tích');
    await userEvent.type(screen.getByLabelText(/mật khẩu/i), 'troutmoonlit7Ladder');
    await userEvent.selectOptions(screen.getByLabelText(/vai trò/i), 'user');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/users');
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'analyst',
      display_name: 'Người phân tích',
      password: 'troutmoonlit7Ladder',
      role: 'user',
    });
  });

  it('puts a field error from RFC 9457 next to its own input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Dữ liệu không hợp lệ',
            status: 422,
            code: 'validation_error',
            errors: { username: 'Tên đăng nhập đã có người dùng.' },
          }),
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/tên đăng nhập/i), 'rootadmin');
    await userEvent.type(screen.getByLabelText(/tên hiển thị/i), 'Trùng tên');
    await userEvent.type(screen.getByLabelText(/mật khẩu/i), 'troutmoonlit7Ladder');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    expect(await screen.findByText('Tên đăng nhập đã có người dùng.')).toBeInTheDocument();
  });
});

describe('UserForm in edit mode', () => {
  it('starts from the current values and never asks for a password', () => {
    wrap(<UserForm mode="edit" user={EXISTING} onDone={vi.fn()} />);
    expect(screen.getByLabelText(/tên hiển thị/i)).toHaveValue('Người phân tích');
    expect(screen.queryByLabelText(/mật khẩu/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tên đăng nhập/i)).not.toBeInTheDocument();
  });

  it('patches only the account it was given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(EXISTING));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<UserForm mode="edit" user={EXISTING} onDone={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/vai trò/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/users/2');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: 'Người phân tích',
      role: 'admin',
    });
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test user-form`
Expected: FAIL, chưa có `user-form.tsx`.

- [ ] **Step 4: Viết form**

Tạo `frontend/src/app/(app)/users/user-form.tsx`:

```tsx
'use client';

import { type FormEvent, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { useCreateUser, type UserRow, useUpdateUser } from '@/lib/users';

const ROLES: readonly { value: UserRow['role']; label: string }[] = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

export function UserForm({
  mode,
  user,
  onDone,
}: {
  mode: 'create' | 'edit';
  user?: UserRow;
  onDone: () => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRow['role']>(user?.role ?? 'user');

  const create = useCreateUser();
  // The hook needs an id even in create mode; it is never called there.
  const update = useUpdateUser(user?.id ?? '');
  const active = mode === 'create' ? create : update;
  const errors = fieldErrorsOf(active.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const done = { onSuccess: () => onDone() };
    if (mode === 'create') {
      create.mutate({ username, display_name: displayName, password, role }, done);
    } else {
      update.mutate({ display_name: displayName, role }, done);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      {mode === 'create' && (
        <label className="flex flex-col gap-1 text-fg">
          Tên đăng nhập
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
          <FieldError errors={errors} field="username" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-fg">
        Tên hiển thị
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2"
        />
        <FieldError errors={errors} field="display_name" />
      </label>

      {mode === 'create' && (
        <label className="flex flex-col gap-1 text-fg">
          Mật khẩu
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
          <FieldError errors={errors} field="password" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-fg">
        Vai trò
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRow['role'])}
          className="rounded-md border border-border bg-surface px-3 py-2"
        >
          {ROLES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <FieldError errors={errors} field="role" />
      </label>

      {active.error !== null && Object.keys(errors).length === 0 && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-crit">
          Không lưu được tài khoản.
        </p>
      )}

      <span className="flex gap-2">
        <button
          type="submit"
          disabled={active.isPending}
          className="rounded-md bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
        >
          Lưu
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-border px-4 py-2 text-fg"
        >
          Hủy
        </button>
      </span>
    </form>
  );
}
```

- [ ] **Step 5: Viết test cho nút khóa, mở khóa**

Tạo `frontend/src/app/(app)/users/user-actions.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { UserActions } from './user-actions';

const OPEN: UserRow = {
  id: '2',
  username: 'analyst',
  display_name: 'Người phân tích',
  role: 'user',
  is_locked: false,
  created_at: '2026-11-04T08:00:00Z',
  last_login_at: null,
};
const LOCKED: UserRow = { ...OPEN, is_locked: true };

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('UserActions', () => {
  it('offers Khóa for an open account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<UserActions user={OPEN} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Khóa' }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users/2/lock');
  });

  it('offers Mở khóa for a locked account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<UserActions user={LOCKED} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mở khóa' }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users/2/unlock');
  });

  it('hides Khóa on the signed in account, which the backend refuses anyway', () => {
    wrap(<UserActions user={OPEN} isSelf />);
    expect(screen.queryByRole('button', { name: 'Khóa' })).not.toBeInTheDocument();
  });

  it('reports a refusal from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: 'Không khóa được chính mình.', status: 409 }), {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    wrap(<UserActions user={OPEN} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Khóa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không khóa được chính mình.');
  });
});
```

- [ ] **Step 6: Viết nút khóa, mở khóa**

Tạo `frontend/src/app/(app)/users/user-actions.tsx`:

```tsx
'use client';

import { ApiError } from '@/lib/api-client';
import { useLockUser, type UserRow, useUnlockUser } from '@/lib/users';

export function UserActions({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const lock = useLockUser();
  const unlock = useUnlockUser();
  const active = user.is_locked ? unlock : lock;
  const error = active.error;

  return (
    <div className="flex flex-col gap-2">
      {/* Hiding the button on your own row is a convenience. The backend
          refuses a Superadmin locking itself either way. */}
      {!(isSelf && !user.is_locked) && (
        <button
          type="button"
          onClick={() => active.mutate(user.id)}
          disabled={active.isPending}
          className="self-start rounded-md border border-border px-3 py-2 text-fg disabled:opacity-60"
        >
          {user.is_locked ? 'Mở khóa' : 'Khóa'}
        </button>
      )}
      {error !== null && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-crit">
          {error instanceof ApiError ? error.title : 'Không đổi được trạng thái tài khoản.'}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Nối vào trang S12**

Trong `frontend/src/app/(app)/users/page.tsx`:

1. Thêm `const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);` và `const me = useMe();`.
2. Thêm nút **Thêm tài khoản** cạnh tiêu đề, bấm thì `setFormMode('create')`.
3. Tính `const selected = users.data?.items.find((row) => row.id === selectedId) ?? null;`.
4. Khi `formMode !== null` thì render `<UserForm mode={formMode} user={formMode === 'edit' ? (selected ?? undefined) : undefined} onDone={() => setFormMode(null)} />`.
5. Khi `selected !== null` thì render một khối chi tiết bên phải bảng, gồm `<UserActions user={selected} isSelf={selected.id === me.data?.id} />` và nút **Sửa** gọi `setFormMode('edit')`.

- [ ] **Step 8: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): create, edit, lock and unlock an account

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Phiên của một tài khoản và thu hồi phiên

**Files:**
- Modify: `frontend/src/lib/sessions.ts`
- Create: `frontend/src/app/(app)/users/session-panel.tsx`
- Create: `frontend/src/app/(app)/users/session-panel.test.tsx`
- Modify: `frontend/src/app/(app)/users/page.tsx`

**Interfaces:**
- Consumes: `apiRequest` (Task 4), `sessionKeys`, `SessionRow`, `SessionPage` (Task 10).
- Produces:
  - Trong `sessions.ts`: `useUserSessions(userId: string | null)`, `useRevokeSession()`.
  - `function SessionPanel(props: { userId: string }): ReactElement`

`useUserSessions` nhận `null` khi chưa chọn tài khoản nào và khi đó không gọi API.

- [ ] **Step 1: Thêm hook vào sessions.ts**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: sessionKeys.ofUser(userId ?? ''),
    queryFn: () => apiRequest<SessionPage>(`/users/${userId as string}/sessions`),
    enabled: userId !== null,
  });
}

export function useRevokeSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<void>(`/user-sessions/${sessionId}`, { method: 'DELETE' }),
    // Both the per-account list and the active count change.
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
```

- [ ] **Step 2: Viết test**

Tạo `frontend/src/app/(app)/users/session-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionPanel } from './session-panel';

const PAGE = {
  items: [
    {
      id: 's1',
      user_id: '2',
      ip_address: '203.0.113.9',
      user_agent: 'Mozilla/5.0',
      created_at: '2026-11-04T08:00:00Z',
      last_seen_at: '2026-11-04T09:00:00Z',
      expires_at: '2026-11-04T20:00:00Z',
    },
  ],
  next_cursor: null,
  total: 1,
  total_is_estimate: false,
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('SessionPanel', () => {
  it('lists the address and the last time the session was seen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(PAGE)));
    wrap(<SessionPanel userId="2" />);
    expect(await screen.findByText('203.0.113.9')).toBeInTheDocument();
  });

  it('revokes the session the reader picked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(PAGE))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<SessionPanel userId="2" />);
    await userEvent.click(await screen.findByRole('button', { name: /thu hồi/i }));
    const [path, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(path).toBe('/api/v1/user-sessions/s1');
    expect(init.method).toBe('DELETE');
  });

  it('says so when the account has no live session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ items: [], next_cursor: null, total: 0, total_is_estimate: false }),
      ),
    );
    wrap(<SessionPanel userId="2" />);
    expect(await screen.findByText(/không có phiên nào đang hoạt động/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test session-panel`
Expected: FAIL, chưa có `session-panel.tsx`.

- [ ] **Step 4: Viết panel**

Tạo `frontend/src/app/(app)/users/session-panel.tsx`:

```tsx
'use client';

import { useRevokeSession, useUserSessions } from '@/lib/sessions';

const MOMENT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function SessionPanel({ userId }: { userId: string }) {
  const sessions = useUserSessions(userId);
  const revoke = useRevokeSession();

  if (sessions.isPending) return <p className="text-fg-muted">Đang tải phiên đăng nhập…</p>;
  if (sessions.isError) {
    return (
      <p role="alert" className="text-crit">
        Không tải được phiên đăng nhập.
      </p>
    );
  }
  if (sessions.data.items.length === 0) {
    return <p className="text-fg-muted">Không có phiên nào đang hoạt động.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.data.items.map((row) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
        >
          <span className="flex flex-col text-fg">
            <span>{row.ip_address ?? 'Không rõ địa chỉ'}</span>
            <span className="text-fg-muted">
              Hoạt động gần nhất {MOMENT.format(new Date(row.last_seen_at))}
            </span>
          </span>
          <button
            type="button"
            onClick={() => revoke.mutate(row.id)}
            disabled={revoke.isPending}
            className="rounded-md border border-border px-3 py-2 text-fg disabled:opacity-60"
          >
            Thu hồi
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Nối vào trang S12**

Trong khối chi tiết của tài khoản đang chọn, thêm tiêu đề `<h2>Phiên đăng nhập</h2>` và `<SessionPanel userId={selected.id} />`.

- [ ] **Step 6: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): list and revoke an account's sessions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Nhật ký thao tác

**Files:**
- Create: `frontend/src/lib/audit-logs.ts`
- Create: `frontend/src/app/(app)/users/audit-panel.tsx`
- Create: `frontend/src/app/(app)/users/audit-panel.test.tsx`
- Modify: `frontend/src/app/(app)/users/page.tsx`

**Interfaces:**
- Consumes: `apiRequest` (Task 4), `Pagination`, `useCursorStack` (Task 9).
- Produces:
  - Trong `audit-logs.ts`: `interface AuditLogRow`, `interface AuditLogPage`, `interface AuditLogFilter { userId: string | null; action: string | null }`, `auditLogKeys`, `useAuditLogs(filter, cursor)`.
  - `function AuditPanel(props: { userId: string | null }): ReactElement`

Kiểu khớp `AuditLogResponse` trong backend: `id`, `user_id`, `action`, `resource_type`, `resource_id`, `detail`, `ip_address`, `created_at`.

- [ ] **Step 1: Viết test**

Tạo `frontend/src/app/(app)/users/audit-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditPanel } from './audit-panel';

const PAGE = {
  items: [
    {
      id: 'a1',
      user_id: '1',
      action: 'user_created',
      resource_type: 'user',
      resource_id: '2',
      detail: { username: 'analyst' },
      ip_address: '203.0.113.9',
      created_at: '2026-11-04T09:00:00Z',
    },
  ],
  next_cursor: null,
  total: 1,
  total_is_estimate: false,
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('AuditPanel', () => {
  it('reads the whole log when no account is picked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId={null} />);
    await screen.findByText('user_created');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/audit-logs');
  });

  it('narrows the log to the account that is picked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId="1" />);
    await screen.findByText('user_created');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/audit-logs?user_id=1');
  });

  it('narrows the log by action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId={null} />);
    await screen.findByText('user_created');
    await userEvent.type(screen.getByLabelText(/thao tác/i), 'login_failed');
    await userEvent.click(screen.getByRole('button', { name: /lọc/i }));
    const paths = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(paths).toContain('/api/v1/audit-logs?action=login_failed');
  });

  it('says so when nothing matches the filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ items: [], next_cursor: null, total: 0, total_is_estimate: false }),
      ),
    );
    wrap(<AuditPanel userId={null} />);
    expect(await screen.findByText(/không có dòng nhật ký nào/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `pnpm --dir frontend test audit-panel`
Expected: FAIL, chưa có `audit-panel.tsx`.

- [ ] **Step 3: Viết hook**

Tạo `frontend/src/lib/audit-logs.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export interface AuditLogRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly action: string;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly detail: Record<string, unknown> | null;
  readonly ip_address: string | null;
  readonly created_at: string;
}

export interface AuditLogPage {
  readonly items: readonly AuditLogRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export interface AuditLogFilter {
  readonly userId: string | null;
  readonly action: string | null;
}

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  page: (filter: AuditLogFilter, cursor: string | null) =>
    ['audit-logs', filter.userId, filter.action, cursor] as const,
};

function buildPath(filter: AuditLogFilter, cursor: string | null): string {
  const query = new URLSearchParams();
  if (filter.userId !== null) query.set('user_id', filter.userId);
  if (filter.action !== null) query.set('action', filter.action);
  if (cursor !== null) query.set('cursor', cursor);
  const suffix = query.toString();
  return suffix === '' ? '/audit-logs' : `/audit-logs?${suffix}`;
}

export function useAuditLogs(filter: AuditLogFilter, cursor: string | null) {
  return useQuery({
    queryKey: auditLogKeys.page(filter, cursor),
    queryFn: () => apiRequest<AuditLogPage>(buildPath(filter, cursor)),
  });
}
```

- [ ] **Step 4: Viết panel**

Tạo `frontend/src/app/(app)/users/audit-panel.tsx`:

```tsx
'use client';

import { type FormEvent, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useAuditLogs } from '@/lib/audit-logs';

const MOMENT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function AuditPanel({ userId }: { userId: string | null }) {
  const [draftAction, setDraftAction] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const logs = useAuditLogs({ userId, action }, cursor);

  const onFilter = (event: FormEvent) => {
    event.preventDefault();
    setAction(draftAction === '' ? null : draftAction);
    // A new filter means a new result set, so the old cursors are meaningless.
    reset();
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-headline-sm text-fg">Nhật ký thao tác</h2>

      <form onSubmit={onFilter} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-fg">
          Thao tác
          <input
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-fg">
          Lọc
        </button>
      </form>

      {logs.isPending && <p className="text-fg-muted">Đang tải nhật ký…</p>}
      {logs.isError && (
        <p role="alert" className="text-crit">
          Không tải được nhật ký thao tác.
        </p>
      )}
      {logs.data !== undefined &&
        (logs.data.items.length === 0 ? (
          <p className="text-fg-muted">Không có dòng nhật ký nào.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {logs.data.items.map((row) => (
                <li key={row.id} className="rounded-md border border-border p-3 text-fg">
                  <span className="flex justify-between gap-3">
                    <span>{row.action}</span>
                    <span className="text-fg-muted">
                      {MOMENT.format(new Date(row.created_at))}
                    </span>
                  </span>
                  <span className="text-fg-muted">
                    {row.resource_type ?? 'Không gắn tài nguyên'} · {row.ip_address ?? 'Không rõ địa chỉ'}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination
              page={{
                total: logs.data.total,
                totalIsEstimate: logs.data.total_is_estimate,
                nextCursor: logs.data.next_cursor,
              }}
              canGoBack={canGoBack}
              onBack={goBack}
              onNext={() => goNext(logs.data.next_cursor)}
            />
          </>
        ))}
    </section>
  );
}
```

- [ ] **Step 5: Nối vào trang S12**

Thêm `<AuditPanel userId={selectedId} />` ở cuối trang, ngoài khối chi tiết: không chọn tài khoản nào thì panel hiện toàn bộ nhật ký.

- [ ] **Step 6: Chạy test, lint và commit**

```bash
pnpm --dir frontend test && pnpm --dir frontend lint && pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec prettier --write .
git add frontend/
git commit -m "feat(frontend): the audit log panel with its filters

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: E2E luồng đăng nhập

**Files:**
- Modify: `frontend/playwright.config.ts`
- Create: `frontend/e2e/login.spec.ts`
- Modify: `frontend/.env.example`
- Modify: `docs/ops/deployment.md` nếu cần ghi cách chạy E2E, nếu không thì bỏ qua

**Interfaces:**
- Consumes: mọi màn hình của các task trước.
- Produces: `make e2e` chạy được.

E2E cần backend đang chạy và CSDL đã có tài khoản Superadmin do `make bootstrap` tạo. Tên và mật khẩu lấy từ `RECONOS_E2E_USERNAME`, `RECONOS_E2E_PASSWORD`.

- [ ] **Step 1: Cho Playwright tự bật Next**

Sửa `frontend/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

const baseURL = process.env.RECONOS_E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

Thêm vào `frontend/.env.example`:

```dotenv
RECONOS_E2E_BASE_URL=http://127.0.0.1:3000
RECONOS_E2E_USERNAME=
RECONOS_E2E_PASSWORD=
```

- [ ] **Step 2: Viết test E2E**

Tạo `frontend/e2e/login.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const username = process.env.RECONOS_E2E_USERNAME ?? '';
const password = process.env.RECONOS_E2E_PASSWORD ?? '';

test.beforeAll(() => {
  if (username === '' || password === '') {
    throw new Error(
      'Set RECONOS_E2E_USERNAME and RECONOS_E2E_PASSWORD to the account make bootstrap created.',
    );
  }
});

async function signIn(page: import('@playwright/test').Page, secret: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(secret);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('sends an anonymous visitor from the users screen to the sign in screen', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});

test('rejects a wrong password with the shared message', async ({ page }) => {
  await signIn(page, 'this password is wrong');
  await expect(page.getByRole('alert')).toContainText('Tên đăng nhập hoặc mật khẩu không đúng');
  await expect(page).toHaveURL(/\/login$/);
});

test('signs in, lands on the users screen and signs out again', async ({ page }) => {
  await signIn(page, password);
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'Tài khoản và phân quyền' })).toBeVisible();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The cookie is gone, so the guarded screen refuses again.
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 3: Chạy E2E**

```bash
make dev-up
make migrate
make bootstrap
RECONOS_E2E_USERNAME=... RECONOS_E2E_PASSWORD=... make e2e
```

Expected: 3 test PASS. Nếu test đăng nhập sai làm khóa tài khoản vì ngưỡng `login_max_failures_per_account`, chạy lại sau khi hết `login_failure_window_minutes`, hoặc chạy test đăng nhập sai sau cùng. ⚠️ Backend phải chạy ở địa chỉ trong `RECONOS_API_URL` của frontend.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "test(e2e): the sign in, sign out and guard flow

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Đồng bộ tài liệu và kiểm tra toàn đợt

**Files:**
- Modify: `docs/tech-debt.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `docs/architecture/directory-structure.md`
- Modify: `docs/documentation-roadmap.md`
- Modify: `docs/design/design-system.md` nếu phần văn xuôi còn nói design system chỉ có một theme

Các file nguồn khác của đợt này đã sửa trong task tương ứng: `api/architecture.md`, `openapi.yaml`, `authorization.md` ở Task 8, `configuration.md` cho `RECONOS_API_URL` của frontend.

- [ ] **Step 1: Đóng ba khoản nợ**

Trong `docs/tech-debt.md`, chuyển cột Trạng thái của nợ 4, nợ 11, nợ 17 sang `🟢 Xong`. ❌ Không xóa dòng, không sửa cột Lý do chấp nhận.

- [ ] **Step 2: Sửa frontend/CLAUDE.md**

1. Mục nói khối token là sinh ra: ghi tên script `frontend/scripts/generate-tokens.mjs` và lệnh `pnpm --dir frontend tokens`.
2. Danh sách mockup cần bỏ: ghi rõ ba khoản nợ đã đóng ở đợt 2.
3. Thêm lệnh frontend còn thiếu nếu có.

- [ ] **Step 3: Sửa directory-structure.md**

Thêm các thư mục mới của frontend: `src/lib/`, `src/components/`, `src/app/(app)/`, `src/styles/`, `scripts/`, `e2e/`.

- [ ] **Step 4: Cập nhật documentation-roadmap.md**

Với mỗi file đã sửa trong cả đợt 2b: tăng phiên bản, đặt Trạng thái `🔵 Chờ duyệt`, đặt Cập nhật là ngày hôm nay, rồi cập nhật dòng Tiến độ. ❌ Không tự đặt `🟢 Xong`.

- [ ] **Step 5: Kiểm tra toàn đợt**

```bash
grep -rn "$(printf '\u2014')" docs/tech-debt.md frontend/CLAUDE.md docs/architecture/directory-structure.md
make lint
make test
make e2e
```

Expected: lệnh `grep` không trả dòng nào trong phần văn tiếng Việt, cả ba lệnh `make` đạt.

Kiểm tra bằng mắt ở chiều rộng 390 px, cả hai theme:

1. Mở `/login` ở theme tối, đăng nhập.
2. Đổi sang theme sáng bằng nút trên topbar, mở lại trang.
3. Tạo một tài khoản, sửa tên hiển thị, khóa rồi mở khóa.
4. Thu hồi một phiên, xem nhật ký thao tác ghi lại các thao tác vừa làm.
5. Bấm Sau rồi Trước trên danh sách tài khoản.

- [ ] **Step 6: Commit**

```bash
git add docs/ frontend/
git commit -m "docs: close the three mockup debts that batch 2b paid off

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Kết thúc lượt bằng dòng đồng bộ**

Ghi đúng một dòng:

```text
Đồng bộ tài liệu: design-system.md, api/architecture.md, openapi.yaml, authorization.md,
configuration.md, tech-debt.md, frontend/CLAUDE.md, directory-structure.md,
documentation-roadmap.md
```

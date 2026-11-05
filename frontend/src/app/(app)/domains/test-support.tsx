import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

/** Test helpers for the part C screens. Imported by tests only, never by a screen. */

export function page(items: readonly unknown[], extra: Record<string, unknown> = {}) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false, ...extra };
}

export const ME_USER = { id: 'u1', username: 'op', display_name: 'Op', role: 'user' };
export const ME_ADMIN = { ...ME_USER, role: 'admin' };

export const PROGRAMS = [
  { id: 'p1', name: 'Example Corp' },
  { id: 'p2', name: 'Example Org' },
];

export const TOOL_MODULES = [
  {
    id: 't1',
    name: 'nuclei',
    group: 'scan',
    is_enabled: true,
    default_params: {},
    max_concurrency: 1,
    rate_limit_per_minute: null,
    timeout_minutes: 60,
    updated_at: '2026-11-01T00:00:00Z',
  },
];

export type Route = (path: string, init?: RequestInit) => unknown;

/** Answers by path prefix, longest first; `/auth/me`, `/programs` and `/tool-modules` have
 * defaults. Anything unrouted answers an empty page. */
export function stubFetch(routes: Record<string, Route | unknown>, me: unknown = ME_USER) {
  const table: Record<string, Route | unknown> = {
    '/api/v1/auth/me': me,
    '/api/v1/programs': page(PROGRAMS),
    '/api/v1/tool-modules': page(TOOL_MODULES),
    ...routes,
  };
  const prefixes = Object.keys(table).sort((a, b) => b.length - a.length);
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const hit = prefixes.find(
      (p) => path === p || path.startsWith(p + '?') || path.startsWith(p + '/'),
    );
    const answer = hit === undefined ? page([]) : table[hit];
    const value = typeof answer === 'function' ? (answer as Route)(path, init) : answer;
    if (value instanceof Response) return Promise.resolve(value);
    return Promise.resolve(Response.json(value));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function problem(status: number, code = 'not_found'): Response {
  return new Response(JSON.stringify({ title: 'Backend title', status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

export function paths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => c[0] as string);
}

export function renderWithClient(ui: ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

export function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Mockup pruning, as in users-shape.test.tsx: each helper throws when it matches nothing,
 * so an exclusion that no longer applies cannot linger as a silent no-op. */
export function cut(root: Element, selector: string, reason: string): void {
  const hits = Array.from(root.querySelectorAll(selector));
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${reason}): ${selector}`);
  hits.forEach((hit) => hit.remove());
}

/** The innermost element matching `selector` whose text contains `text`. */
export function findByText(root: Element, selector: string, text: string): Element {
  const matches = Array.from(root.querySelectorAll(selector)).filter((e) =>
    textOf(e).includes(text),
  );
  const hit = matches.find((e) => !matches.some((other) => other !== e && e.contains(other)));
  if (hit === undefined) throw new Error(`Not in the mockup: ${selector} "${text}"`);
  return hit;
}

export function cutByText(root: Element, selector: string, text: string, reason: string): void {
  const hits = Array.from(root.querySelectorAll(selector)).filter((e) => textOf(e).includes(text));
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${reason}): ${text}`);
  hits.forEach((hit) => hit.remove());
}

/** Swaps an element for another tag, keeping its children: a mockup button that navigates
 * is a link in the product. */
export function retag(node: Element, tag: string, attrs: Record<string, string> = {}): Element {
  const next = node.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) next.setAttribute(k, v);
  next.append(...Array.from(node.childNodes));
  node.replaceWith(next);
  return next;
}

/** Builds a bare element tree from `tag` or `tag[role]` specs, for the controls the product
 * draws where the mockup draws something else. */
export function el(doc: Document, spec: string, ...children: Element[]): Element {
  const m = /^(\w+)(?:\[(\w+)\])?$/.exec(spec);
  if (m === null || m[1] === undefined) throw new Error(`Bad spec ${spec}`);
  const node = doc.createElement(m[1]);
  if (m[2] !== undefined) node.setAttribute('role', m[2]);
  node.append(...children);
  return node;
}

export function parseMockup(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

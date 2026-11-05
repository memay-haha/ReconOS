/** Test-only helpers for part B screen tests: a fetch stub keyed by path, sample rows and a
 * query client wrapper. Never imported by a screen. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import type { CurrentUser } from '@/lib/auth';
import type { Job } from '@/lib/jobs';
import type { ProgramRow } from '@/lib/programs';

export function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false, ...extra };
}

export function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ title: 'Backend title', status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

export type Reply = unknown | ((path: string, init?: RequestInit) => Response | unknown);

/** Answers each call by the longest matching key: the full path with its query first, then
 * the path alone. An unknown path answers an empty page, so a screen never hangs. */
export function stubApi(routes: Record<string, Reply>, me: CurrentUser | null = ME_ADMIN) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const path = input.replace(/^\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const bare = path.split('?')[0] ?? path;
    const reply =
      routes[`${method} ${path}`] ??
      routes[`${method} ${bare}`] ??
      (method === 'GET' ? (routes[path] ?? routes[bare]) : undefined);
    if (path === '/auth/me' && reply === undefined) {
      return Promise.resolve(me === null ? problem(401, 'unauthenticated') : Response.json(me));
    }
    if (reply === undefined) {
      return Promise.resolve(
        method === 'GET' ? Response.json(page([])) : new Response(null, { status: 204 }),
      );
    }
    const value =
      typeof reply === 'function'
        ? (reply as (p: string, i?: RequestInit) => unknown)(path, init)
        : reply;
    return Promise.resolve(value instanceof Response ? value : Response.json(value));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** `METHOD path` of every call, the method spelled out even for GET. */
export function calls(fetchMock: ReturnType<typeof stubApi>): string[] {
  return fetchMock.mock.calls.map(
    ([input, init]) =>
      `${(init?.method ?? 'GET').toUpperCase()} ${String(input).replace(/^\/api\/v1/, '')}`,
  );
}

export function renderWithClient(element: ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

export const ME_SUPERADMIN: CurrentUser = {
  id: 'u-super',
  username: 'root',
  display_name: 'Root',
  role: 'superadmin',
};
export const ME_ADMIN: CurrentUser = {
  id: 'u-admin',
  username: 'ops',
  display_name: 'Ops',
  role: 'admin',
};
export const ME_USER: CurrentUser = {
  id: 'u-user',
  username: 'hunter',
  display_name: 'Hunter',
  role: 'user',
};

export function programRow(n: number, extra: Partial<ProgramRow> = {}): ProgramRow {
  return {
    id: `p${n}`,
    name: `program-${n}`,
    platform: 'HackerOne',
    platform_url: 'https://hackerone.com/example',
    bounty_type: 'bounty',
    description: 'Sample program.',
    status: 'active',
    created_by: null,
    created_at: '2026-11-01T01:00:00Z',
    updated_at: '2026-11-04T01:05:00Z',
    archived_at: null,
    in_scope_rule_count: 3,
    out_of_scope_rule_count: 1,
    domain_count: 1234,
    ip_count: 5,
    url_count: 6,
    service_count: 7,
    finding_counts: { critical: 1, high: 2, medium: 3, low: 4, info: 5 },
    ...extra,
  };
}

export function jobRow(n: number, extra: Partial<Job> = {}): Job {
  return {
    id: `job-${n}-0000-0000`,
    program_id: 'p1',
    tool_module_id: 'tm1',
    status: 'queued',
    priority: 0,
    target: [`a${n}.example.com`],
    params: {},
    proxy_id: null,
    schedule_id: null,
    retry_of_job_id: null,
    worker_id: null,
    created_by: 'u-admin',
    approved_by: null,
    status_reason: null,
    created_at: '2026-11-04T01:05:00Z',
    approved_at: null,
    dispatched_at: null,
    started_at: null,
    last_heartbeat_at: null,
    finished_at: null,
    ...extra,
  };
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

/** Test helper for the part E screens: a fake Backend API behind the global fetch. Not
 * imported by any screen. */

export type Role = 'superadmin' | 'admin' | 'user';

export interface Call {
  readonly method: string;
  /** Path after /api/v1, with the query string. */
  readonly path: string;
  readonly body: unknown;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function problem(status: number, code: string, errors?: { field: string; code: string }[]) {
  return new Response(JSON.stringify({ title: 'Backend Title', status, code, errors }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

export function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false, ...extra };
}

export function me(role: Role) {
  return { id: 'me-1', username: 'operator', display_name: 'Operator', role };
}

type Answer = (call: Call) => Response | undefined;

/** Answers `GET /auth/me` with `role`, then asks `answer`. Anything left unanswered is a 404. */
export function stubApi(role: Role, answer: Answer) {
  const calls: Call[] = [];
  const fetchMock = vi.fn((input: string, init: RequestInit = {}) => {
    const call: Call = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: input.replace(/^\/api\/v1/, ''),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(call);
    if (call.method === 'GET' && call.path === '/auth/me') return Promise.resolve(json(me(role)));
    return Promise.resolve(answer(call) ?? problem(404, 'not_found'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

export function renderScreen(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

export function paths(calls: readonly Call[], method = 'GET'): string[] {
  return calls.filter((c) => c.method === method).map((c) => c.path);
}

import { http, type HttpHandler } from 'msw';

/** One page envelope, shaped exactly like Page[ItemT] in
 * backend/app/core/pagination.py, so a screen cannot tell a mock from the
 * real API. */
export function page<T>(items: readonly T[]) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false };
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface MockRoute {
  /** `METHOD /path` exactly as the contract and IMPLEMENTED spell it. */
  readonly key: string;
  /** Called only for a route the backend has not built. */
  readonly build: () => HttpHandler;
}

type Resolver = Parameters<typeof http.get>[1];

export function route(key: string, resolver: Resolver): MockRoute {
  const [verb, path] = key.split(' ') as [string, string];
  const method = verb.toLowerCase() as Method;
  return { key, build: () => http[method](`/api/v1${path}`, resolver) };
}

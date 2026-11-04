import { http, HttpResponse, type HttpHandler } from 'msw';

import { users } from '../data/users';

/** One page envelope, shaped exactly like Page[ItemT] in
 * backend/app/core/pagination.py, so a screen cannot tell a mock from the
 * real API. */
function page<T>(items: readonly T[]) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false };
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface MockRoute {
  /** `METHOD /path` exactly as the contract and IMPLEMENTED spell it. */
  readonly key: string;
  /** Called only for a route the backend has not built. */
  readonly build: () => HttpHandler;
}

function route(key: string, resolver: () => Response): MockRoute {
  const [verb, path] = key.split(' ') as [string, string];
  const method = verb.toLowerCase() as Method;
  return { key, build: () => http[method](`/api/v1${path}`, resolver) };
}

/** Handlers are described, not built: registry.ts builds only the routes the
 * backend does not serve, so a mock for a live endpoint never exists. */
export const mockRoutes: readonly MockRoute[] = [
  route('GET /users', () => HttpResponse.json(page(users))),
  // Spelled with a path parameter on purpose: it is in IMPLEMENTED, so
  // registry.test.ts proves the parameter spelling lines up with the filter.
  route('GET /users/:user_id', () => HttpResponse.json(users[0])),
  route('GET /domains', () => HttpResponse.json(page([]))),
];

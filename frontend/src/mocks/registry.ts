import type { RequestHandler } from 'msw';

import { mockRoutes } from './handlers';

/** Endpoints the backend really serves. A handler is never built for these, so
 * the browser talks to the real API and a mock can never shadow working code.
 * When a batch implements an endpoint, add its line here and delete the
 * handler; registry.test.ts checks every line against openapi.yaml, so a typo
 * cannot silently leave a mock in place. */
export const IMPLEMENTED: readonly string[] = [
  'POST /auth/login',
  'POST /auth/logout',
  'GET /auth/me',
  'POST /auth/password',
  'GET /users',
  'POST /users',
  'GET /users/:user_id',
  'PATCH /users/:user_id',
  'POST /users/:user_id/lock',
  'POST /users/:user_id/unlock',
  'GET /users/:user_id/sessions',
  'GET /user-sessions',
  'DELETE /user-sessions/:user_session_id',
  'GET /audit-logs',
];

export function handlersFor(implemented: readonly string[]): RequestHandler[] {
  const live = new Set(implemented);
  return mockRoutes.filter((r) => !live.has(r.key)).map((r) => r.build());
}

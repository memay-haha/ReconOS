import { HttpResponse } from 'msw';

import { users } from '../data/users';
import { type MockRoute, page, route } from './helpers';

/** Routes several parts read. Each part adds its own routes in its own file. */
export const sharedRoutes: readonly MockRoute[] = [
  route('GET /users', () => HttpResponse.json(page(users))),
  // Spelled with a path parameter on purpose: it is in IMPLEMENTED, so
  // registry.test.ts proves the parameter spelling lines up with the filter.
  route('GET /users/:user_id', () => HttpResponse.json(users[0])),
];

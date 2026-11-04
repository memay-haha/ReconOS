import 'server-only';

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
  // 401 and 403 mean no session. Any other failure must surface, not look like a sign-out.
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Session check failed with status ${response.status}`);
  return (await response.json()) as CurrentUser;
}

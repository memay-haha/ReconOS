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

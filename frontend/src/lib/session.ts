import 'server-only';

import { cookies } from 'next/headers';

import type { CurrentUser } from './auth';

/** What the session check could establish.
 *
 * `unknown` is the case the two screens disagree about: Backend API did not answer,
 * or answered something that is not an account. It is not the same as "no session".
 */
type SessionLookup =
  | { readonly kind: 'session'; readonly user: CurrentUser }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown'; readonly reason: string };

/** Asks Backend API who the cookie belongs to.
 *
 * The rewrite in next.config.ts only covers requests the browser sends, so a server
 * component calls Backend API directly and forwards the cookie header.
 */
async function lookUpSession(): Promise<SessionLookup> {
  const apiUrl = process.env.RECONOS_API_URL ?? 'http://127.0.0.1:8000';
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader === '') return { kind: 'none' };

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
  } catch {
    return { kind: 'unknown', reason: 'Session check could not reach Backend API' };
  }

  // 401 and 403 are the backend's answer that this cookie carries no usable session.
  if (response.status === 401 || response.status === 403) return { kind: 'none' };
  if (!response.ok) {
    return { kind: 'unknown', reason: `Session check failed with status ${response.status}` };
  }
  try {
    return { kind: 'session', user: (await response.json()) as CurrentUser };
  } catch {
    return { kind: 'unknown', reason: 'Session check got a body that is not JSON' };
  }
}

/** Reads the session for a screen that is behind the sign-in check: src/app/(app)/layout.tsx.
 *
 * An outage must not look like a sign-out here. Returning null would redirect the
 * operator to the sign-in screen and let them believe their session ended, so anything
 * other than a clear answer throws and surfaces as an error.
 */
export async function readSessionForGuardedScreen(): Promise<CurrentUser | null> {
  const lookup = await lookUpSession();
  if (lookup.kind === 'unknown') throw new Error(lookup.reason);
  return lookup.kind === 'session' ? lookup.user : null;
}

/** Reads the session for the sign-in screen itself: src/app/login/page.tsx.
 *
 * The check only exists to send an operator who already has a session on to the app.
 * Throwing would make a backend outage hide the sign-in form behind the error boundary
 * for anyone holding any cookie on this origin, so "cannot tell" means "show the form".
 */
export async function readSessionForSignInScreen(): Promise<CurrentUser | null> {
  const lookup = await lookUpSession();
  return lookup.kind === 'session' ? lookup.user : null;
}

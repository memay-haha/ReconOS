import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => 'session=abc' }) }));

import { readSessionForGuardedScreen, readSessionForSignInScreen } from './session';

const ME = { id: '1', username: 'u', display_name: 'U', role: 'user' };

afterEach(() => vi.unstubAllGlobals());

function answers(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

/** A body whose status is 200 but whose content is not JSON: a proxy error page. */
function malformedBody(): Response {
  return new Response('<html>502</html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

describe('readSessionForGuardedScreen', () => {
  it.each([401, 403])('returns null for %i', async (status) => {
    answers(new Response(null, { status }));
    expect(await readSessionForGuardedScreen()).toBeNull();
  });

  it('throws on a backend failure instead of pretending to sign out', async () => {
    answers(new Response(null, { status: 500 }));
    await expect(readSessionForGuardedScreen()).rejects.toThrow('500');
  });

  it('throws when the request never reaches the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(readSessionForGuardedScreen()).rejects.toThrow('could not reach Backend API');
  });

  it('throws when the body is not JSON', async () => {
    answers(malformedBody());
    await expect(readSessionForGuardedScreen()).rejects.toThrow('not JSON');
  });

  it('returns the account on 200', async () => {
    answers(Response.json(ME));
    expect(await readSessionForGuardedScreen()).toEqual(ME);
  });
});

describe('readSessionForSignInScreen', () => {
  it.each([401, 403])('returns null for %i', async (status) => {
    answers(new Response(null, { status }));
    expect(await readSessionForSignInScreen()).toBeNull();
  });

  it('shows the form rather than throwing when the backend fails', async () => {
    answers(new Response(null, { status: 500 }));
    expect(await readSessionForSignInScreen()).toBeNull();
  });

  it('shows the form when the request never reaches the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await readSessionForSignInScreen()).toBeNull();
  });

  it('shows the form when the body is not JSON', async () => {
    answers(malformedBody());
    expect(await readSessionForSignInScreen()).toBeNull();
  });

  it('still redirects an account that does have a session', async () => {
    answers(Response.json(ME));
    expect(await readSessionForSignInScreen()).toEqual(ME);
  });
});

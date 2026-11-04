import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => 'session=abc' }) }));

import { readSession } from './session';

afterEach(() => vi.unstubAllGlobals());

describe('readSession', () => {
  it.each([401, 403])('returns null for %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await readSession()).toBeNull();
  });

  it('throws on a backend failure instead of pretending to sign out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(readSession()).rejects.toThrow('500');
  });

  it('returns the account on 200', async () => {
    const me = { id: '1', username: 'u', display_name: 'U', role: 'user' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(me)));
    expect(await readSession()).toEqual(me);
  });
});

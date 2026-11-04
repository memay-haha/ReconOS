import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest, fieldErrorsOf } from './api-client';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('prefixes the versioned api path so the browser stays on one origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/auth/me');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/me');
  });

  it('sends cookies, because the session lives in one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/auth/me');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('returns undefined for 204 rather than failing to parse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(204, null)));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns an RFC 9457 body into an ApiError with field errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(422, {
          type: 'https://reconos/errors/validation-error',
          title: 'Validation error',
          status: 422,
          code: 'validation_error',
          detail: 'request failed validation',
          errors: [{ field: 'new_password', code: 'password_too_weak' }],
        }),
      ),
    );
    const error = await apiRequest('/auth/password', { method: 'POST' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect(api.status).toBe(422);
    expect(api.code).toBe('validation_error');
    expect(api.fieldErrors.new_password).toBe('password_too_weak');
  });

  it('reads Retry-After on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(
          429,
          { title: 'Rate limited', status: 429, code: 'rate_limited' },
          {
            'retry-after': '900',
          },
        ),
      ),
    );
    const error = (await apiRequest('/auth/login', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(error.retryAfterSeconds).toBe(900);
  });

  it('still raises an ApiError when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
    );
    const error = (await apiRequest('/users').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
  });

  it('sends content-type only when there is a body', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/auth/me');
    await apiRequest('/auth/login', { method: 'POST', body: '{}' });
    const first = new Headers(fetchMock.mock.calls[0][1].headers);
    const second = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(first.has('content-type')).toBe(false);
    expect(second.get('content-type')).toBe('application/json');
  });

  it('lets a network failure propagate as a non-ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    const error = await apiRequest('/users').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('falls back to a title when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));
    const error = (await apiRequest('/users').catch((e: unknown) => e)) as ApiError;
    expect(error.title.length).toBeGreaterThan(0);
    expect(error.fieldErrors).toEqual({});
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('ignores a non-numeric Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond(429, { title: 'x' }, { 'retry-after': 'soon' })),
    );
    const error = (await apiRequest('/auth/login').catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});

describe('fieldErrorsOf', () => {
  it('returns the field errors of an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond(422, { errors: [{ field: 'a', code: 'required' }] })),
    );
    const error = await apiRequest('/x').catch((e: unknown) => e);
    expect(fieldErrorsOf(error)).toEqual({ a: 'required' });
  });

  it('returns an empty object for anything else', () => {
    expect(fieldErrorsOf(new Error('x'))).toEqual({});
    expect(fieldErrorsOf(null)).toEqual({});
    expect(fieldErrorsOf('x')).toEqual({});
  });
});

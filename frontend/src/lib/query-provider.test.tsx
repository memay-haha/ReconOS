import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/users', replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));

import { ApiError, apiRequest } from './api-client';
import { isSessionExpired, QueryProvider, shouldRetryQuery, SIGN_IN_PATH } from './query-provider';

function apiError(status: number): ApiError {
  return new ApiError(status, { code: 'x', title: 'x' }, null);
}

describe('shouldRetryQuery', () => {
  it('does not retry a 401', () => {
    expect(shouldRetryQuery(0, apiError(401))).toBe(false);
  });
  it('retries a 500 up to two times', () => {
    expect(shouldRetryQuery(0, apiError(500))).toBe(true);
    expect(shouldRetryQuery(2, apiError(500))).toBe(false);
  });
  it('retries a network failure without throwing', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});

describe('isSessionExpired', () => {
  it('is true only for a 401', () => {
    expect(isSessionExpired(apiError(401))).toBe(true);
    expect(isSessionExpired(apiError(403))).toBe(false);
    expect(isSessionExpired(apiError(500))).toBe(false);
    expect(isSessionExpired(new TypeError('Failed to fetch'))).toBe(false);
  });
});

function Panel({ path }: { path: string }): ReactElement {
  const query = useQuery({ queryKey: [path], queryFn: () => apiRequest<unknown>(path) });
  return <span>{query.isError ? `${path} hỏng` : `${path} ổn`}</span>;
}

function Saver(): ReactElement {
  const save = useMutation({ mutationFn: () => apiRequest<void>('/users', { method: 'POST' }) });
  return (
    <button type="button" onClick={() => save.mutate()}>
      Lưu
    </button>
  );
}

function answerWith(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({ title: 'x', code: 'x' }, { status }))),
  );
}

describe('QueryProvider on an expired session', () => {
  beforeEach(() => {
    nav.pathname = '/users';
    nav.replace.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears the cache and sends the operator to sign in again', async () => {
    const clear = vi.spyOn(QueryClient.prototype, 'clear');
    answerWith(401);
    render(
      <QueryProvider>
        <Panel path="/users" />
      </QueryProvider>,
    );

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith(SIGN_IN_PATH));
    expect(clear).toHaveBeenCalled();
  });

  it('redirects once when every panel on the screen fails at the same time', async () => {
    answerWith(401);
    render(
      <QueryProvider>
        <Panel path="/users" />
        <Panel path="/user-sessions" />
        <Panel path="/audit-logs" />
      </QueryProvider>,
    );

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith(SIGN_IN_PATH));
    await screen.findByText('/users hỏng');
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it('leaves a 403 to the screen, because permission is an answer, not a sign-out', async () => {
    answerWith(403);
    render(
      <QueryProvider>
        <Panel path="/user-sessions" />
      </QueryProvider>,
    );

    expect(await screen.findByText('/user-sessions hỏng')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('does not redirect the sign-in screen onto itself', async () => {
    nav.pathname = SIGN_IN_PATH;
    answerWith(401);
    render(
      <QueryProvider>
        <Panel path="/auth/me" />
      </QueryProvider>,
    );

    expect(await screen.findByText('/auth/me hỏng')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('also catches a 401 answered to a mutation', async () => {
    answerWith(401);
    render(
      <QueryProvider>
        <Saver />
      </QueryProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith(SIGN_IN_PATH));
  });
});

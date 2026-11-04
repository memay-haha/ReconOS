import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './login-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

async function submit(username: string, password: string) {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

function problem(status: number, code: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ title: code, status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });
}

describe('LoginForm', () => {
  it('sends the account to the users screen after signing in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    wrap(<LoginForm />);
    await submit('rootadmin', 'troutmoonlit7Ladder');
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/users'));
  });

  it('clears the password field after signing in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    wrap(<LoginForm />);
    await submit('rootadmin', 'troutmoonlit7Ladder');
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });

  it('shows one message for every rejected sign in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(401, 'unauthenticated')));
    wrap(<LoginForm />);
    await submit('rootadmin', 'wrong password here');
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect username or password/i);
  });

  it('tells the reader how long the lockout lasts, rounded up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problem(429, 'rate_limited', { 'retry-after': '901' })),
    );
    wrap(<LoginForm />);
    await submit('rootadmin', 'wrong password here');
    expect(await screen.findByRole('alert')).toHaveTextContent(/16 minutes/i);
  });

  it('names no duration when the lockout carries none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(429, 'rate_limited')));
    wrap(<LoginForm />);
    await submit('rootadmin', 'wrong password here');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /too many failed attempts. this account is temporarily blocked/i,
    );
    expect(alert).not.toHaveTextContent(/minute/i);
  });

  it('says the server could not be reached on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    wrap(<LoginForm />);
    await submit('rootadmin', 'whatever password');
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });

  it('never leaks the password into the document, the alert or the console', async () => {
    const secret = 'troutmoonlit7Ladder';
    const spies = (['error', 'log', 'warn'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(401, 'unauthenticated')));
    const { container } = wrap(<LoginForm />);
    await submit('rootadmin', secret);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain(secret);
    expect(document.body.textContent).not.toContain(secret);
    expect(container.querySelector('input[type=password]')?.hasAttribute('value')).toBe(false);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
    }
    vi.restoreAllMocks();
  });

  it.each([
    [0, 1],
    [1, 1],
    [60, 1],
    [61, 2],
    [900, 15],
    [901, 16],
  ])('rounds a Retry-After of %i seconds up to %i minutes', async (seconds, minutes) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problem(429, 'rate_limited', { 'retry-after': String(seconds) })),
    );
    wrap(<LoginForm />);
    await submit('rootadmin', 'wrong password here');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      new RegExp(`in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}\\.`),
    );
  });

  it('does not blame the network for an error that is not a failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    wrap(<LoginForm />);
    await submit('rootadmin', 'whatever password');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not sign in/i);
    expect(alert).not.toHaveTextContent(/reach/i);
  });

  it('declares method post so an unhydrated submit cannot put credentials in a URL', () => {
    // A native submit defaults to GET, which writes the fields into the address bar and logs.
    const { container } = wrap(<LoginForm />);
    expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  });

  it('reveals and hides the password without copying it into the markup', async () => {
    wrap(<LoginForm />);
    const field = screen.getByLabelText(/^password$/i);
    await userEvent.type(field, 'hunter2hunter2');
    const reveal = screen.getByRole('button', { name: 'Show characters' });
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(reveal);
    expect(field).toHaveAttribute('type', 'text');
    expect(field).not.toHaveAttribute('value');
    expect(field).toHaveValue('hunter2hunter2');
    // One label, one state: the name never flips, so a screen reader says it once.
    expect(screen.getByRole('button', { name: 'Show characters' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(reveal);
    expect(field).toHaveAttribute('type', 'password');
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { UserForm } from './user-form';

const EXISTING: UserRow = {
  id: '2',
  username: 'analyst',
  display_name: 'Người phân tích',
  role: 'user',
  is_locked: false,
  created_at: '2026-11-04T08:00:00Z',
  last_login_at: null,
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function problem(status: number, body: object) {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

async function fillCreate(password: string, username = 'analyst') {
  await userEvent.type(screen.getByLabelText(/tên đăng nhập/i), username);
  await userEvent.type(screen.getByLabelText(/tên hiển thị/i), 'Người phân tích');
  await userEvent.type(screen.getByLabelText(/mật khẩu/i), password);
}

afterEach(() => vi.unstubAllGlobals());

describe('UserForm in create mode', () => {
  it('offers exactly the three roles the glossary defines', () => {
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Superadmin', 'Admin', 'User']);
  });

  it('posts the new account and closes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...EXISTING, id: '3' }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    wrap(<UserForm mode="create" onDone={onDone} />);

    await fillCreate('troutmoonlit7Ladder');
    await userEvent.selectOptions(screen.getByLabelText(/vai trò/i), 'user');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/users');
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'analyst',
      display_name: 'Người phân tích',
      password: 'troutmoonlit7Ladder',
      role: 'user',
    });
  });

  it('never writes the password into the markup', async () => {
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    await fillCreate('troutmoonlit7Ladder');
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveValue('troutmoonlit7Ladder');
    expect(document.body.innerHTML).not.toContain('troutmoonlit7Ladder');
  });

  it('puts a field error next to its own input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        problem(422, {
          title: 'Validation error',
          code: 'validation_error',
          errors: [{ field: 'password', code: 'password_too_weak' }],
        }),
      ),
    );
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    await fillCreate('password1');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    expect(await screen.findByText(/dễ đoán/i)).toBeInTheDocument();
  });

  it('shows a duplicate username as a general message, because 409 carries no field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problem(409, { title: 'Conflict', code: 'conflict' })),
    );
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    await fillCreate('troutmoonlit7Ladder', 'rootadmin');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /tên đăng nhập này đã có người dùng/i,
    );
  });

  it('shows a Vietnamese sentence, never the English title, for other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problem(500, { title: 'Internal Server Error' })),
    );
    wrap(<UserForm mode="create" onDone={vi.fn()} />);
    await fillCreate('troutmoonlit7Ladder');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/không lưu được tài khoản/i);
    expect(alert).not.toHaveTextContent('Internal Server Error');
  });
});

describe('UserForm in edit mode', () => {
  it('starts from the current values and never asks for a password', () => {
    wrap(<UserForm mode="edit" user={EXISTING} onDone={vi.fn()} />);
    expect(screen.getByLabelText(/tên hiển thị/i)).toHaveValue('Người phân tích');
    expect(screen.queryByLabelText(/mật khẩu/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tên đăng nhập/i)).not.toBeInTheDocument();
  });

  it('patches only the account it was given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(EXISTING));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<UserForm mode="edit" user={EXISTING} onDone={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/vai trò/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/users/2');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: 'Người phân tích',
      role: 'admin',
    });
  });
});

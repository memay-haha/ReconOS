import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/auth';

import { Topbar } from './topbar';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const USER: CurrentUser = {
  id: '1',
  username: 'rootadmin',
  display_name: 'Root Admin',
  role: 'superadmin',
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Topbar user={USER} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe('Topbar', () => {
  it('shows who is signed in and their role', () => {
    wrap();
    expect(screen.getByText('Root Admin')).toBeInTheDocument();
    expect(screen.getByText(/superadmin/i)).toBeInTheDocument();
  });

  it('sends the reader back to the sign in screen after signing out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    wrap();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('tells the reader when signing out failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    wrap();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign out/i);
    expect(push).not.toHaveBeenCalled();
  });

  it('offers the theme toggle', () => {
    wrap();
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });
});

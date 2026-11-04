import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSessionAwareClient } from '@/lib/query-provider';

import { ChangePasswordDialog } from './change-password-dialog';

function wrap(
  node: ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

async function fill(current: string, next: string) {
  await userEvent.type(screen.getByLabelText(/current password/i), current);
  await userEvent.type(screen.getByLabelText(/new password/i), next);
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
}

function problem(status: number, body: object) {
  return new Response(JSON.stringify({ title: 'x', status, ...body }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

describe('ChangePasswordDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = wrap(<ChangePasswordDialog open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sends both passwords to the endpoint batch 2a built', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    wrap(<ChangePasswordDialog open onClose={onClose} />);
    await fill('old secret value', 'troutmoonlit7Ladder');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/auth/password');
    expect(JSON.parse(init.body as string)).toEqual({
      current_password: 'old secret value',
      new_password: 'troutmoonlit7Ladder',
    });
  });

  it('puts a weak new password on its own field, in words and not as a code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        problem(422, {
          code: 'validation_error',
          errors: [{ field: 'new_password', code: 'password_too_weak' }],
        }),
      ),
    );
    wrap(<ChangePasswordDialog open onClose={vi.fn()} />);
    await fill('old secret value', 'password1');
    expect(await screen.findByText(/easy to guess/i)).toBeInTheDocument();
    expect(screen.queryByText(/password_too_weak/)).not.toBeInTheDocument();
  });

  it('shows the wrong current password beside its field and does not sign the user out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        problem(422, {
          code: 'current_password_incorrect',
          errors: [{ field: 'current_password', code: 'current_password_incorrect' }],
        }),
      ),
    );
    const goToSignIn = vi.fn();
    wrap(
      <ChangePasswordDialog open onClose={vi.fn()} />,
      createSessionAwareClient('/users', goToSignIn).client,
    );
    await fill('wrong', 'troutmoonlit7Ladder');
    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
    expect(screen.queryByText(/current_password_incorrect/)).not.toBeInTheDocument();
    expect(goToSignIn).not.toHaveBeenCalled();
  });

  it('still signs the user out when the session itself has ended (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(401, { code: 'unauthenticated' })));
    const goToSignIn = vi.fn();
    wrap(
      <ChangePasswordDialog open onClose={vi.fn()} />,
      createSessionAwareClient('/users', goToSignIn).client,
    );
    await fill('whatever', 'troutmoonlit7Ladder');
    await waitFor(() => expect(goToSignIn).toHaveBeenCalledOnce());
  });

  it('keeps neither password in the markup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { container } = wrap(<ChangePasswordDialog open onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/current password/i), 'old secret value');
    await userEvent.type(screen.getByLabelText(/new password/i), 'troutmoonlit7Ladder');
    // Check while the values are typed, before submit clears them.
    expect(container.innerHTML).not.toContain('troutmoonlit7Ladder');
    expect(container.innerHTML).not.toContain('old secret value');
    const inputs = Array.from(container.querySelectorAll('input[type=password]'));
    expect(inputs).toHaveLength(2);
    for (const input of inputs) expect(input.hasAttribute('value')).toBe(false);
  });

  it('posts natively if the handler never runs, so a password cannot reach the URL', () => {
    const { container } = wrap(<ChangePasswordDialog open onClose={vi.fn()} />);
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
  });

  it('does not keep the passwords in the mutation cache once the call settles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const client = new QueryClient();
    const onClose = vi.fn();
    const { unmount } = wrap(<ChangePasswordDialog open onClose={onClose} />, client);
    await fill('old secret value', 'troutmoonlit7Ladder');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The dialog unmounts when it closes; gc only starts once nothing observes the mutation.
    unmount();
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
  });

  it('closes on Escape without sending anything', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    wrap(<ChangePasswordDialog open onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is announced as a modal dialog with a name', () => {
    wrap(<ChangePasswordDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Change password' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus into the dialog and keeps Tab inside it', async () => {
    wrap(<ChangePasswordDialog open onClose={vi.fn()} />);
    expect(screen.getByLabelText(/current password/i)).toHaveFocus();
    const submit = screen.getByRole('button', { name: 'Change password' });
    submit.focus();
    await userEvent.tab();
    expect(screen.getByLabelText(/current password/i)).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(submit).toHaveFocus();
  });

  it('returns focus to the button that opened it', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ChangePasswordDialog open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    wrap(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

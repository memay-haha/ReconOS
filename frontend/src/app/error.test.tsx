import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from './error';

describe('ErrorPage', () => {
  it('explains the outage in Vietnamese without leaking the error', () => {
    const error = Object.assign(new Error('secret backend detail'), { digest: 'abc123' });
    render(<ErrorPage error={error} reset={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /không tải được/i })).toBeInTheDocument();
    expect(screen.queryByText(/secret backend detail/)).toBeNull();
    expect(screen.queryByText(/abc123/)).toBeNull();
  });

  it('retries when the reader asks', async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('x')} reset={reset} />);
    await userEvent.click(screen.getByRole('button', { name: /thử lại/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

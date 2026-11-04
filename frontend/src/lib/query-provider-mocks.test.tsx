import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/users',
}));
vi.mock('@/mocks/browser', () => ({
  startMocks: () => Promise.reject(new Error('worker script not found')),
}));

import { QueryProvider } from './query-provider';

describe('QueryProvider when the sample-data worker cannot start', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('still renders the app and says why in the console', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <QueryProvider>
        <p>app content</p>
      </QueryProvider>,
    );
    expect(await screen.findByText('app content')).toBeInTheDocument();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('mockServiceWorker.js'),
      expect.any(Error),
    );
    log.mockRestore();
  });
});

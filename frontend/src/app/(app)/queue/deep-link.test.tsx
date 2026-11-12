import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jobRow, page, renderWithClient, stubApi } from '../programs/test-api';
import QueuePage from './page';

const JOB_ID = '0190b000-0000-7000-8000-0000000a8491';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/queue',
  useSearchParams: () => new URLSearchParams(`job=${JOB_ID}`),
}));

afterEach(() => vi.unstubAllGlobals());

describe('S10 deep link', () => {
  it('opens the logs of the job named by ?job= and marks its row', async () => {
    stubApi({
      '/dispatcher/status': {
        last_heartbeat_at: null,
        queued_by_tool_module: {},
        queued_by_program: {},
      },
      '/jobs?sort=-created_at&limit=25': page([jobRow(1, { id: JOB_ID })]),
    });
    renderWithClient(<QueuePage />);
    expect(await screen.findByRole('region', { name: 'Logs' })).toHaveTextContent('Logs of job');
    await vi.waitFor(() => {
      const row = screen
        .getAllByTitle(JOB_ID)
        .map((e) => e.closest('tr'))
        .find((tr) => tr !== null);
      expect(row).toHaveAttribute('aria-current', 'true');
    });
  });
});

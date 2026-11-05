import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calls,
  jobRow,
  ME_ADMIN,
  ME_USER,
  page,
  problem,
  renderWithClient,
  stubApi,
} from '../programs/test-api';
import QueuePage from './page';

const LIST = '/jobs?sort=-created_at';

const IDLE = { last_heartbeat_at: null, queued_by_tool_module: {}, queued_by_program: {} };

/** Every screen render reads the dispatcher; give it an idle answer unless a test says otherwise. */
function stubQueue(...[routes, me]: Parameters<typeof stubApi>) {
  return stubApi({ '/dispatcher/status': IDLE, ...routes }, me);
}

afterEach(() => vi.unstubAllGlobals());

function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest('tr') as HTMLElement;
}

describe('S10 queue', () => {
  it('counts each of the seven statuses with GET /jobs?status=X', async () => {
    const fetchMock = stubQueue({
      [LIST]: page([]),
      '/jobs?status=queued&limit=1': page([], { total: 1234 }),
    });
    renderWithClient(<QueuePage />);
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    for (const status of [
      'pending_approval',
      'queued',
      'dispatched',
      'running',
      'completed',
      'failed',
      'cancelled',
    ]) {
      expect(calls(fetchMock)).toContain(`GET /jobs?status=${status}&limit=1`);
    }
  });

  it('names queued work by tool module and program from the dispatcher status', async () => {
    stubQueue({
      [LIST]: page([]),
      '/dispatcher/status': {
        last_heartbeat_at: '2026-11-04T01:05:00Z',
        queued_by_tool_module: { tm1: 3 },
        queued_by_program: { p1: 2, unknown1234: 1 },
      },
      '/tool-modules?limit=200': page([{ id: 'tm1', name: 'nuclei' }]),
      '/programs?sort=name&limit=200': page([{ id: 'p1', name: 'Example Corp' }]),
    });
    renderWithClient(<QueuePage />);
    expect(await screen.findByText('04/11/2026 08:05')).toBeInTheDocument();
    expect(await screen.findByText('nuclei')).toBeInTheDocument();
    expect(screen.getAllByText('3 queued').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Example Corp')).length).toBeGreaterThan(0);
    expect(screen.getByText('nown1234')).toBeInTheDocument();
  });

  it('shows Workers to Admin and never asks for them as User', async () => {
    stubQueue({ [LIST]: page([]) }, ME_ADMIN);
    const { unmount } = renderWithClient(<QueuePage />);
    expect(await screen.findByText('Workers')).toBeInTheDocument();
    unmount();
    const fetchMock = stubQueue({ [LIST]: page([]) }, ME_USER);
    renderWithClient(<QueuePage />);
    await screen.findByText(/no jobs match/i);
    expect(screen.queryByText('Workers')).toBeNull();
    expect(calls(fetchMock).some((c) => c.includes('/workers'))).toBe(false);
  });

  it('filters by status and program', async () => {
    const fetchMock = stubQueue({
      [LIST]: page([jobRow(1)]),
      '/programs?sort=name&limit=200': page([{ id: 'p1', name: 'Example Corp' }]),
    });
    renderWithClient(<QueuePage />);
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'failed');
    expect(calls(fetchMock)).toContain('GET /jobs?status=failed&sort=-created_at');
    await screen.findByRole('option', { name: 'Example Corp' });
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    expect(calls(fetchMock)).toContain('GET /jobs?status=failed&program_id=p1&sort=-created_at');
  });

  it('offers the actions the status allows', async () => {
    stubQueue({
      [LIST]: page([
        jobRow(1, { status: 'pending_approval', target: ['pending.example.com'] }),
        jobRow(2, { status: 'running', target: ['running.example.com'] }),
        jobRow(3, {
          status: 'cancelled',
          target: ['cancelled.example.com'],
          status_reason: 'Out of scope',
        }),
        jobRow(4, { status: 'completed', target: ['done.example.com'] }),
      ]),
    });
    renderWithClient(<QueuePage />);
    await screen.findByRole('table');
    const names = (text: string) =>
      within(rowOf(text))
        .getAllByRole('button')
        .map((b) => b.textContent);
    expect(names('pending.example.com')).toEqual(['Approve', 'Reject', 'Raw outputs', 'Logs']);
    expect(names('running.example.com')).toEqual(['Cancel', 'Raw outputs', 'Logs']);
    expect(names('cancelled.example.com')).toEqual(['Retry', 'Raw outputs', 'Logs']);
    expect(names('done.example.com')).toEqual(['Raw outputs', 'Logs']);
    expect(screen.getByText('Out of scope')).toBeInTheDocument();
  });

  it('lets User act only on the jobs User created, and never approve', async () => {
    stubQueue(
      {
        [LIST]: page([
          jobRow(1, { status: 'failed', target: ['mine.example.com'], created_by: ME_USER.id }),
          jobRow(2, { status: 'failed', target: ['theirs.example.com'], created_by: 'other' }),
          jobRow(3, {
            status: 'pending_approval',
            target: ['wait.example.com'],
            created_by: ME_USER.id,
          }),
        ]),
      },
      ME_USER,
    );
    renderWithClient(<QueuePage />);
    await screen.findByRole('table');
    expect(
      within(rowOf('mine.example.com')).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
    expect(within(rowOf('theirs.example.com')).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(within(rowOf('wait.example.com')).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('says why self approval failed, in its own sentence', async () => {
    const fetchMock = stubQueue({
      [LIST]: page([jobRow(1, { status: 'pending_approval' })]),
      'POST /jobs/job-1-0000-0000/approve': () => problem(403, 'self_approval_forbidden'),
    });
    renderWithClient(<QueuePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/another account must approve/);
    expect(calls(fetchMock)).toContain('POST /jobs/job-1-0000-0000/approve');
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('cancels and retries through their endpoints', async () => {
    const fetchMock = stubQueue({
      [LIST]: page([
        jobRow(1, { status: 'queued', target: ['q.example.com'] }),
        jobRow(2, { status: 'failed', target: ['f.example.com'] }),
      ]),
      'POST /jobs/job-2-0000-0000/retry': jobRow(9),
    });
    renderWithClient(<QueuePage />);
    await screen.findByRole('table');
    await userEvent.click(within(rowOf('q.example.com')).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(rowOf('f.example.com')).getByRole('button', { name: 'Retry' }));
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining([
        'POST /jobs/job-1-0000-0000/cancel',
        'POST /jobs/job-2-0000-0000/retry',
      ]),
    );
  });

  it('opens the raw outputs of a job with a download link, and its logs', async () => {
    stubQueue({
      [LIST]: page([jobRow(1, { status: 'completed' })]),
      '/jobs/job-1-0000-0000/raw-outputs': page([
        {
          id: 'ro1',
          job_id: 'job-1-0000-0000',
          filename: 'out.jsonl',
          content_type: 'application/x-ndjson',
          size_bytes: 2048,
          sha256: '0',
          parse_status: 'parsed',
          parse_error: null,
          created_at: '2026-11-04T01:05:00Z',
          parsed_at: null,
        },
      ]),
      '/jobs/job-1-0000-0000/logs': page([
        {
          id: 'l1',
          logged_at: '2026-11-04T01:05:00Z',
          level: 'error',
          service: 'worker',
          event: '<b>job_failed</b>',
          job_id: 'job-1-0000-0000',
          context: {},
        },
      ]),
    });
    const { container } = renderWithClient(<QueuePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Raw outputs' }));
    expect(await screen.findByRole('link', { name: 'Download out.jsonl' })).toHaveAttribute(
      'href',
      '/api/v1/raw-outputs/ro1/content',
    );
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Logs' }));
    expect(await screen.findByText('<b>job_failed</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('reports a failed list without the backend title', async () => {
    stubQueue({ [LIST]: () => problem(500, 'internal_error') });
    renderWithClient(<QueuePage />);
    expect(await screen.findByText('Could not load the job list.')).toBeInTheDocument();
    expect(screen.queryByText('Backend title')).toBeNull();
  });
});

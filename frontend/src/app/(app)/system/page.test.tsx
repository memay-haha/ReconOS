import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DIAGNOSTIC, HEALTH, LOG, SETTING, TOOL } from './fixtures';
import { latestDeleteDay } from './log-panel';
import SystemPage from './page';
import {
  type Call,
  json,
  noContent,
  page,
  paths,
  problem,
  renderScreen,
  type Role,
  stubApi,
} from './test-api';

function standard(call: Call): Response | undefined {
  if (call.path === '/system/health') return json(HEALTH);
  if (call.path.startsWith('/tools')) return json(page([TOOL]));
  if (call.path.startsWith('/system/diagnostics') && call.method === 'GET') return json(DIAGNOSTIC);
  if (call.path === '/system/diagnostics' && call.method === 'POST')
    return json({ id: 'd1', status: 'running' });
  if (call.path.startsWith('/system-settings') && call.method === 'GET')
    return json(page([SETTING]));
  if (call.path.startsWith('/logs') && call.method === 'GET') return json(page([LOG]));
  return undefined;
}

function open(role: Role, answer: (call: Call) => Response | undefined = standard) {
  const calls = stubApi(role, answer);
  renderScreen(<SystemPage />);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('S15 system health', () => {
  it('shows each component with the status the backend computed', async () => {
    open('superadmin');
    const cards = await screen.findAllByRole('listitem');
    const vigolium = cards.find((c) => within(c).queryByText('Vigolium') !== null) as HTMLElement;
    expect(within(vigolium).getAllByText('degraded').length).toBeGreaterThan(0);
    expect(within(vigolium).getByText('1,420 ms')).toBeInTheDocument();
    const osmedeus = cards.find((c) => within(c).queryByText('Osmedeus') !== null) as HTMLElement;
    expect(within(osmedeus).getAllByText('down').length).toBeGreaterThan(0);
    expect(within(osmedeus).getByText('No reply')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('calls the Superadmin endpoints for a Superadmin', async () => {
    const calls = open('superadmin');
    await screen.findByText('log_retention_days');
    await screen.findByText('parse_failed');
    const read = paths(calls);
    expect(read).toContain('/system/health');
    expect(read).toContain('/tools?limit=200');
    expect(read).toContain('/system/diagnostics/latest');
    expect(read).toContain('/system-settings?limit=200');
    expect(read).toContain('/logs');
  });

  it('hides thresholds and log deletion from an Admin and never asks for them', async () => {
    const calls = open('admin');
    await screen.findByText('parse_failed');
    expect(screen.queryByRole('heading', { name: 'Operating Thresholds' })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete logs/i })).toBeNull();
    expect(paths(calls).some((p) => p.startsWith('/system-settings'))).toBe(false);
  });

  it('tells a User the screen is not theirs and calls nothing behind it', async () => {
    const calls = open('user');
    expect(await screen.findByText(/only a superadmin can open/i)).toBeInTheDocument();
    expect(paths(calls)).toEqual(['/auth/me']);
  });

  it('lists each tool with its tool modules and reported version (D4)', async () => {
    open('superadmin');
    await userEvent.click(await screen.findByRole('button', { name: 'Tools' }));
    expect(await screen.findByText('v3.3.5')).toBeVisible();
    expect(screen.getByText('osmedeus-general')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Missing (0)' })).toBeInTheDocument();
  });

  it('runs a diagnostic and shows its console output (D4)', async () => {
    const calls = open('admin');
    expect(await screen.findByText('Some checks failed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /run diagnostics/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('[WARN] vigolium: latency high')).toBeInTheDocument();
    expect(within(dialog).getByText('Exit code: 1')).toBeInTheDocument();
    expect(paths(calls, 'POST')).toEqual(['/system/diagnostics']);
  });

  it('rechecks one component only', async () => {
    const calls = open('admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Recheck Redis' }));
    await vi.waitFor(() => expect(paths(calls)).toContain('/system/health?component=redis'));
  });

  it('reloads the health on Refresh', async () => {
    const calls = open('superadmin');
    await screen.findByText('1,234');
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await vi.waitFor(() =>
      expect(paths(calls).filter((p) => p === '/system/health')).toHaveLength(2),
    );
  });

  it('reports a failed health check with its own sentence', async () => {
    open('superadmin', (call) =>
      call.path === '/system/health' ? problem(500, 'internal_error') : standard(call),
    );
    expect(await screen.findByText('Could not load the system health.')).toBeInTheDocument();
    expect(screen.queryByText('Backend Title')).toBeNull();
  });

  it('saves a threshold as a number', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json({ ...SETTING, value: 14 }) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Edit log_retention_days' }));
    const field = screen.getByRole('spinbutton');
    await userEvent.clear(field);
    await userEvent.type(field, '14');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/system-settings/log_retention_days',
        body: { value: 14 },
      }),
    );
  });

  it('translates a field error on a threshold', async () => {
    open('superadmin', (call) =>
      call.method === 'PATCH'
        ? problem(422, 'validation_error', [{ field: 'value', code: 'missing' }])
        : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Edit log_retention_days' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
  });

  it('filters the application log by level and service', async () => {
    const calls = open('admin');
    await screen.findByText('parse_failed');
    await userEvent.selectOptions(screen.getByLabelText('Level'), 'error');
    await userEvent.selectOptions(screen.getByLabelText('Service'), 'background');
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await vi.waitFor(() => expect(paths(calls)).toContain('/logs?level=error&service=background'));
  });

  it('sends the log date range as Vietnam-day instants', async () => {
    const calls = open('admin');
    await screen.findByText('parse_failed');
    await userEvent.type(screen.getByLabelText('From'), '2026-11-04');
    await userEvent.type(screen.getByLabelText('To'), '2026-11-05');
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await vi.waitFor(() =>
      expect(paths(calls)).toContain(
        '/logs?logged_at_from=2026-11-03T17%3A00%3A00.000Z&logged_at_to=2026-11-05T16%3A59%3A59.999Z',
      ),
    );
  });

  it('shows log context as text, never as markup', async () => {
    open('admin');
    await screen.findByText('parse_failed');
    expect(document.body.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  it('deletes logs before a chosen day only after a second confirmation', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'DELETE' ? noContent() : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: /delete logs/i }));
    const dialog = screen.getByRole('dialog');
    const day = within(dialog).getByLabelText(/delete every day before/i);
    expect(day).toHaveAttribute('max', latestDeleteDay());
    await userEvent.type(day, '2026-10-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete logs' }));
    expect(within(dialog).getByText(/cannot be undone/i)).toHaveTextContent('01/10/2026');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete logs' }));
    await vi.waitFor(() => expect(paths(calls, 'DELETE')).toEqual(['/logs?before=2026-10-01']));
  });

  it('refuses a day after today as the day to delete before', async () => {
    const calls = open('superadmin');
    await userEvent.click(await screen.findByRole('button', { name: /delete logs/i }));
    const dialog = screen.getByRole('dialog');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await userEvent.type(within(dialog).getByLabelText(/delete every day before/i), tomorrow);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete logs' }));
    expect(within(dialog).getByText('Pick today or an earlier day.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('picks today in UTC as the latest day', () => {
    expect(latestDeleteDay(new Date('2026-11-05T00:30:00Z'))).toBe('2026-11-05');
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calls,
  ME_ADMIN,
  ME_SUPERADMIN,
  ME_USER,
  page,
  problem,
  programRow,
  renderWithClient,
  stubApi,
} from '../programs/test-api';
import ManagePage from './page';

const LIST = '/programs?sort=name&limit=10';

afterEach(() => vi.unstubAllGlobals());

function rowOf(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr') as HTMLElement;
}

describe('S11 manage', () => {
  it('reads the table and the four totals', async () => {
    const fetchMock = stubApi({
      [LIST]: page([programRow(1, { last_job_finished_at: '2026-11-04T01:05:00Z' })]),
      '/programs?limit=1': page([], { total: 24 }),
      '/programs?status=active&limit=1': page([], { total: 18 }),
      '/programs?limit=1&has_in_scope_rule=false': page([], { total: 2 }),
      '/domains?limit=1': page([], { total: 4321 }),
      '/dashboard/summary?window=30d': { programs_new: 2 },
    });
    renderWithClient(<ManagePage />);
    expect(await screen.findByRole('link', { name: 'program-1' })).toHaveAttribute(
      'href',
      '/programs/p1',
    );
    expect(await screen.findByText('4,321')).toBeInTheDocument();
    // The tile and the All pill both carry the totals.
    expect(screen.getAllByText('24').length).toBeGreaterThan(1);
    expect(screen.getAllByText('18').length).toBeGreaterThan(1);
    expect(screen.getByText('75.0% active coverage')).toBeInTheDocument();
    expect(await screen.findByText('+2 this month')).toBeInTheDocument();
    expect(screen.getByText('04/11/2026 08:05')).toBeInTheDocument();
    expect(screen.getByText(/^Latency: \d+ms$/)).toBeInTheDocument();
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining([
        `GET ${LIST}`,
        'GET /programs?limit=1',
        'GET /programs?status=active&limit=1',
        'GET /programs?limit=1&has_in_scope_rule=false',
        'GET /domains?limit=1',
      ]),
    );
  });

  it('pauses an active program and resumes a paused one', async () => {
    const fetchMock = stubApi({
      [LIST]: page([programRow(1), programRow(2, { status: 'paused' })]),
    });
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Pause program-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Resume program-2' }));
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining(['POST /programs/p1/pause', 'POST /programs/p2/resume']),
    );
  });

  it('opens the scope of a program in place', async () => {
    const fetchMock = stubApi({ [LIST]: page([programRow(1)]) });
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    const toggle = screen.getByRole('button', { name: 'Scope of program-1' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(within(rowOf('program-1')).getByRole('button', { name: /add scope/i }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.type(await screen.findByLabelText('Wildcard'), '*.new.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add Scope' }));
    expect(calls(fetchMock)).toContain('GET /programs/p1/scope-rules?limit=200');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/v1/programs/p1/scope-rules');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      scope_type: 'in_scope',
      rule_type: 'wildcard',
      value: '*.new.example.com',
      reason: null,
    });
    expect(screen.getByRole('link', { name: /View full 4 definitions/ })).toHaveAttribute(
      'href',
      '/programs/p1?tab=scope',
    );
  });

  it('shows Delete to Superadmin only, and bulk Archive to Admin too', async () => {
    stubApi({ [LIST]: page([programRow(1)]) }, ME_ADMIN);
    const { unmount } = renderWithClient(<ManagePage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select program-1' }));
    expect(screen.getByRole('button', { name: /Archive Selected/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete program-1' })).toBeNull();
    unmount();
    stubApi({ [LIST]: page([programRow(1)]) }, ME_SUPERADMIN);
    renderWithClient(<ManagePage />);
    expect(await screen.findByRole('button', { name: 'Delete program-1' })).toBeInTheDocument();
  });

  it('asks before a hard delete, and reports a refusal in its own words', async () => {
    const fetchMock = stubApi(
      {
        [LIST]: page([programRow(1)]),
        'DELETE /programs/p1': () => problem(409, 'conflict'),
      },
      ME_SUPERADMIN,
    );
    renderWithClient(<ManagePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete program-1' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete program' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(calls(fetchMock)).toContain('DELETE /programs/p1');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/conflicts/);
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('pauses, resumes and deletes the selected programs in bulk', async () => {
    const fetchMock = stubApi({ [LIST]: page([programRow(1), programRow(2)]) }, ME_SUPERADMIN);
    renderWithClient(<ManagePage />);
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Select every program on this page' }),
    );
    expect(screen.getByText('2 programs selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Pause Selected/ }));
    const pause = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/bulk-pause'));
    expect(JSON.parse(String(pause?.[1]?.body))).toEqual({ ids: ['p1', 'p2'] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select program-1' }));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog', { name: 'Delete programs' });
    expect(calls(fetchMock)).not.toContain('POST /programs/bulk-delete');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(calls(fetchMock)).toContain('POST /programs/bulk-delete');
  });

  it('opens Run Scan for a program from + Target', async () => {
    stubApi({ [LIST]: page([programRow(1)]) });
    renderWithClient(<ManagePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run Scan on program-1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('gives User a read-only table', async () => {
    stubApi({ [LIST]: page([programRow(1)]) }, ME_USER);
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /new program/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(pause|resume|archive|delete) /i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select program-1' })).toBeNull();
  });

  it('filters by status, missing scope, unmapped and search text', async () => {
    const fetchMock = stubApi({ [LIST]: page([programRow(1)]) });
    renderWithClient(<ManagePage />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /^Active/ }));
    expect(calls(fetchMock)).toContain('GET /programs?status=active&sort=name&limit=10');
    await userEvent.click(screen.getByRole('button', { name: /^No Scope/ }));
    expect(calls(fetchMock)).toContain('GET /programs?sort=name&limit=10&has_in_scope_rule=false');
    await userEvent.click(screen.getByLabelText('Unmapped only'));
    expect(calls(fetchMock)).toContain(
      'GET /programs?sort=name&limit=10&has_in_scope_rule=false&has_domain=false',
    );
    await userEvent.type(screen.getByLabelText('Filter programs'), 'acme');
    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain(
        'GET /programs?sort=name&limit=10&q=acme&has_in_scope_rule=false&has_domain=false',
      ),
    );
  });

  it('says the table is empty, and says when it failed', async () => {
    stubApi({ [LIST]: page([]) });
    const { unmount } = renderWithClient(<ManagePage />);
    expect(await screen.findByText(/no programs match/i)).toBeInTheDocument();
    unmount();
    stubApi({ [LIST]: () => problem(500, 'internal_error') });
    renderWithClient(<ManagePage />);
    expect(await screen.findByText('Could not load the program list.')).toBeInTheDocument();
  });
});

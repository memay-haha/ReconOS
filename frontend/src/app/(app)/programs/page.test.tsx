import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProgramsPage from './page';
import {
  calls,
  ME_ADMIN,
  ME_USER,
  page,
  problem,
  programRow,
  renderWithClient,
  stubApi,
} from './test-api';

const LIST = '/programs?sort=-domain_count&limit=6';

const SUMMARY = {
  programs_new: 2,
  assets_new: { domain: 418, ip: 0, url: 0, service: 0 },
  findings_by_severity: { critical: 29, high: 1, medium: 1, low: 0, info: 0 },
  findings_near_sla: 18,
  active_sync_ratio: 0.917,
};

/** The screen's tiles read the dashboard summary; every test gets one. */
function stub(routes: Record<string, unknown>, me = ME_ADMIN) {
  return stubApi(
    {
      '/dashboard/summary?window=30d': SUMMARY,
      '/dashboard/summary?window=24h': SUMMARY,
      ...routes,
    },
    me,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S08 programs', () => {
  it('reads the list by most domains and fills the four tiles', async () => {
    const fetchMock = stub({
      [LIST]: page([programRow(1)]),
      '/programs?limit=1': page([programRow(1)], { total: 12 }),
      '/programs?status=active&limit=1': page([], { total: 9 }),
      '/programs?status=paused&limit=1': page([], { total: 3 }),
      '/domains?limit=1': page([], { total: 4321 }),
      '/domains?dns_status=resolved&limit=1': page([], { total: 4000 }),
    });
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByRole('heading', { name: 'program-1' })).toBeInTheDocument();
    expect(await screen.findByText('4,321')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(await screen.findByText('+2 this month')).toBeInTheDocument();
    expect(screen.getByText('92% active sync')).toBeInTheDocument();
    expect(screen.getByText('75.0% coverage')).toBeInTheDocument();
    expect(screen.getByText('3 paused')).toBeInTheDocument();
    expect(screen.getByText('+418 24h')).toBeInTheDocument();
    expect(screen.getByText('92.6% resolved')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('29 critical')).toBeInTheDocument();
    expect(screen.getByText('18 near breach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All\s*\(12\)/ })).toBeInTheDocument();
    expect(calls(fetchMock)).toEqual(
      expect.arrayContaining([`GET ${LIST}`, 'GET /dashboard/summary?window=30d']),
    );
  });

  it('shows a dash for active sync before the first active program', async () => {
    const empty = { ...SUMMARY, active_sync_ratio: null };
    stub({
      [LIST]: page([]),
      '/dashboard/summary?window=30d': empty,
      '/dashboard/summary?window=24h': empty,
    });
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByText('– active sync')).toBeInTheDocument();
  });

  it('searches, hides programs without scope and says how many it shows', async () => {
    const fetchMock = stub({ [LIST]: page([programRow(1)], { total: 7 }) });
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByText('Showing 7 programs')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search programs'), 'acme');
    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('GET /programs?sort=-domain_count&limit=6&q=acme'),
    );
    await userEvent.click(screen.getByLabelText('Show empty scope'));
    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain(
        'GET /programs?sort=-domain_count&limit=6&q=acme&has_in_scope_rule=true',
      ),
    );
  });

  it('shows the computed counts and links to the detail screen', async () => {
    stub({
      [LIST]: page([
        programRow(1, {
          platform_handle: 'example',
          last_job_finished_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        }),
      ]),
    });
    renderWithClient(<ProgramsPage />);
    const card = (await screen.findByRole('heading', { name: 'program-1' })).closest(
      '[data-program-card]',
    ) as HTMLElement;
    expect(within(card).getByText('3 In-Scope')).toBeInTheDocument();
    expect(within(card).getByText('1 Out-of-Scope')).toBeInTheDocument();
    expect(within(card).getByText('1 Crit')).toBeInTheDocument();
    expect(within(card).getByText('3 Med')).toBeInTheDocument();
    expect(within(card).queryByText('4 Low')).toBeNull();
    expect(within(card).getByText('hackerone/example')).toBeInTheDocument();
    expect(within(card).getByText('Last scanned 2h ago')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /view details/i })).toHaveAttribute(
      'href',
      '/programs/p1',
    );
  });

  it('never links a platform URL that is not http or https', async () => {
    stub({
      [LIST]: page([programRow(1, { platform_url: 'javascript:alert(1)' })]),
    });
    renderWithClient(<ProgramsPage />);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(screen.queryByRole('link', { name: 'hackerone' })).toBeNull();
    expect(screen.getByText('hackerone')).toBeInTheDocument();
  });

  it('filters by status and sorts, starting from the first page again', async () => {
    const fetchMock = stub({ [LIST]: page([programRow(1)]) });
    renderWithClient(<ProgramsPage />);
    await screen.findByRole('heading', { name: 'program-1' });
    await userEvent.click(screen.getByRole('button', { name: /^Paused/ }));
    expect(calls(fetchMock)).toContain('GET /programs?status=paused&sort=-domain_count&limit=6');
    await userEvent.selectOptions(screen.getByLabelText(/sort by/i), '-last_job_finished_at');
    expect(calls(fetchMock)).toContain(
      'GET /programs?status=paused&sort=-last_job_finished_at&limit=6',
    );
  });

  it('hides New Program from User', async () => {
    stub({ [LIST]: page([]) }, ME_USER);
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByText(/no programs match/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new program/i })).toBeNull();
  });

  it('creates a program from the form', async () => {
    const fetchMock = stub({ [LIST]: page([]), 'POST /programs': programRow(9) });
    renderWithClient(<ProgramsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /new program/i }));
    const dialog = screen.getByRole('dialog', { name: 'New Program' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Example');
    await userEvent.click(within(dialog).getByRole('button', { name: /create program/i }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'Example',
      platform: null,
      platform_url: null,
      platform_handle: null,
      bounty_type: 'bounty',
      description: null,
    });
  });

  it('shows the field error the backend reports, not its title', async () => {
    stub({
      [LIST]: page([]),
      'POST /programs': () =>
        new Response(
          JSON.stringify({
            title: 'Validation error',
            status: 422,
            code: 'validation_error',
            errors: [{ field: 'name', code: 'missing' }],
          }),
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
    });
    renderWithClient(<ProgramsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /new program/i }));
    await userEvent.click(screen.getByRole('button', { name: /create program/i }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(screen.queryByText('Validation error')).toBeNull();
  });

  it('says the list failed without the backend title', async () => {
    stub({ [LIST]: () => problem(500, 'internal_error') });
    renderWithClient(<ProgramsPage />);
    expect(await screen.findByText('Could not load the program list.')).toBeInTheDocument();
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('moves the cursor with Next', async () => {
    const fetchMock = stub({
      [LIST]: page([programRow(1)], { next_cursor: 'c2', total: 2 }),
      [`${LIST}&cursor=c2`]: page([programRow(2)]),
    });
    renderWithClient(<ProgramsPage />);
    await screen.findByRole('heading', { name: 'program-1' });
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    expect(await screen.findByRole('heading', { name: 'program-2' })).toBeInTheDocument();
    expect(calls(fetchMock)).toContain(`GET ${LIST}&cursor=c2`);
  });
});

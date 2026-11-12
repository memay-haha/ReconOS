import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calls,
  jobRow,
  ME_ADMIN,
  ME_SUPERADMIN,
  ME_USER,
  page,
  problem,
  programRow,
  renderWithClient,
  stubApi,
} from '../test-api';
import ProgramDetailPage from './page';

const push = vi.fn();
const replace = vi.fn();
// The tab lives in `?tab=`: a test opens a tab by setting it before rendering.
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useParams: () => ({ programId: 'p1' }),
  useRouter: () => ({ push, replace }),
  usePathname: () => '/programs/p1',
  useSearchParams: () => search,
}));

function onTab(tab: string): void {
  search = new URLSearchParams(`tab=${tab}`);
}

const RULES = page([
  {
    id: 'r1',
    program_id: 'p1',
    scope_type: 'in_scope',
    rule_type: 'wildcard',
    value: '*.example.com',
    reason: null,
    created_by: null,
    created_at: '2026-11-01T01:00:00Z',
  },
  {
    id: 'r2',
    program_id: 'p1',
    scope_type: 'out_of_scope',
    rule_type: 'domain',
    value: 'billing.example.com',
    reason: 'Vendor',
    created_by: null,
    created_at: '2026-11-01T01:00:00Z',
  },
]);

const BASE = {
  '/programs/p1': programRow(1),
  '/programs/p1/scope-rules?limit=200': RULES,
};

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
  replace.mockReset();
  search = new URLSearchParams();
});

describe('S09 program detail', () => {
  it('shows the program, its computed counts and both scope lists', async () => {
    stubApi(BASE);
    renderWithClient(<ProgramDetailPage />);
    expect(await screen.findByRole('heading', { name: 'program-1', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(await screen.findByText('*.example.com')).toBeInTheDocument();
    expect(screen.getByText('Reason: Vendor')).toBeInTheDocument();
  });

  it('says the program does not exist on a 404', async () => {
    stubApi({ '/programs/p1': () => problem(404, 'not_found') });
    renderWithClient(<ProgramDetailPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not exist/);
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('adds an Out-of-Scope rule with its reason', async () => {
    const fetchMock = stubApi({ ...BASE, 'POST /programs/p1/scope-rules': RULES.items[1] });
    renderWithClient(<ProgramDetailPage />);
    const form = await screen.findByRole('form', { name: 'Add Out-of-Scope rule' });
    await userEvent.selectOptions(within(form).getByLabelText('Rule type'), 'domain');
    await userEvent.type(within(form).getByLabelText('Value'), 'old.example.com');
    await userEvent.type(within(form).getByLabelText(/reason/i), 'Legacy');
    await userEvent.click(within(form).getByRole('button', { name: 'Add Exclusion' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/v1/programs/p1/scope-rules');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      scope_type: 'out_of_scope',
      rule_type: 'domain',
      value: 'old.example.com',
      reason: 'Legacy',
    });
  });

  it('deletes a scope rule', async () => {
    const fetchMock = stubApi(BASE);
    renderWithClient(<ProgramDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete *.example.com' }));
    expect(calls(fetchMock)).toContain('DELETE /scope-rules/r1');
  });

  it('gives User no write control and no Users or Proxies tab', async () => {
    const fetchMock = stubApi(BASE, ME_USER);
    renderWithClient(<ProgramDetailPage />);
    await screen.findByText('*.example.com');
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /archive/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Users' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Proxies' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Run Scan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add several In-Scope rules' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Trigger / })).toBeNull();
    expect(calls(fetchMock).some((c) => c.includes('/proxies'))).toBe(false);
  });

  it('lets only Superadmin delete the program', async () => {
    stubApi(BASE, ME_ADMIN);
    const { unmount } = renderWithClient(<ProgramDetailPage />);
    await screen.findByRole('button', { name: 'Archive program-1' });
    expect(screen.queryByRole('button', { name: 'Delete program-1' })).toBeNull();
    unmount();
    stubApi(BASE, ME_SUPERADMIN);
    renderWithClient(<ProgramDetailPage />);
    expect(await screen.findByRole('button', { name: 'Delete program-1' })).toBeInTheDocument();
  });

  it('asks before archiving, then goes back to Programs', async () => {
    const fetchMock = stubApi(BASE);
    renderWithClient(<ProgramDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Archive program-1' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive program' });
    expect(calls(fetchMock)).not.toContain('POST /programs/p1/archive');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(calls(fetchMock)).toContain('POST /programs/p1/archive');
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/programs'));
  });

  it('pauses an active program', async () => {
    const fetchMock = stubApi(BASE);
    renderWithClient(<ProgramDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pause program-1' }));
    expect(calls(fetchMock)).toContain('POST /programs/p1/pause');
  });

  it('lists the recent jobs on the Overview and names who triggered them', async () => {
    const fetchMock = stubApi({
      ...BASE,
      '/jobs?program_id=p1&sort=-created_at&limit=10': page([
        jobRow(1, { created_by: null }),
        jobRow(2, { created_by: ME_ADMIN.id, created_by_username: 'ops' }),
        jobRow(3, {
          created_by: '0190a000-0000-7000-8000-0000abcdef12',
          params: { templates: 'cves' },
        }),
      ]),
    });
    renderWithClient(<ProgramDetailPage />);
    expect(await screen.findByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('ops')).toBeInTheDocument();
    expect(screen.getByText('abcdef12')).toBeInTheDocument();
    expect(screen.getByText('(templates=cves)')).toBeInTheDocument();
    expect(calls(fetchMock)).toContain('GET /jobs?program_id=p1&sort=-created_at&limit=10');
  });

  it('keeps the tab in the URL', async () => {
    stubApi(BASE);
    renderWithClient(<ProgramDetailPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /Domains/ }));
    expect(replace).toHaveBeenCalledWith('/programs/p1?tab=domains', { scroll: false });
  });

  it('lists the domains of the program on the Domains tab', async () => {
    onTab('domains');
    const fetchMock = stubApi(BASE);
    renderWithClient(<ProgramDetailPage />);
    expect(await screen.findByRole('tab', { name: /Domains/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await vi.waitFor(() =>
      expect(calls(fetchMock)).toContain('GET /domains?program_id=p1&limit=25'),
    );
  });

  it('triggers a feed through its schedule', async () => {
    const fetchMock = stubApi({
      ...BASE,
      '/programs/p1/schedules': page([
        {
          id: 's1',
          program_id: 'p1',
          tool_module_id: 'tm1',
          target: ['*.example.com'],
          params: {},
          interval_minutes: 360,
          is_enabled: true,
          created_by: null,
          last_run_at: null,
          next_run_at: null,
          created_at: '2026-11-01T01:00:00Z',
        },
      ]),
      'POST /schedules/s1/run': { id: 'j9' },
    });
    renderWithClient(<ProgramDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Trigger / }));
    expect(calls(fetchMock)).toContain('POST /schedules/s1/run');
  });

  it('adds several In-Scope rules at once', async () => {
    const fetchMock = stubApi({ ...BASE, 'POST /programs/p1/scope-rules/bulk-create': {} });
    renderWithClient(<ProgramDetailPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add several In-Scope rules' }),
    );
    await userEvent.type(
      screen.getByLabelText('Values, one per line'),
      '*.a.example.com{enter}*.b.example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add rules' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/v1/programs/p1/scope-rules/bulk-create');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      items: [
        { scope_type: 'in_scope', rule_type: 'wildcard', value: '*.a.example.com', reason: null },
        { scope_type: 'in_scope', rule_type: 'wildcard', value: '*.b.example.com', reason: null },
      ],
    });
  });

  it('assigns a User account and offers only accounts with the User role', async () => {
    const fetchMock = stubApi({
      ...BASE,
      '/users?limit=200': page([
        { id: 'u1', username: 'alice', role: 'user' },
        { id: 'u2', username: 'bob', role: 'admin' },
      ]),
    });
    onTab('users');
    renderWithClient(<ProgramDetailPage />);
    const select = await screen.findByLabelText('User');
    await screen.findByRole('option', { name: 'alice' });
    expect(within(select).queryByRole('option', { name: 'bob' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/v1/programs/p1/users');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ user_id: 'u1' });
  });

  it('never shows a proxy URL and does not keep the typed one in the DOM', async () => {
    const fetchMock = stubApi({
      ...BASE,
      '/programs/p1/proxies': page([
        {
          id: 'x1',
          program_id: 'p1',
          name: 'egress',
          is_enabled: true,
          created_at: '2026-11-01T01:00:00Z',
          updated_at: '2026-11-01T01:00:00Z',
          url: 'http://user:secret@203.0.113.5:8080',
        },
      ]),
    });
    onTab('proxies');
    const { container } = renderWithClient(<ProgramDetailPage />);
    await screen.findByText('egress');
    expect(container.innerHTML).not.toContain('secret');
    const url = screen.getByLabelText('Proxy URL');
    expect(url).toHaveAttribute('type', 'password');
    await userEvent.type(url, 'http://u:pw@198.51.100.1:3128');
    expect(url.getAttribute('value')).toBeNull();
    await userEvent.type(screen.getByLabelText('Name'), 'new');
    await userEvent.click(screen.getByRole('button', { name: 'Add proxy' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: 'new',
      url: 'http://u:pw@198.51.100.1:3128',
    });
  });

  it('creates a schedule', async () => {
    const fetchMock = stubApi({
      ...BASE,
      '/tool-modules?limit=200': page([
        {
          id: 'tm1',
          name: 'nuclei',
          group: 'scan',
          is_enabled: true,
          default_params: {},
          max_concurrency: 1,
          rate_limit_per_minute: null,
          timeout_minutes: 60,
          updated_at: '2026-11-01T00:00:00Z',
        },
      ]),
    });
    onTab('scope');
    renderWithClient(<ProgramDetailPage />);
    await screen.findByRole('option', { name: 'nuclei' });
    await userEvent.type(
      within(screen.getByRole('form', { name: 'New schedule' })).getByLabelText(/targets/i),
      'example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/v1/programs/p1/schedules');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      tool_module_id: 'tm1',
      target: ['example.com'],
      interval_minutes: 1440,
    });
  });
});

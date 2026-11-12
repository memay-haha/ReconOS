import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { page, paths, problem, renderWithClient, stubFetch } from '../domains/test-support';
import MonitorPage from './page';
import { replace, setSearch } from './test-navigation';

vi.mock('next/navigation', async () => (await import('./test-navigation')).navigationMock);

const DOMAIN = {
  id: 'd1',
  program_id: 'p1',
  name: 'auth.example.com',
  apex: 'example.com',
  is_wildcard: false,
  cname: null,
  dns_status: 'nxdomain',
  in_scope: true,
  first_seen_at: '2026-10-12T07:22:00Z',
  last_seen_at: '2026-11-04T01:05:00Z',
  ips: ['198.51.100.24', '198.51.100.25'],
  url_count: 2410,
  service_count: 6,
  finding_counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  asn: 64500,
  asn_org: 'EXAMPLE-NET',
};

const IP = {
  id: 'i1',
  program_id: 'p2',
  address: '203.0.113.7',
  asn: 13335,
  asn_org: 'EXAMPLE-NET',
  country: 'VN',
  is_private: false,
  cdn_name: null,
  ptr: null,
  in_scope: false,
  first_seen_at: '2026-10-12T07:22:00Z',
  last_seen_at: '2026-11-04T01:05:00Z',
};

const URL_ROW = {
  id: 'u1',
  program_id: 'p1',
  domain_id: 'd1',
  ip_id: null,
  url: 'https://auth.example.com/login',
  scheme: 'https',
  host: 'auth.example.com',
  port: 443,
  path: '/login',
  status_code: 200,
  title: '<script>alert(1)</script>',
  content_length: 10,
  content_type: 'text/html',
  webserver: 'nginx',
  favicon_hash: null,
  in_scope: true,
  first_seen_at: '2026-10-12T07:22:00Z',
  last_seen_at: '2026-11-04T01:05:00Z',
};

const SERVICE = {
  id: 's1',
  program_id: 'p1',
  ip_id: 'i1',
  port: 8443,
  transport: 'tcp',
  name: 'https',
  product: 'Apache',
  version: '2.4.52',
  banner: null,
  in_scope: true,
  first_seen_at: '2026-10-12T07:22:00Z',
  last_seen_at: '2026-11-04T01:05:00Z',
};

function routes() {
  return {
    '/api/v1/domains': page([DOMAIN]),
    '/api/v1/ips': page([IP]),
    '/api/v1/urls': page([URL_ROW]),
    '/api/v1/services': page([SERVICE]),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setSearch('');
  window.localStorage.clear();
});

describe('S03 asset monitor', () => {
  it('opens on Domains, and counts every tab with one row each', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<MonitorPage />);
    expect(await screen.findByText('auth.example.com')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /domains/i })).toHaveAttribute('aria-selected', 'true');
    expect(paths(fetchMock)).toContain('/api/v1/domains?sort=name&limit=25');
    expect(paths(fetchMock)).toContain('/api/v1/ips?limit=1');
    expect(paths(fetchMock)).toContain('/api/v1/urls?limit=1');
    expect(paths(fetchMock)).toContain('/api/v1/services?limit=1');
    await vi.waitFor(() =>
      expect(screen.getByRole('tab', { name: /ips/i })).toHaveTextContent('IPs1'),
    );
    expect(screen.getByText('NXDOMAIN', { selector: 'td span' })).toBeInTheDocument();
    expect(screen.getByText('(2 IPs)')).toBeInTheDocument();
    expect(screen.getByText('AS64500 EXAMPLE-NET')).toBeInTheDocument();
    expect(screen.getByText('6 ports')).toBeInTheDocument();
    expect(screen.getByText('2,410')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Asset pagination' })).toHaveTextContent(
      'Showing 1–1 of 1 records',
    );
    expect(screen.getByRole('link', { name: /view detail/i })).toHaveAttribute(
      'href',
      '/domains/d1',
    );
  });

  it('switches tabs in the URL, drops the domain-only filters, exports the open tab', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
      'href',
      '/api/v1/domains/export?format=csv',
    );

    await userEvent.click(screen.getByRole('tab', { name: /ips/i }));
    expect(replace).toHaveBeenCalledWith('/monitor?tab=ips', { scroll: false });
    expect(await screen.findByText('203.0.113.7')).toBeInTheDocument();
    expect(screen.getByText('AS13335')).toBeInTheDocument();
    expect(screen.getByText('Out-of-Scope')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain('/api/v1/ips?limit=25');
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
      'href',
      '/api/v1/ips/export?format=csv',
    );
    expect(screen.queryByRole('button', { name: 'NXDOMAIN' })).toBeNull();
    expect(screen.queryByLabelText('Scope')).toBeNull();
  });

  it('renders URL text from the target as text, never as markup or a link', async () => {
    stubFetch(routes());
    const { container } = renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('tab', { name: /urls/i }));
    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByRole('link', { name: /auth\.example\.com\/login/ })).toBeNull();
  });

  it('lists services without a selection column', async () => {
    stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('tab', { name: /services/i }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('8443')).toBeInTheDocument();
    expect(within(table).queryByRole('checkbox')).toBeNull();
  });

  it('moves between tabs with the arrow keys', async () => {
    stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    screen.getByRole('tab', { name: /domains/i }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /ips/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /ips/i })).toHaveFocus();
  });

  it('filters domains by program, DNS status and scope', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await screen.findByRole('option', { name: 'Example Corp' });
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Unresolved' }));
    await userEvent.selectOptions(screen.getByLabelText('Scope'), 'true');
    // Decision M4: Unresolved is nxdomain and timeout.
    expect(paths(fetchMock)).toContain(
      '/api/v1/domains?program_id=p1&dns_status=nxdomain&dns_status=timeout&in_scope=true&sort=name&limit=25',
    );
    // Decision N8: the badge tells the list is narrowed to In-Scope assets.
    expect(screen.getByText('Active Scope')).toBeInTheDocument();
  });

  it('opens the tab the URL names, as S02 View all does', async () => {
    setSearch('tab=services');
    stubFetch(routes());
    renderWithClient(<MonitorPage />);
    expect(screen.getByRole('tab', { name: /services/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('8443')).toBeInTheDocument();
  });

  it('starts filtered by the program the URL names, as S09 Open full list links do', async () => {
    setSearch('tab=ips&program_id=p2');
    const fetchMock = stubFetch(routes());
    renderWithClient(<MonitorPage />);
    expect(await screen.findByText('203.0.113.7')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain('/api/v1/ips?program_id=p2&limit=25');
  });

  it('filters every tab by the quick filter, once typing pauses', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.type(screen.getByLabelText('Quick filter'), '*.example.com');
    await vi.waitFor(() =>
      expect(paths(fetchMock)).toContain('/api/v1/domains?q=*.example.com&sort=name&limit=25'),
    );
    expect(paths(fetchMock)).toContain('/api/v1/ips?q=*.example.com&limit=1');
    expect(paths(fetchMock).some((p) => p.includes('q=*.example.co&'))).toBe(false);
  });

  it('exports only the selected rows', async () => {
    stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    expect(screen.getByRole('link', { name: /export selected/i })).toHaveAttribute(
      'href',
      '/api/v1/domains/export?format=csv&ids=d1',
    );
  });

  it('hides a column the reader turns off, and remembers it', async () => {
    stubFetch(routes());
    const { unmount } = renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'ASN / Org' }));
    expect(screen.queryByRole('columnheader', { name: 'ASN / Org' })).toBeNull();
    unmount();
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    expect(screen.queryByRole('columnheader', { name: 'ASN / Org' })).toBeNull();
  });

  it('hides and shows the filters', async () => {
    stubFetch(routes());
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    const toggle = screen.getByRole('button', { name: /filters/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Program')).toBeNull();
  });

  it('runs a scan for selected IPs of one program', async () => {
    const fetchMock = stubFetch({ ...routes(), '/api/v1/jobs': { id: 'j1', status: 'queued' } });
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('tab', { name: /ips/i }));
    await screen.findByText('203.0.113.7');
    await userEvent.click(screen.getByLabelText('Select 203.0.113.7'));
    const run = screen.getByRole('button', { name: /run scan/i });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Program: Example Org')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create job' }));
    await screen.findByText('Job created.');
    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/v1/jobs');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      program_id: 'p2',
      target: ['203.0.113.7'],
    });
  });

  it('shows the out-of-scope answer of the backend in its own words', async () => {
    stubFetch({
      ...routes(),
      '/api/v1/jobs': () => problem(422, 'target_out_of_scope'),
    });
    renderWithClient(<MonitorPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    const run = screen.getByRole('button', { name: /run scan/i });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);
    await userEvent.click(await screen.findByRole('button', { name: 'Create job' }));
    expect(await screen.findByText(/outside the program scope/i)).toBeInTheDocument();
  });

  it('says a tab is empty, and reports a failure without the backend title', async () => {
    stubFetch({ ...routes(), '/api/v1/domains': page([]), '/api/v1/ips': () => problem(500) });
    renderWithClient(<MonitorPage />);
    expect(await screen.findByText('No domains match these filters.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /ips/i }));
    expect(await screen.findByText('Could not load the IPs.')).toBeInTheDocument();
    expect(screen.queryByText('Backend title')).toBeNull();
  });
});

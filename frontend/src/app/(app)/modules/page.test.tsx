import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROGRAM } from '../system/fixtures';
import {
  type Call,
  json,
  page,
  paths,
  problem,
  renderScreen,
  type Role,
  stubApi,
} from '../system/test-api';
import ModulesPage from './page';
import { moduleList, moduleRow } from './test-fixtures';

const THREADS_RATE = {
  properties: {
    threads: { type: 'integer', default: 25 },
    rate: { type: 'integer', default: 150 },
  },
};

const MODULES = [
  moduleRow('t3', 'sqlmap', 'exploit'),
  moduleRow('t2', 'nuclei', 'scan', true, {
    title: 'Template Scan',
    output_types: ['finding'],
    finding_count: 790,
    param_schema: THREADS_RATE,
  }),
  moduleRow('t1', 'osmedeus-domain-lite', 'recon', true, {
    title: 'Subdomain Enumeration',
    runs_on: 'osmedeus',
    tools: ['subfinder', 'amass'],
    output_types: ['domain', 'ip'],
    jobs_24h: 482,
    engine_status: 'ok',
    last_job_at: new Date(Date.now() - 18 * 60_000).toISOString(),
  }),
  moduleRow('t4', 'dalfox', 'exploit', false),
];

function standard(call: Call): Response | undefined {
  if (call.method !== 'GET') return undefined;
  if (call.path.startsWith('/tool-modules/stats'))
    return json({ jobs: 1420, jobs_prev: 1000, stalled: 2 });
  if (call.path.startsWith('/tool-modules')) return json(moduleList(MODULES));
  if (call.path === '/dispatcher/status')
    return json({
      last_heartbeat_at: null,
      queued_by_tool_module: {},
      queued_by_program: {},
      status: 'ok',
    });
  if (call.path.startsWith('/programs/p1/scope-rules'))
    return json(
      page([
        { id: 'r0', scope_type: 'out_of_scope', value: 'admin.example.com' },
        { id: 'r1', scope_type: 'in_scope', value: '*.example.com' },
      ]),
    );
  if (call.path.startsWith('/programs')) return json(page([PROGRAM]));
  return undefined;
}

function open(role: Role, answer: (call: Call) => Response | undefined = standard) {
  const calls = stubApi(role, answer);
  renderScreen(<ModulesPage />);
  return calls;
}

function rowOf(name: string): HTMLElement {
  return screen.getAllByText(name)[0]?.closest('tr') as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe('S18 modules', () => {
  it('opens on the card grid, Recon first, then Scan, then Exploit', async () => {
    open('user');
    await screen.findByText('Subdomain Enumeration');
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('table')).toBeNull();
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      'Subdomain Enumeration',
      'Template Scan',
      'dalfox title',
      'sqlmap title',
    ]);
  });

  it('draws the engine, output, last run and counter on a card (D7, M22, N44)', async () => {
    open('user');
    const card = (await screen.findByText('Subdomain Enumeration')).closest('li') as HTMLElement;
    expect(within(card).getByText('Osmedeus (subfinder/amass)')).toBeInTheDocument();
    expect(within(card).getByText('domain / ip')).toBeInTheDocument();
    expect(within(card).getByText('Requires Osmedeus • OK')).toBeInTheDocument();
    expect(within(card).getByText('18m ago')).toBeInTheDocument();
    expect(within(card).getByText('482 jobs in 24h')).toBeInTheDocument();
    const scan = screen.getByText('Template Scan').closest('li') as HTMLElement;
    expect(within(scan).getByText('790 findings indexed')).toBeInTheDocument();
    const off = screen.getByText('dalfox title').closest('li') as HTMLElement;
    expect(within(off).getByText('Disabled • Turned off by a Superadmin')).toBeInTheDocument();
  });

  it('fills the tiles from the list totals and the job stats', async () => {
    const calls = open('admin');
    await screen.findByText('Subdomain Enumeration');
    const enabled = screen.getByRole('region', { name: 'Enabled' });
    expect(within(enabled).getByText('1 disabled')).toBeInTheDocument();
    expect(within(enabled).getByText('Disabled: dalfox')).toBeInTheDocument();
    expect(within(enabled).getByText('75% ready')).toBeInTheDocument();
    const jobs = screen.getByRole('region', { name: 'Jobs in 24 hours' });
    expect(await within(jobs).findByText('42%')).toBeInTheDocument();
    expect(within(jobs).getByText('2 stalled')).toBeInTheDocument();
    expect(within(jobs).getByRole('link', { name: /open queue/i })).toHaveAttribute(
      'href',
      '/queue',
    );
    expect(screen.getByText('Dispatcher Synced')).toBeInTheDocument();
    expect(paths(calls)).toContain('/tool-modules/stats?window=24h');
  });

  it('sends the filters as query parameters', async () => {
    const calls = open('user');
    await screen.findByText('Subdomain Enumeration');
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter tool modules' }), 'nu');
    await userEvent.click(screen.getByRole('button', { name: /^Scan \(/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /engine/i }), 'osmedeus');
    await userEvent.click(screen.getByRole('switch', { name: 'Show Disabled' }));
    await vi.waitFor(() =>
      expect(paths(calls)).toContain(
        '/tool-modules?limit=200&q=nu&group=scan&runs_on=osmedeus&is_enabled=true',
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear the filter' }));
    expect(screen.getByRole('textbox', { name: 'Filter tool modules' })).toHaveValue('');
  });

  it('lists the mockup columns in the table view', async () => {
    open('user');
    await screen.findByText('Subdomain Enumeration');
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    const row = rowOf('osmedeus-domain-lite');
    expect(within(row).getByText('Osmedeus (subfinder/amass)')).toBeInTheDocument();
    expect(within(row).getByText('482')).toBeInTheDocument();
    expect(within(rowOf('sqlmap')).getByText('Exploit')).toBeInTheDocument();
  });

  it('gives an Admin no switch, no Configure and no engine settings links', async () => {
    open('admin');
    await screen.findByText('Subdomain Enumeration');
    expect(screen.queryByRole('switch', { name: /enable/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /configure/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /osmedeus settings/i })).toBeNull();
    expect(screen.getByRole('link', { name: /health & tools/i })).toHaveAttribute(
      'href',
      '/system',
    );
    expect(screen.getByRole('button', { name: 'Run nuclei' })).toBeEnabled();
  });

  it('lets a Superadmin disable a tool module, and enable one from its card', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(MODULES[0]) : standard(call),
    );
    await userEvent.click(await screen.findByRole('switch', { name: 'Enable nuclei' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enable dalfox now' }));
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'PATCH')).toEqual([
        { method: 'PATCH', path: '/tool-modules/t2', body: { is_enabled: false } },
        { method: 'PATCH', path: '/tool-modules/t4', body: { is_enabled: true } },
      ]),
    );
    expect(screen.getByRole('link', { name: /osmedeus settings/i })).toHaveAttribute(
      'href',
      '/osmedeus',
    );
  });

  it('saves the configuration columns and confirms with a toast', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(MODULES[1]) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Configure nuclei' }));
    const dialog = screen.getByRole('dialog');
    const concurrency = within(dialog).getByLabelText('Max concurrent jobs');
    await userEvent.clear(concurrency);
    await userEvent.type(concurrency, '4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        default_params: {},
        max_concurrency: 4,
        rate_limit_per_minute: null,
        timeout_minutes: 120,
      }),
    );
    expect(await screen.findByText('Configuration of nuclei saved.')).toBeInTheDocument();
  });

  it('refuses default parameters that are not a JSON object', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(MODULES[1]) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Configure nuclei' }));
    const dialog = screen.getByRole('dialog');
    const params = within(dialog).getByLabelText(/default parameters/i);
    await userEvent.clear(params);
    await userEvent.type(params, '[1]');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText(/as a JSON object/i)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('dispatches with Threads and Rate from the parameter schema (D7)', async () => {
    const calls = open('user', (call) =>
      call.method === 'POST' ? json({ id: 'j1', status: 'queued' }) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run nuclei' }));
    const dialog = screen.getByRole('dialog', { name: 'Dispatch Capability' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/program/i), 'p1');
    expect(await within(dialog).findByText('In-Scope: *.example.com')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/targets/i), 'a.example.com');
    const threads = within(dialog).getByLabelText('Threads');
    expect(threads).toHaveValue(25);
    await userEvent.clear(threads);
    await userEvent.type(threads, '40');
    expect(within(dialog).queryByText(/alternative/i)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dispatch to Queue' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        path: '/jobs',
        body: {
          program_id: 'p1',
          tool_module_id: 't2',
          target: ['a.example.com'],
          params: { threads: 40, rate: 150 },
        },
      }),
    );
    expect(await screen.findByText('Job created for nuclei.')).toBeInTheDocument();
    expect(paths(calls)).toContain('/programs?status=active&limit=200');
  });

  it('shows no Threads or Rate when the schema lacks them, and warns about approval', async () => {
    open('user');
    await userEvent.click(await screen.findByRole('button', { name: 'Run sqlmap' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Threads')).toBeNull();
    expect(within(dialog).getByText(/requires approval/i)).toBeInTheDocument();
  });

  it('names an out-of-scope target the way the backend reports it', async () => {
    open('user', (call) =>
      call.method === 'POST' ? problem(422, 'target_out_of_scope') : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run nuclei' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/program/i), 'p1');
    await userEvent.type(within(dialog).getByLabelText(/targets/i), 'other.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dispatch to Queue' }));
    expect(await screen.findByText(/outside the program scope/i)).toBeInTheDocument();
    expect(screen.queryByText('Backend Title')).toBeNull();
  });

  it('cannot run a disabled tool module', async () => {
    open('user');
    expect(await screen.findByRole('button', { name: 'Run dalfox' })).toBeDisabled();
  });

  it('reports a failed list with its own sentence', async () => {
    open('user', () => problem(500, 'internal_error'));
    expect(await screen.findByText('Could not load the tool module list.')).toBeInTheDocument();
  });
});

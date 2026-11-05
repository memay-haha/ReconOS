import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROGRAM, toolModule } from '../system/fixtures';
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

const MODULES = [
  toolModule('t3', 'sqlmap', 'exploit'),
  toolModule('t2', 'nuclei', 'scan'),
  toolModule('t1', 'gowitness', 'recon'),
  toolModule('t4', 'dalfox', 'exploit', false),
];

function standard(call: Call): Response | undefined {
  if (call.method === 'GET' && call.path === '/tool-modules?limit=200') return json(page(MODULES));
  if (call.method === 'GET' && call.path.startsWith('/programs')) return json(page([PROGRAM]));
  return undefined;
}

function open(role: Role, answer: (call: Call) => Response | undefined = standard) {
  const calls = stubApi(role, answer);
  renderScreen(<ModulesPage />);
  return calls;
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe('S18 modules', () => {
  it('lists one row per tool module, Recon first, then Scan, then Exploit', async () => {
    const calls = open('user');
    await screen.findByText('gowitness');
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[1]?.textContent);
    expect(names).toEqual(['gowitness', 'nuclei', 'dalfox', 'sqlmap']);
    expect(within(rowOf('sqlmap')).getByText('Exploit')).toBeInTheDocument();
    expect(paths(calls)).toContain('/tool-modules?limit=200');
  });

  it('gives an Admin no switch and no Configure', async () => {
    open('admin');
    await screen.findByText('gowitness');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /configure/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Run gowitness' })).toBeEnabled();
  });

  it('lets a Superadmin disable a tool module', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(MODULES[0]) : standard(call),
    );
    await userEvent.click(await screen.findByRole('switch', { name: 'Enable nuclei' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/tool-modules/t2',
        body: { is_enabled: false },
      }),
    );
  });

  it('saves the configuration columns, an empty rate limit as none', async () => {
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
  });

  it('sends edited default parameters and refuses text that is not a JSON object', async () => {
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

    await userEvent.clear(params);
    // userEvent treats { as a key descriptor, so the brace is escaped by doubling it.
    await userEvent.type(params, '{{"severity": "high"}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
        default_params: { severity: 'high' },
      }),
    );
  });

  it('runs a tool module on a chosen program with free targets', async () => {
    const calls = open('user', (call) =>
      call.method === 'POST' ? json({ id: 'j1', status: 'queued' }) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run nuclei' }));
    await userEvent.selectOptions(await screen.findByLabelText('Program'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Program: Example Corp')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/targets/i), 'a.example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create job' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        path: '/jobs',
        body: { program_id: 'p1', tool_module_id: 't2', target: ['a.example.com'] },
      }),
    );
    expect(await screen.findByText('Job created for nuclei.')).toBeInTheDocument();
    expect(paths(calls)).toContain('/programs?status=active&limit=200');
  });

  it('warns that an Exploit job waits for approval', async () => {
    open('user');
    await userEvent.click(await screen.findByRole('button', { name: 'Run sqlmap' }));
    await userEvent.selectOptions(await screen.findByLabelText('Program'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/requires approval/i)).toBeInTheDocument();
  });

  it('names an out-of-scope target the way the backend reports it', async () => {
    open('user', (call) =>
      call.method === 'POST' ? problem(422, 'target_out_of_scope') : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run nuclei' }));
    await userEvent.selectOptions(await screen.findByLabelText('Program'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.type(screen.getByLabelText(/targets/i), 'other.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
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

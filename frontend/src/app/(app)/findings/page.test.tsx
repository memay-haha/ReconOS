import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROGRAM } from '../system/fixtures';
import {
  type Call,
  json,
  noContent,
  page,
  paths,
  problem,
  renderScreen,
  stubApi,
} from '../system/test-api';
import { curlOf } from './finding-drawer';
import FindingsPage from './page';
import { findingDetail, findingRow, SUMMARY } from './test-fixtures';

const ROWS = [
  findingRow('f1', { severity: 'critical' }),
  findingRow('f2', {
    matched_at: null,
    asset: { type: 'domain', name: 'b.example.com', ip: null, port: null, service_name: null },
  }),
];

function standard(call: Call): Response | undefined {
  if (call.method !== 'GET') return undefined;
  if (call.path.startsWith('/programs')) return json(page([PROGRAM]));
  if (call.path.startsWith('/domains'))
    return json(page([{ id: 'd1', name: 'api.example.com', program_id: 'p1' }]));
  if (call.path.startsWith('/tool-modules'))
    return json(page([{ id: 't2', name: 'nuclei', group: 'scan', is_enabled: true }]));
  if (call.path.startsWith('/tags'))
    return json(
      page([
        {
          id: 't1',
          key: 'env',
          value: 'prod',
          created_by: null,
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 't2',
          key: 'tier',
          value: 'auth',
          created_by: null,
          created_at: '2026-10-01T00:00:00Z',
        },
      ]),
    );
  if (call.path.startsWith('/findings/summary')) return json(SUMMARY);
  if (call.path.startsWith('/findings/f')) {
    const id = call.path.split('/')[2] ?? '';
    return ROWS.some((r) => r.id === id) ? json(findingDetail(id)) : problem(404, 'not_found');
  }
  if (call.path.startsWith('/findings')) return json(page(ROWS));
  return undefined;
}

function open(answer: (call: Call) => Response | undefined = standard) {
  const calls = stubApi('user', answer);
  const view = renderScreen(<FindingsPage />);
  return { calls, view };
}

afterEach(() => vi.unstubAllGlobals());

describe('S20 findings explorer', () => {
  it('reads every finding with no filter and draws the row columns', async () => {
    const { calls } = open();
    const row = (await screen.findByText('Finding f1')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Example Corp')).toBeInTheDocument();
    expect(within(row).getByText('Critical')).toBeInTheDocument();
    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(within(row).getByText('word: activeProfiles')).toBeInTheDocument();
    expect(within(row).getByText('Port: 443 (https) • IP: 198.51.100.7')).toBeInTheDocument();
    expect(paths(calls)).toContain('/findings?limit=10');
    expect(paths(calls)).toContain('/findings/summary');
  });

  it('fills the severity tiles, spectrum and status counts from the summary (M8, M40)', async () => {
    open();
    await screen.findByText('Finding f1');
    expect(await screen.findByText('Informational')).toBeInTheDocument();
    expect(screen.getAllByText('+2 new in 24h')).toHaveLength(1);
    expect(screen.getByText('Total: 12 Findings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical (2)' })).toBeInTheDocument();
    const statuses = screen.getByRole('list', { name: 'Triage status' });
    expect(within(statuses).getByText('Confirmed').nextSibling).toHaveTextContent('3');
  });

  it('filters by search, program, domain, status and repeated severities', async () => {
    const { calls } = open();
    await screen.findByText('Finding f1');
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter findings' }), 'env');
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    await userEvent.selectOptions(await screen.findByLabelText('Domain'), 'd1');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'confirmed');
    await userEvent.click(screen.getByRole('button', { name: /^High/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Critical/ }));
    await vi.waitFor(() =>
      expect(paths(calls)).toContain(
        '/findings?program_id=p1&domain_id=d1&severity=critical&severity=high&triage_status=confirmed&q=env&limit=10',
      ),
    );
    expect(paths(calls)).toContain('/domains?program_id=p1&limit=200');
    // The tiles keep every severity under the other filters.
    expect(paths(calls)).toContain(
      '/findings/summary?program_id=p1&domain_id=d1&triage_status=confirmed&q=env',
    );
  });

  it('hides false positives by sending every other status (C2)', async () => {
    const { calls } = open();
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('switch', { name: 'Hide False Positives' }));
    await vi.waitFor(() =>
      expect(paths(calls)).toContain(
        '/findings?triage_status=new&triage_status=confirmed&triage_status=duplicate&triage_status=reported&triage_status=resolved&limit=10',
      ),
    );
  });

  it('offers the six triage statuses of schema.md', async () => {
    open();
    await screen.findByText('Finding f1');
    const options = within(screen.getByLabelText('Status'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      'Status: All',
      'Status: New',
      'Status: Confirmed',
      'Status: False positive',
      'Status: Duplicate',
      'Status: Reported',
      'Status: Resolved',
    ]);
  });

  it('exports with the current filter from the Export menu', async () => {
    open();
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: /^Critical/ }));
    await userEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByRole('menuitem', { name: /CSV Table/ })).toHaveAttribute(
      'href',
      '/api/v1/findings/export?format=csv&severity=critical',
    );
    expect(screen.getByRole('menuitem', { name: /Markdown Dossier/ })).toHaveAttribute(
      'href',
      '/api/v1/findings/export?format=md&severity=critical',
    );
  });

  it('acts on the selection: confirm, false positive, export the ids', async () => {
    const { calls } = open((call) => (call.method === 'POST' ? noContent() : standard(call)));
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: 'Bulk Triage' }));
    expect(screen.getByText('findings selected')).toBeInTheDocument();
    expect(screen.getByText('| Across 1 program')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute(
      'href',
      '/api/v1/findings/export?format=csv&ids=f1&ids=f2',
    );
    expect(screen.queryByText(/push to jira/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'False Positive' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        path: '/findings/bulk-triage',
        body: { ids: ['f1', 'f2'], triage_status: 'false_positive' },
      }),
    );
    expect(await screen.findByText('Marked 2 findings false positive.')).toBeInTheDocument();
  });

  it('drafts a report from the selection and links it (batch 11)', async () => {
    const { calls } = open((call) =>
      call.method === 'POST' && call.path === '/reports' ? json({ id: 'r9' }) : standard(call),
    );
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: 'Bulk Triage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Report' }));
    expect(await screen.findByRole('link', { name: 'Open the report' })).toHaveAttribute(
      'href',
      '/reports/r9',
    );
    const post = calls.find((c) => c.path === '/reports');
    expect(post?.body).toMatchObject({ finding_ids: ['f1', 'f2'] });
  });

  it('says nothing changed when the bulk call fails', async () => {
    open((call) => (call.method === 'POST' ? problem(409, 'conflict') : standard(call)));
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Finding f2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark confirmed' }));
    expect(await screen.findByText(/no finding was changed/i)).toBeInTheDocument();
    expect(screen.queryByText('Backend Title')).toBeNull();
  });

  it('re-scans the selection with the tool module that found it (N49)', async () => {
    const { calls } = open((call) =>
      call.method === 'POST' ? json({ id: 'j9', status: 'queued' }) : standard(call),
    );
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: 'Bulk Triage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Re-scan' }));
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')).toEqual([
        {
          method: 'POST',
          path: '/jobs',
          body: {
            program_id: 'p1',
            tool_module_id: 't2',
            target: ['https://api.example.com/env', 'b.example.com'],
          },
        },
      ]),
    );
    expect(await screen.findByText('Created 1 job to re-scan the selection.')).toBeInTheDocument();
  });

  it('changes one status from the row menu, without duplicate (N51)', async () => {
    const { calls } = open((call) =>
      call.method === 'PATCH' ? json(findingRow('f1')) : standard(call),
    );
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: 'Change status of Finding f1' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Duplicate' })).toBeNull();
    // Reported comes only from submitting a report (batch 11).
    expect(within(menu).queryByRole('menuitem', { name: 'Reported' })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Resolved' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/findings/f1',
        body: { triage_status: 'resolved', duplicate_of_id: null },
      }),
    );
  });

  it('copies the Markdown export of one row', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { calls } = open((call) =>
      call.path.startsWith('/findings/export') ? new Response('## Finding f1') : standard(call),
    );
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Finding f1 as Markdown' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('## Finding f1'));
    expect(paths(calls)).toContain('/findings/export?format=md&ids=f1');
  });

  it('shows the D2 detail as text, with the scope and asset type (N50)', async () => {
    const { calls, view } = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finding f1' });
    const response = await within(dialog).findByText(/<script>alert\(1\)<\/script>/);
    expect(response.tagName).toBe('PRE');
    expect(view.container.querySelector('script')).toBeNull();
    expect(
      within(dialog).getByText('Example Corp (In-Scope: *.example.com • url)'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('The actuator endpoint answers without authentication.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Expose only health and info.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy cURL' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Download raw output' })).toHaveAttribute(
      'href',
      '/api/v1/raw-outputs/raw-f1/content',
    );
    expect(paths(calls)).toContain('/findings/f1');
  });

  it('saves the status picked on the segmented buttons', async () => {
    const { calls } = open((call) =>
      call.method === 'PATCH' ? json(findingDetail('f1')) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Vulnerability Synopsis');
    expect(within(dialog).getByRole('button', { name: 'New (current)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmed' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Triage Status' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        triage_status: 'confirmed',
        duplicate_of_id: null,
      }),
    );
    expect(await within(dialog).findByText('Triage saved.')).toBeInTheDocument();
  });

  it('requires the original finding when marking a duplicate', async () => {
    const { calls } = open((call) =>
      call.method === 'PATCH' ? json(findingDetail('f1')) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Vulnerability Synopsis');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicate' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Triage Status' }));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.type(within(dialog).getByLabelText('Original finding ID'), 'f2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Triage Status' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        triage_status: 'duplicate',
        duplicate_of_id: 'f2',
      }),
    );
  });

  it('marks a false positive from the dialog footer', async () => {
    const { calls } = open((call) =>
      call.method === 'PATCH' ? json(findingDetail('f1')) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Mark False Positive' }),
    );
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        triage_status: 'false_positive',
        duplicate_of_id: null,
      }),
    );
  });

  it('greys out the statuses the backend does not allow from here', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Vulnerability Synopsis');
    expect(within(dialog).getByRole('button', { name: 'Reported' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Resolved' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Confirmed' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'New (current)' })).toBeEnabled();
  });

  it('names a refused triage move instead of a generic conflict', async () => {
    open((call) =>
      call.method === 'PATCH'
        ? problem(409, 'conflict', [{ field: 'triage_status', code: 'invalid_transition' }])
        : standard(call),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change status of Finding f1' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Resolved' }));
    expect(
      await screen.findByText(
        'The finding cannot move to this triage status from its current one.',
      ),
    ).toBeInTheDocument();
  });

  it('adds and removes a tag by sending the whole set', async () => {
    const { calls } = open((call) => (call.method === 'PUT' ? noContent() : standard(call)));
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('env: prod')).toBeInTheDocument();
    await within(dialog).findByRole('option', { name: 'tier: auth' });
    expect(within(dialog).queryByRole('option', { name: 'env: prod' })).toBeNull();
    await userEvent.selectOptions(within(dialog).getByLabelText('Tag to add'), 't2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add tag' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
        path: '/findings/f1/tags',
        body: { tag_ids: ['t1', 't2'] },
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove tag env: prod' }));
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'PUT').at(-1)?.body).toEqual({ tag_ids: [] }),
    );
  });

  it('translates a field error from triage', async () => {
    open((call) =>
      call.method === 'PATCH'
        ? problem(422, 'validation_error', [{ field: 'duplicate_of_id', code: 'not_found' }])
        : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Vulnerability Synopsis');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicate' }));
    await userEvent.type(within(dialog).getByLabelText('Original finding ID'), 'zz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Triage Status' }));
    expect(await within(dialog).findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.queryByText('Backend Title')).toBeNull();
  });

  it('says the list is empty rather than showing a bare table', async () => {
    open((call) => (call.path.startsWith('/findings?') ? json(page([])) : standard(call)));
    expect(await screen.findByText('No findings match.')).toBeInTheDocument();
  });

  it('moves the cursor with Next, counts the range and changes the page size', async () => {
    const { calls } = open((call) =>
      call.path.startsWith('/findings?')
        ? json(page(ROWS, { next_cursor: 'c2', total: 30 }))
        : standard(call),
    );
    await screen.findByText('Finding f1');
    expect(screen.getByText('1–2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Finding f1' }));
    await userEvent.click(screen.getByRole('button', { name: /^Next/ }));
    await vi.waitFor(() => expect(paths(calls)).toContain('/findings?limit=10&cursor=c2'));
    expect(screen.queryByText(/finding(s)? selected/)).toBeNull();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /rows/i }), '25');
    await vi.waitFor(() => expect(paths(calls)).toContain('/findings?limit=25'));
  });
});

describe('curlOf', () => {
  it('rebuilds a quoted curl command from the raw request', () => {
    expect(
      curlOf("GET /a?x=1 HTTP/1.1\nHost: example.com\nX-T: it's", 'https://example.com/a'),
    ).toBe("curl -X 'GET' 'https://example.com/a?x=1' \\\n  -H 'X-T: it'\\''s'");
  });

  it('gives up on a request without a request line', () => {
    expect(curlOf('', null)).toBeNull();
  });
});

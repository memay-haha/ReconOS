import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { finding, PROGRAM } from '../system/fixtures';
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
import FindingsPage from './page';

const ROWS = [finding('f1', { severity: 'critical' }), finding('f2')];

function standard(call: Call): Response | undefined {
  if (call.method === 'GET' && call.path.startsWith('/programs')) return json(page([PROGRAM]));
  if (call.method === 'GET' && call.path.startsWith('/findings/f')) {
    const id = call.path.split('/')[2];
    const row = ROWS.find((r) => r.id === id);
    return row === undefined ? problem(404, 'not_found') : json(row);
  }
  if (call.method === 'GET' && call.path.startsWith('/findings')) return json(page(ROWS));
  return undefined;
}

function open(answer: (call: Call) => Response | undefined = standard) {
  const calls = stubApi('user', answer);
  const view = renderScreen(<FindingsPage />);
  return { calls, view };
}

afterEach(() => vi.unstubAllGlobals());

describe('S20 findings explorer', () => {
  it('reads every finding with no filter and names the program', async () => {
    const { calls } = open();
    const row = (await screen.findByText('Finding f1')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Example Corp')).toBeInTheDocument();
    expect(within(row).getByText('Critical')).toBeInTheDocument();
    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(paths(calls)).toContain('/findings');
  });

  it('filters by program, triage status and repeated severities', async () => {
    const { calls } = open();
    await screen.findByText('Finding f1');
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'confirmed');
    await userEvent.click(screen.getByRole('button', { name: 'High' }));
    await userEvent.click(screen.getByRole('button', { name: 'Critical' }));
    expect(screen.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() =>
      expect(paths(calls).at(-1)).toBe(
        '/findings?program_id=p1&severity=critical&severity=high&triage_status=confirmed',
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
      'All statuses',
      'New',
      'Confirmed',
      'False positive',
      'Duplicate',
      'Reported',
      'Resolved',
    ]);
  });

  it('exports with the current filter in each format', async () => {
    open();
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('button', { name: 'Critical' }));
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
      'href',
      '/api/v1/findings/export?format=csv&severity=critical',
    );
    expect(screen.getByRole('link', { name: /export jsonl/i })).toHaveAttribute(
      'href',
      '/api/v1/findings/export?format=jsonl&severity=critical',
    );
    expect(screen.getByRole('link', { name: /export markdown/i })).toHaveAttribute(
      'href',
      '/api/v1/findings/export?format=md&severity=critical',
    );
  });

  it('marks the selected findings confirmed in one bulk call', async () => {
    const { calls } = open((call) => (call.method === 'POST' ? noContent() : standard(call)));
    await screen.findByText('Finding f1');
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select every finding on this page' }),
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark confirmed' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        path: '/findings/bulk-triage',
        body: { ids: ['f1', 'f2'], triage_status: 'confirmed' },
      }),
    );
    expect(await screen.findByText('Marked 2 findings confirmed.')).toBeInTheDocument();
  });

  it('says nothing changed when the bulk call fails', async () => {
    open((call) => (call.method === 'POST' ? problem(409, 'conflict') : standard(call)));
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Finding f2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark confirmed' }));
    expect(await screen.findByText(/no finding was changed/i)).toBeInTheDocument();
    expect(screen.queryByText('Backend Title')).toBeNull();
  });

  it('shows evidence as text and links the raw output', async () => {
    const { calls, view } = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const detail = await screen.findByRole('region', { name: 'Finding detail' });
    const pre = await within(detail).findByText('<img src=x onerror=alert(1)>');
    expect(pre.tagName).toBe('PRE');
    expect(view.container.querySelector('img')).toBeNull();
    expect(within(detail).getByRole('link', { name: 'Download raw output' })).toHaveAttribute(
      'href',
      '/api/v1/raw-outputs/raw-f1/content',
    );
    expect(paths(calls)).toContain('/findings/f1');
  });

  it('requires the original finding when marking a duplicate', async () => {
    const { calls } = open((call) =>
      call.method === 'PATCH' ? json(finding('f1')) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const detail = await screen.findByRole('region', { name: 'Finding detail' });
    await userEvent.selectOptions(
      await within(detail).findByLabelText('Triage status'),
      'duplicate',
    );
    const original = within(detail).getByLabelText('Original finding ID');
    expect(original).toBeRequired();
    await userEvent.type(original, 'f2');
    await userEvent.click(within(detail).getByRole('button', { name: 'Save triage' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/findings/f1',
        body: { triage_status: 'duplicate', duplicate_of_id: 'f2' },
      }),
    );
  });

  it('sends no original finding for any other status', async () => {
    const { calls } = open((call) =>
      call.method === 'PATCH' ? json(finding('f1')) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const detail = await screen.findByRole('region', { name: 'Finding detail' });
    await userEvent.selectOptions(
      await within(detail).findByLabelText('Triage status'),
      'false_positive',
    );
    await userEvent.click(within(detail).getByRole('button', { name: 'Save triage' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        triage_status: 'false_positive',
        duplicate_of_id: null,
      }),
    );
    expect(await within(detail).findByText('Triage saved.')).toBeInTheDocument();
  });

  it('translates a field error from triage', async () => {
    open((call) =>
      call.method === 'PATCH'
        ? problem(422, 'validation_error', [{ field: 'duplicate_of_id', code: 'missing' }])
        : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    const detail = await screen.findByRole('region', { name: 'Finding detail' });
    await userEvent.selectOptions(
      await within(detail).findByLabelText('Triage status'),
      'duplicate',
    );
    await userEvent.type(within(detail).getByLabelText('Original finding ID'), 'zz');
    await userEvent.click(within(detail).getByRole('button', { name: 'Save triage' }));
    expect(await within(detail).findByText('This field is required.')).toBeInTheDocument();
  });

  it('says a finding that is gone does not exist', async () => {
    open((call) => (call.path === '/findings/f1' ? problem(404, 'not_found') : standard(call)));
    await userEvent.click(await screen.findByRole('button', { name: 'Open Finding f1' }));
    expect(await screen.findByText('The finding does not exist.')).toBeInTheDocument();
  });

  it('says the list is empty rather than showing a bare table', async () => {
    open((call) => (call.path === '/findings' ? json(page([])) : standard(call)));
    expect(await screen.findByText('No findings match.')).toBeInTheDocument();
  });

  it('moves the cursor with Next and clears the selection', async () => {
    const { calls } = open((call) => {
      if (call.path === '/findings') return json(page(ROWS, { next_cursor: 'c2', total: 3 }));
      if (call.path === '/findings?cursor=c2') return json(page([finding('f3')]));
      return standard(call);
    });
    await screen.findByText('Finding f1');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Finding f1' }));
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByText('Finding f3');
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(paths(calls)).toContain('/findings?cursor=c2');
  });
});

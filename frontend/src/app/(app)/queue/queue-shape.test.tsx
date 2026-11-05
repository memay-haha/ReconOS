import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cut, mockupDocument, pagerToNav, regionsOf, textOf } from '../programs/shape-helpers';
import { jobRow, page, renderWithClient, stubApi } from '../programs/test-api';
import QueuePage from './page';

/** Columns the decision log renames (M2) or drops, by mockup header. */
const RENAMED: Readonly<Record<string, string>> = {
  'JOB ID': 'Job ID',
  PROGRAM: 'Program',
  'TARGET DOMAIN': 'Target',
  'SCAN TYPE': 'Tool module',
  STATUS: 'Status',
  'QUEUED AT': 'Created',
  DURATION: 'Duration',
  ACTIONS: 'Actions',
};
const DROPPED_COLUMNS = [
  { label: 'WORKER', reason: 'M2: job columns are Target, Tool module, Created, Duration' },
];

function prunedMockup() {
  const doc = mockupDocument('s10-staging-queue.html');
  const root = doc.querySelector('main') as Element;

  // The mockup names the screen in a span; a page needs one h1 (WCAG 1.3.1, M6).
  root.prepend(doc.createElement('h1'));

  const table = root.querySelector('table') as Element;
  const heads = Array.from(table.querySelectorAll('thead th'));
  const drop = DROPPED_COLUMNS.map(({ label, reason }) => {
    const at = heads.findIndex((th) => textOf(th) === label);
    if (at === -1) throw new Error(`Dropped column not in the mockup (${reason}): ${label}`);
    return at;
  });
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.children);
    drop.forEach((i) => cells[i]?.remove());
  }
  const columns = Array.from(table.querySelectorAll('thead th')).map(
    (th) => RENAMED[textOf(th)] ?? textOf(th),
  );

  // First, page numbers and Last go: Previous and Next only (frontend/CLAUDE.md).
  const first = Array.from(root.querySelectorAll('button')).find((b) => textOf(b) === 'First');
  pagerToNav(first?.closest('div') as Element);
  // Auto-refresh follows WebSocket events; there is no pause switch to build.
  cut(root, 'input[placeholder^="Filter jobs"]', 'M3: no string search (debt 39)');
  return { root, columns };
}

function renderScreen() {
  stubQueue({ '/jobs?sort=-created_at': page([jobRow(1)]) });
  return renderWithClient(<QueuePage />);
}

const IDLE = { last_heartbeat_at: null, queued_by_tool_module: {}, queued_by_program: {} };

/** Every screen render reads the dispatcher; give it an idle answer unless a test says otherwise. */
function stubQueue(...[routes, me]: Parameters<typeof stubApi>) {
  return stubApi({ '/dispatcher/status': IDLE, ...routes }, me);
}

afterEach(() => vi.unstubAllGlobals());

describe('S10 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByRole('table');
    expect(regionsOf(container.firstElementChild as Element)).toEqual(regionsOf(mockup.root));
  });

  it('has the mockup columns, renamed and minus the dropped one, in order', async () => {
    const mockup = prunedMockup();
    renderScreen();
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map(textOf)).toEqual(mockup.columns);
  });

  it('shows one card per job status, seven in all', async () => {
    const { container } = renderScreen();
    await screen.findByRole('table');
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(7);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = renderScreen();
    await screen.findByRole('table');
    const words = textOf(container);
    for (const banned of [
      'Staging',
      'Generate Jobs',
      'Dispatch All',
      'Dispatch Now',
      'Cleanup',
      'CPU LOAD',
      'Redis',
      'Throughput',
      'Processing',
      'View Artifact',
      'Stop',
    ]) {
      expect(words).not.toContain(banned);
    }
    expect(container.querySelector('input[type=text]')).toBeNull();
  });
});

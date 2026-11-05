import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import DomainsPage from './page';
import {
  cut,
  el,
  findByText,
  ME_ADMIN,
  page,
  parseMockup,
  renderWithClient,
  retag,
  stubFetch,
  textOf,
} from './test-support';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../docs/design/screens/s04-domains.html',
);
const landmarks = { landmarks: true };

const SHORT = { C: 'critical', H: 'high', M: 'medium', L: 'low', I: 'info' } as const;

interface MockRow {
  name: string;
  counts: Record<(typeof SHORT)[keyof typeof SHORT], number>;
}

interface Mockup {
  root: Element;
  columns: string[];
  rows: MockRow[];
  tileCount: number;
}

/** `main` of the mockup, pruned to what the product builds. Every cut names its rule in the
 * part C table of docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. */
function prunedMockup(): Mockup {
  const doc = parseMockup(readFileSync(mockupFile, 'utf8'));
  const root = doc.querySelector('main') as Element;
  const [header, grid, panel] = Array.from(root.children) as [Element, Element, Element];

  // Header: Filter Presets has no endpoint (M3). Export CSV downloads and Add Scope opens S11,
  // so both are links.
  findByText(header, 'button', 'Filter Presets').remove();
  retag(findByText(header, 'button', 'Export CSV'), 'a');
  retag(findByText(header, 'button', 'Add Scope'), 'a');

  // Tiles with no source (M3).
  for (const label of ['WITH FINDINGS', 'NEW IN 24H']) {
    const tile = Array.from(grid.children).find((t) => textOf(t).startsWith(label));
    if (tile === undefined) throw new Error(`Dropped tile not in the mockup: ${label}`);
    tile.remove();
  }

  const [toolbar, bulk, tableBox, footer] = Array.from(panel.children) as [
    Element,
    Element,
    Element,
    Element,
  ];
  // Toolbar: no string search (M3, debt 39). The program dropdown is a labelled select. The
  // segmented control has the four dns_status values (M2). "Findings only" has no filter
  // parameter (M3); the scope select takes its place. Column and density settings have no
  // endpoint (M3); Refresh stays.
  cut(toolbar, 'input[type=text]', 'string search, debt 39');
  const programButton = findByText(toolbar, 'button', 'Program:');
  programButton.replaceWith(el(doc, 'label'), el(doc, 'select'));
  const segmented = findByText(toolbar, 'div.flex', 'Unresolved');
  segmented.replaceChildren(...Array.from({ length: 5 }, () => el(doc, 'button')));
  findByText(toolbar, 'label', 'Findings only').replaceWith(el(doc, 'label', el(doc, 'select')));
  cut(toolbar, 'button[title="Column Display Configuration"]', 'no column settings');
  cut(toolbar, 'button[title="Density Settings"]', 'no density setting');

  // Bulk bar: Export, Tag Program and Delete have no endpoint (M3).
  for (const label of ['Export', 'Tag Program', 'Delete']) {
    const button = Array.from(bulk.querySelectorAll('button')).find((b) =>
      textOf(b).endsWith(label),
    );
    if (button === undefined) throw new Error(`Bulk button not in the mockup: ${label}`);
    button.remove();
  }

  // Findings chips carry a name for assistive technology (M2, decision log).
  const table = tableBox.querySelector('table') as Element;
  const rows: MockRow[] = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
    const cells = Array.from(tr.children);
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const chip of Array.from(cells[7]?.querySelectorAll('span') ?? [])) {
      const m = /^([CHMLI]):(\d+)$/.exec(textOf(chip));
      if (m === null) continue;
      counts[SHORT[m[1] as keyof typeof SHORT]] = Number(m[2]);
      chip.setAttribute('role', 'img');
    }
    return { name: textOf(cells[1] as Element), counts };
  });
  // A header's sort icon is a ligature, not part of its name.
  const columns = Array.from(table.querySelectorAll('thead th')).map((th) => {
    const copy = th.cloneNode(true) as Element;
    copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
    return textOf(copy);
  });

  // Footer: numbered pages, First and Last are banned (M1); the pager is a nav of Previous and
  // Next, and the page size a labelled select.
  footer.replaceChildren(
    el(doc, 'nav', el(doc, 'button'), el(doc, 'button')),
    el(doc, 'div', el(doc, 'label'), el(doc, 'select')),
  );

  return { root, columns, rows, tileCount: grid.children.length };
}

function rowsFrom(mockup: Mockup) {
  return mockup.rows.map((r, i) => ({
    id: `d${i}`,
    program_id: 'p1',
    name: r.name,
    apex: 'example.com',
    is_wildcard: false,
    cname: null,
    dns_status: 'resolved',
    in_scope: true,
    first_seen_at: '2026-10-12T07:22:00Z',
    last_seen_at: '2026-11-04T01:05:00Z',
    ips: ['198.51.100.24'],
    url_count: 3,
    service_count: 2,
    finding_counts: r.counts,
  }));
}

async function renderScreen(mockup: Mockup) {
  stubFetch({ '/api/v1/domains': page(rowsFrom(mockup), { next_cursor: 'c1' }) }, ME_ADMIN);
  const view = renderWithClient(<DomainsPage />);
  await screen.findByRole('table');
  await screen.findByRole('link', { name: /add scope/i });
  // The mockup draws the bulk bar with rows selected.
  await userEvent.click(screen.getByLabelText(`Select ${mockup.rows[0]?.name ?? ''}`));
  return view;
}

afterEach(() => vi.unstubAllGlobals());

// Rendering a full mockup page of rows is slow on a loaded machine.
describe('S04 against its mockup', { timeout: 20_000 }, () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = await renderScreen(mockup);
    const mine = shapeOf(container.firstElementChild as Element, 0, landmarks).slice(1);
    // A pruning slip that empties both trees must not pass as a match.
    expect(mine.length).toBeGreaterThan(200);
    expect(mine).toEqual(shapeOf(mockup.root, 0, landmarks).slice(1));
  });

  it('has the columns of the mockup, renamed only where the decision log says', async () => {
    const mockup = prunedMockup();
    await renderScreen(mockup);
    const renamed: Record<string, string> = {
      PORTS: 'Services',
      'LAST SCAN': 'Last seen',
      DISCOVERED: 'First seen',
    };
    const expected = mockup.columns.map((c) => renamed[c] ?? c);
    const mine = screen.getAllByRole('columnheader').map(textOf);
    expect(mine.map((c) => c.toUpperCase())).toEqual(expected.map((c) => c.toUpperCase()));
  });

  it('shows the stat tiles of the mockup minus the dropped ones', async () => {
    const mockup = prunedMockup();
    const { container } = await renderScreen(mockup);
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tileCount);
  });

  it('builds nothing from the dropped parts', async () => {
    const mockup = prunedMockup();
    const { container } = await renderScreen(mockup);
    expect(container.querySelector('input[type=text], input[type=search]')).toBeNull();
    const words = textOf(container);
    for (const banned of ['BBRF', 'LIVE SYNC', 'Filter Presets', 'Tag Program', 'Delete', 'today'])
      expect(words).not.toContain(banned);
  });
});

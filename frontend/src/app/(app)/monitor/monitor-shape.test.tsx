import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import {
  cut,
  el,
  findByText,
  page,
  parseMockup,
  renderWithClient,
  retag,
  stubFetch,
  textOf,
} from '../domains/test-support';
import MonitorPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../docs/design/screens/s03-asset-monitor.html',
);
const landmarks = { landmarks: true };

interface Mockup {
  root: Element;
  columns: string[];
  names: string[];
}

/** The content column of the mockup, pruned to what the product builds. Every cut names its
 * rule in the part C table of docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. */
function prunedMockup(): Mockup {
  const doc = parseMockup(readFileSync(mockupFile, 'utf8'));
  const root = doc.querySelector('body > div') as Element;
  // The topbar belongs to the app shell, not to this screen.
  cut(root, ':scope > header', 'topbar lives in the shell');
  const [top, tableArea] = Array.from(root.children) as [Element, Element];
  const [titleRow, tabsRow, filterBar, bulk] = Array.from(top.children) as [
    Element,
    Element,
    Element,
    Element,
  ];

  // Export CSV downloads a file, so it is a link.
  retag(findByText(titleRow, 'button', 'Export CSV'), 'a');

  // Tabs switch the panel below in place: a tablist, not navigation (M6).
  const nav = tabsRow.querySelector('nav') as Element;
  const tablist = retag(nav, 'div', { role: 'tablist' });
  for (const link of Array.from(tablist.querySelectorAll('a')))
    retag(link, 'button', { role: 'tab' });

  // Filter bar: no string search (M3, debt 39). The program select is labelled. The segmented
  // control has the four dns_status values (M2), followed by the in_scope select. Column
  // settings have no endpoint (M3).
  cut(filterBar, 'input[type=text]', 'string search, debt 39');
  const select = filterBar.querySelector('select') as Element;
  select.before(el(doc, 'label'));
  const segmented = findByText(filterBar, 'div.flex', 'Unresolved');
  segmented.replaceChildren(...Array.from({ length: 5 }, () => el(doc, 'button')));
  segmented.after(el(doc, 'label', el(doc, 'select')));
  cut(filterBar, 'button[title="Customize columns"]', 'no column settings');

  // Bulk bar: Export Selected has no endpoint (M3).
  findByText(bulk, 'button', 'Export Selected').remove();

  // The table area is the panel of the selected tab (M6).
  tableArea.setAttribute('role', 'tabpanel');
  const table = tableArea.querySelector('table') as Element;
  const heads = Array.from(table.querySelectorAll('thead th'));
  // A domain row carries no ASN or organisation (M3).
  const asn = heads.findIndex((th) => textOf(th) === 'ASN / ORG');
  if (asn === -1) throw new Error('ASN / ORG column not in the mockup');
  for (const tr of Array.from(table.querySelectorAll('tr'))) tr.children[asn]?.remove();
  // View Detail opens S05: a link.
  for (const button of Array.from(table.querySelectorAll('button'))) retag(button, 'a');
  const columns = Array.from(table.querySelectorAll('thead th')).map(textOf);
  const names = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    textOf(tr.children[1] as Element),
  );

  // Footer: numbered pages, First and Last are banned (M1); Previous and Next sit in a nav.
  const footer = tableArea.querySelector(':scope > div.border-t') as Element;
  footer.replaceChildren(
    el(doc, 'nav', el(doc, 'button'), el(doc, 'button')),
    el(doc, 'div', el(doc, 'label'), el(doc, 'select')),
  );
  return { root, columns, names };
}

function rowsFrom(names: string[]) {
  return names.map((name, i) => ({
    id: `d${i}`,
    program_id: 'p1',
    name,
    apex: 'example.com',
    is_wildcard: false,
    cname: null,
    dns_status: 'resolved',
    in_scope: true,
    first_seen_at: '2026-10-12T07:22:00Z',
    last_seen_at: '2026-11-04T01:05:00Z',
    ips: ['198.51.100.24', '198.51.100.25'],
    url_count: 3,
    service_count: 2,
    finding_counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  }));
}

async function renderScreen(mockup: Mockup) {
  stubFetch({ '/api/v1/domains': page(rowsFrom(mockup.names), { next_cursor: 'c1' }) });
  const view = renderWithClient(<MonitorPage />);
  await screen.findByRole('table');
  // The mockup draws the bulk bar with rows selected.
  await userEvent.click(screen.getByLabelText(`Select ${mockup.names[0] ?? ''}`));
  return view;
}

afterEach(() => vi.unstubAllGlobals());

// Rendering a full mockup page of rows is slow on a loaded machine.
describe('S03 against its mockup', { timeout: 20_000 }, () => {
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
    const renamed: Record<string, string> = { 'OPEN PORTS': 'Services', 'LAST SCAN': 'Last seen' };
    const expected = mockup.columns.map((c) => (renamed[c] ?? c).toUpperCase());
    const mine = screen.getAllByRole('columnheader').map((th) => textOf(th).toUpperCase());
    expect(mine).toEqual(expected);
  });

  it('builds nothing from the dropped parts', async () => {
    const mockup = prunedMockup();
    const { container } = await renderScreen(mockup);
    expect(container.querySelector('input[type=text], input[type=search]')).toBeNull();
    const words = textOf(container);
    for (const banned of ['Active Scope', 'Sync Realtime', 'Export Selected', 'ASN', 'First'])
      expect(words).not.toContain(banned);
  });
});

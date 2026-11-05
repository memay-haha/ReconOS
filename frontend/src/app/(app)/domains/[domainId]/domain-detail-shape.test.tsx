import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import {
  cut,
  el,
  findByText,
  parseMockup,
  renderWithClient,
  retag,
  stubFetch,
  textOf,
} from '../test-support';
import { DETAIL, detailRoutes } from './fixtures';
import DomainDetailPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ domainId: DETAIL.id }),
}));

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../../docs/design/screens/s05-domain-detail.html',
);
const landmarks = { landmarks: true };

/** `main > div` of the mockup, pruned to what the product builds. Every cut names its rule in
 * the part C table of docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. */
function prunedMockup(): Element {
  const doc = parseMockup(readFileSync(mockupFile, 'utf8'));
  const root = doc.querySelector('main > div') as Element;

  // The Run Scan modal is the shared RunScanDialog, closed until opened (M2).
  cut(root, '#scanModal', 'shared Run Scan dialog');
  // Previous 3 / 64 Next needs a position in a list no endpoint gives (M3).
  findByText(root, 'div.flex', 'Previous').remove();

  const [, content] = Array.from(root.children) as [Element, Element];
  // Delete has no endpoint (M3).
  findByText(content, 'button', 'Delete').remove();

  // Tabs: URLs and Services cannot be listed per domain, /urls and /services filter by
  // program only (M3). The bar is a tablist and the grid its panel (M6).
  const tabBar = findByText(content, 'div.flex', 'Scan History');
  tabBar.setAttribute('role', 'tablist');
  for (const tab of Array.from(tabBar.querySelectorAll('button'))) {
    const label = textOf(tab);
    if (label.startsWith('URLs') || label.startsWith('Services')) tab.remove();
    else tab.setAttribute('role', 'tab');
  }
  const panel = tabBar.nextElementSibling as Element;
  panel.setAttribute('role', 'tabpanel');

  // The id is a uuid with a copy button (M2).
  findByText(panel, 'span', 'ID #DOM-8842').append(el(doc, 'button'));
  // Tags: "bbrf: synced" is BBRF (M1). Each tag has a remove button, and a form adds one (M6).
  findByText(panel, 'span', 'bbrf: synced').remove();
  const chips = findByText(panel, 'div.flex', 'env: prod');
  for (const chip of Array.from(chips.children)) chip.append(el(doc, 'button'));
  chips.after(el(doc, 'form', el(doc, 'label'), el(doc, 'select'), el(doc, 'button')));
  // Reconciliation and confidence have no source (M3).
  findByText(panel, 'div.border-t', 'Auto-reconciled').remove();
  // Inspect opens S07: a link.
  retag(findByText(panel, 'span', 'Inspect'), 'a');
  // Asset events page with Previous and Next (M6).
  const events = (
    findByText(panel, 'div', 'Recent Telemetry Activity').closest('.lg\\:col-span-12') as Element
  ).firstElementChild as Element;
  events.append(el(doc, 'nav', el(doc, 'button'), el(doc, 'button')));
  return root;
}

afterEach(() => vi.unstubAllGlobals());

describe('S05 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    stubFetch(detailRoutes());
    const { container } = renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    await screen.findByRole('link', { name: /inspect/i });
    await screen.findByText('OAuth open redirect');
    await screen.findByRole('navigation', { name: 'Asset events pagination' });
    const mine = shapeOf(container.firstElementChild as Element, 0, landmarks).slice(1);
    // A pruning slip that empties both trees must not pass as a match.
    expect(mine.length).toBeGreaterThan(25);
    expect(mine).toEqual(shapeOf(mockup, 0, landmarks).slice(1));
  });

  it('builds nothing from the dropped parts', async () => {
    stubFetch(detailRoutes());
    const { container } = renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    const words = textOf(container);
    for (const banned of ['BBRF', 'Delete', 'Vulnerabilities', 'Telemetry', '#DOM', 'Confidence'])
      expect(words).not.toContain(banned);
    expect(screen.queryByRole('tab', { name: /^urls/i })).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { domainKeys } from '@/lib/domains';
import { shapeOf } from '@/test/dom-shape';

import {
  cut,
  el,
  findByText,
  ME_ADMIN,
  parseMockup,
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

/** Rendered as if opened from S04, so the Previous / Next stepper shows, by an Admin, so
 * Delete shows (D5). */
function renderScreen() {
  stubFetch(detailRoutes(), ME_ADMIN);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(domainKeys.nav, {
    ids: ['d0', DETAIL.id, 'd2'],
    start: 1,
    total: 64,
    totalIsEstimate: false,
  });
  return render(
    <QueryClientProvider client={client}>
      <DomainDetailPage />
    </QueryClientProvider>,
  );
}

/** `main > div` of the mockup, pruned to what the product builds. Every cut names its rule in
 * the part C table of docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md, or the
 * D/M/N row of docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md. */
function prunedMockup(): Element {
  const doc = parseMockup(readFileSync(mockupFile, 'utf8'));
  const root = doc.querySelector('main > div') as Element;

  // The Run Scan modal is closed until opened (N14).
  cut(root, '#scanModal', 'Run Scan modal, closed');
  // Previous / Next move to another domain: links in a navigation landmark.
  const stepper = findByText(root, 'div.flex', 'Previous');
  for (const button of Array.from(stepper.querySelectorAll('button'))) retag(button, 'a');
  retag(stepper, 'nav');

  const [, content] = Array.from(root.children) as [Element, Element];

  // Tabs: the bar is a tablist and the grid its panel (M6). URLs and Services list by
  // domain_id, settled on 05/11/2026.
  const tabBar = findByText(content, 'div.flex', 'Scan History');
  tabBar.setAttribute('role', 'tablist');
  for (const tab of Array.from(tabBar.querySelectorAll('button'))) tab.setAttribute('role', 'tab');
  const panel = tabBar.nextElementSibling as Element;
  panel.setAttribute('role', 'tabpanel');

  // The id is a uuid with a copy button (M2).
  findByText(panel, 'span', 'ID #DOM-8842').append(el(doc, 'button'));
  // Tags: "bbrf: synced" is BBRF (M1). Each tag has a remove button, and a form adds one (M6).
  findByText(panel, 'span', 'bbrf: synced').remove();
  const chips = findByText(panel, 'div.flex', 'env: prod');
  for (const chip of Array.from(chips.children)) chip.append(el(doc, 'button'));
  // A second form creates a tag that is not in the catalogue yet (05/11/2026).
  chips.after(
    el(doc, 'form', el(doc, 'label'), el(doc, 'select'), el(doc, 'button')),
    el(
      doc,
      'form',
      el(doc, 'label'),
      el(doc, 'input'),
      el(doc, 'label'),
      el(doc, 'input'),
      el(doc, 'button'),
    ),
  );
  // Reconciliation and confidence have no source (M3).
  findByText(panel, 'div.border-t', 'Auto-reconciled').remove();
  // Inspect opens S07: a link.
  retag(findByText(panel, 'span', 'Inspect'), 'a');
  // The activity pages with Previous and Next (M6, N12).
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
    const { container } = renderScreen();
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    await screen.findByRole('link', { name: /inspect/i });
    await screen.findAllByText('OAuth open redirect');
    await screen.findByRole('navigation', { name: 'Activity pagination' });
    await screen.findByRole('button', { name: 'Delete' });
    const mine = shapeOf(container.firstElementChild as Element, 0, landmarks).slice(1);
    // A pruning slip that empties both trees must not pass as a match.
    expect(mine.length).toBeGreaterThan(25);
    expect(mine).toEqual(shapeOf(mockup, 0, landmarks).slice(1));
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = renderScreen();
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    const words = textOf(container);
    // BBRF (G1), the mockup's sample id, and reconciliation confidence (M12) stay out.
    for (const banned of ['BBRF', 'Telemetry', '#DOM', 'Confidence', 'Auto-reconciled'])
      expect(words).not.toContain(banned);
  });
});

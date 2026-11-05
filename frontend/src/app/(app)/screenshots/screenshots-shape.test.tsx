import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import ScreenshotsPage from './page';

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../docs/design/screens/s06-screenshot-gallery.html',
);
const landmarks = { landmarks: true };

function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function one(root: Element, selector: string, match: (e: Element) => boolean, why: string) {
  const hit = Array.from(root.querySelectorAll(selector)).find(match);
  if (hit === undefined) throw new Error(`Not in the mockup (${why}): ${selector}`);
  return hit;
}

/** Wraps the children of `node` in a new element, as the product adds a link or a label. */
function wrapChildren(node: Element, tag: string): void {
  const wrapper = node.ownerDocument.createElement(tag);
  wrapper.append(...Array.from(node.childNodes));
  node.append(wrapper);
}

/** A `label` holding a `select`, the way the product names its two selects. */
function labelledSelect(doc: Document): Element {
  const label = doc.createElement('label');
  label.append(doc.createElement('select'));
  return label;
}

/** `main` of the mockup, pruned by the Part D rows of
 * docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. Every cut throws when it
 * matches nothing, so an exclusion that no longer applies cannot linger. */
function prunedMockup(): Element {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main') as Element;
  const button = (text: string) =>
    one(root, 'button', (b) => textOf(b).includes(text), `button ${text}`);

  // M5, M3: Load Scan has no endpoint.
  button('Load Scan').remove();

  // M3: the Technologies filter has no endpoint; the program select keeps its place.
  const technologies = button('Technologies').closest('div.relative') as Element;
  technologies.replaceWith(labelledSelect(doc));
  // M3: HTTP status chips and Show Failed have no filter parameter.
  button('200').closest('div.inline-flex')?.remove();
  one(root, 'label', (l) => textOf(l).includes('Show Failed'), 'Show Failed').remove();
  // M3, debt 39: no endpoint takes a search string.
  one(root, 'input[type=text]', () => true, 'search')
    .closest('div.relative')
    ?.remove();
  // One pager per list: the Previous and Next of the footer.
  button('Prev').closest('div.inline-flex')?.remove();

  // The grid repeats one card shape per kind: keep the first normal card and the first
  // failed one, which is all the screen draws.
  const grid = root.querySelector('div.grid') as Element;
  const cards = Array.from(grid.querySelectorAll(':scope > article'));
  const failed = one(grid, 'article', (a) => textOf(a).includes('FAILED'), 'failed card');
  cards.filter((c) => c !== cards[0] && c !== failed).forEach((c) => c.remove());
  // The card title opens S07.
  for (const h2 of Array.from(grid.querySelectorAll('h2'))) wrapChildren(h2, 'a');
  // M3: Force Dispatch has no endpoint; retrying is a job action on S10.
  one(failed, 'button', (b) => textOf(b) === 'Force Dispatch', 'Force Dispatch').remove();

  // Footer: numbered pages, First and Last are banned; the pager is Previous and Next.
  const nav = root.querySelector('nav') as Element;
  nav.replaceChildren(doc.createElement('button'), doc.createElement('button'));
  const density = one(root, 'select', (e) => textOf(e).includes('/ page'), 'density')
    .parentElement as Element;
  density.replaceWith(labelledSelect(doc));
  return root;
}

const SHOT = {
  id: 's1',
  program_id: 'p1',
  url_id: 'u1',
  job_id: 'j1',
  raw_output_id: 'r1',
  final_url: 'https://auth.example.com/login',
  status_code: 200,
  title: 'Single Sign-On',
  perception_hash: 'abc',
  http_headers: null,
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:05:00Z',
};

function renderScreen() {
  const failed = {
    ...SHOT,
    id: 's2',
    title: null,
    is_failed: true,
    status_code: null,
    error_message: 'net::ERR_CONNECTION_TIMED_OUT',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      Promise.resolve(
        Response.json({
          items: path.startsWith('/api/v1/screenshots') ? [SHOT, failed] : [],
          next_cursor: null,
          total: 2,
          total_is_estimate: false,
        }),
      ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScreenshotsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S06 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByText('Single Sign-On');
    const page = container.firstElementChild as Element;
    // The mockup root is the app's main; the screen renders inside the layout's main.
    expect(shapeOf(page, 0, landmarks).slice(1)).toEqual(shapeOf(mockup, 0, landmarks).slice(1));
  });

  it('builds none of the dropped controls', async () => {
    const { container } = renderScreen();
    await screen.findByText('Single Sign-On');
    expect(container.querySelector('input')).toBeNull();
    const text = textOf(container);
    for (const banned of [
      'Load Scan',
      'Technologies',
      'Show Failed',
      'Force Dispatch',
      'gowitness_daemon.sock',
      'QUEUED',
      'First',
      'Last',
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});

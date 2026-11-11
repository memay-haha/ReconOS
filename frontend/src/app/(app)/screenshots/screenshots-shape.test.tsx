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
 * docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md and the S06 rows of
 * docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md. Every cut throws when it
 * matches nothing, so an exclusion that no longer applies cannot linger. */
function prunedMockup(): Element {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main') as Element;
  const button = (text: string) =>
    one(root, 'button', (b) => textOf(b).includes(text), `button ${text}`);

  // 2026-11-05 keeps the program select; it stands before Technologies.
  const technologies = button('Technologies').closest('div.relative') as Element;
  technologies.before(labelledSelect(doc));
  // The search box carries its own name instead of a visual label only.
  // One pager per list (2026-11-05): the Previous and Next of the footer.
  button('Prev').closest('div.inline-flex')?.remove();

  // The grid repeats one card shape per kind: keep the queued card (N16), the first normal
  // card and the first failed one.
  const grid = root.querySelector('div.grid') as Element;
  const cards = Array.from(grid.querySelectorAll(':scope > article'));
  const failed = one(grid, 'article', (a) => textOf(a).includes('FAILED'), 'failed card');
  const queued = one(grid, 'article', (a) => textOf(a).includes('QUEUED'), 'queued card');
  cards.filter((c) => c !== cards[0] && c !== failed && c !== queued).forEach((c) => c.remove());
  // The queued card leads the first page.
  grid.prepend(queued);
  // The card title of a screenshot opens S07; a queued job has no screenshot yet.
  for (const h2 of [cards[0], failed].map((c) => c?.querySelector('h2'))) {
    if (h2 != null) wrapChildren(h2, 'a');
  }

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
  similar_group: 4,
  similar_count: 3,
  technologies: [{ name: 'React', category: 'framework' }],
  retry_job_status: null,
  width: 1920,
  height: 1080,
};

const QUEUED_JOB = {
  id: 'job-1',
  program_id: 'p1',
  tool_module_id: 'tm-gw',
  status: 'queued',
  target: ['https://k8s-ingress.example.com/'],
  created_at: '2026-11-04T02:00:00Z',
};

function body(items: unknown[]) {
  return Response.json({ items, next_cursor: null, total: items.length, total_is_estimate: false });
}

function renderScreen() {
  const failed = {
    ...SHOT,
    id: 's2',
    title: null,
    is_failed: true,
    status_code: null,
    error_message: 'net::ERR_CONNECTION_TIMED_OUT',
    technologies: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      // Three status classes, as the mockup draws three chips.
      if (path.startsWith('/api/v1/screenshots/summary')) {
        return Promise.resolve(
          Response.json({ by_status_code: { '2xx': 264, '4xx': 38, '5xx': 10 } }),
        );
      }
      if (path.startsWith('/api/v1/screenshots')) return Promise.resolve(body([SHOT, failed]));
      if (path.startsWith('/api/v1/tool-modules')) {
        return Promise.resolve(body([{ id: 'tm-gw', name: 'gowitness' }]));
      }
      if (path.startsWith('/api/v1/jobs')) return Promise.resolve(body([QUEUED_JOB]));
      return Promise.resolve(body([]));
    }),
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
    await screen.findByText('Screenshot job queued');
    await screen.findByRole('button', { name: /5xx/ });
    const page = container.firstElementChild as Element;
    // The mockup root is the app's main; the screen renders inside the layout's main.
    expect(shapeOf(page, 0, landmarks).slice(1)).toEqual(shapeOf(mockup, 0, landmarks).slice(1));
  });

  it('builds none of the dropped controls', async () => {
    const { container } = renderScreen();
    await screen.findByText('Single Sign-On');
    const text = textOf(container);
    for (const banned of ['gowitness_daemon.sock', 'First', 'Last', 'capture']) {
      expect(text).not.toContain(banned);
    }
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { screenshotKeys } from '@/lib/screenshots';
import { shapeOf } from '@/test/dom-shape';

import ScreenshotDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ screenshotId: 's2' }),
  useRouter: () => ({ push: vi.fn() }),
}));

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../../docs/design/screens/s07-capture-detail.html',
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

/** The panel a heading titles: the nearest ancestor that is a rounded card. */
function panelOf(heading: Element): Element {
  const panel = heading.closest('div.rounded-lg');
  if (panel === null) throw new Error(`No panel around ${textOf(heading)}`);
  return panel;
}

/** A button that downloads a file is a link in the product: `<a download>`. */
function asLink(node: Element): void {
  const link = node.ownerDocument.createElement('a');
  link.append(...Array.from(node.childNodes));
  node.replaceWith(link);
}

/** The page of the mockup, pruned by the Part D rows of
 * docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. */
function prunedMockup(): Element {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main > div') as Element;
  const button = (text: string) =>
    one(root, 'button', (b) => textOf(b).includes(text), `button ${text}`);

  // M3: no endpoint deletes a screenshot.
  button('Delete Capture').remove();
  asLink(button('Download PNG'));
  asLink(one(root, 'button', (b) => textOf(b).endsWith('PNG'), 'PNG button'));
  // M3: the page HTML source, TLS details, network log, console log and cookies have no
  // endpoint; gowitness records only the screenshot, the final URL and the headers.
  button('View Page HTML Source').remove();
  panelOf(one(root, 'h2', (h) => textOf(h).startsWith('TLS'), 'TLS')).remove();
  panelOf(button('Network Log')).remove();
  const source = one(root, 'h3', (h) => textOf(h).startsWith('Rendered HTML Source'), 'source');
  (source.closest('[id]') ?? source.parentElement?.parentElement)?.remove();
  return root;
}

const SHOT = {
  id: 's2',
  program_id: 'p1',
  url_id: 'u1',
  job_id: 'j1',
  raw_output_id: 'r1',
  final_url: 'https://auth.example.com/oauth/authorize',
  status_code: 200,
  title: 'Single Sign-On',
  perception_hash: 'abc',
  http_headers: { server: 'cloudflare' },
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:05:00Z',
};

function renderScreen() {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      if (path.startsWith('/api/v1/screenshots/')) return Promise.resolve(Response.json(SHOT));
      return Promise.resolve(
        Response.json({
          id: 'u1',
          content_length: 1024,
          technologies: [
            { technology_id: 't1', name: 'Nginx', category: 'web server', version: null },
          ],
        }),
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Opened from the gallery, so Prev and Next are drawn as in the mockup.
  client.setQueryData(screenshotKeys.list({ limit: 24 }, null), {
    items: [{ ...SHOT, id: 's1' }, SHOT, { ...SHOT, id: 's3' }],
    next_cursor: null,
    total: 3,
    total_is_estimate: false,
  });
  return render(
    <QueryClientProvider client={client}>
      <ScreenshotDetailPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S07 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByText('Nginx');
    const page = container.firstElementChild as Element;
    const expected = shapeOf(mockup, 0, landmarks);
    // The comparison must cover the bar, both columns and both lower panels.
    expect(expected.filter((line) => /\b(a|button|h1|h2|h3)$/.test(line.trim()))).toHaveLength(12);
    expect(shapeOf(page, 0, landmarks)).toEqual(expected);
  });

  it('builds none of the dropped parts', async () => {
    const { container } = renderScreen();
    await screen.findByText('Nginx');
    expect(container.querySelector('table')).toBeNull();
    const text = textOf(container);
    for (const banned of [
      'Capture',
      'CAP-',
      'Wappalyzer',
      'Hardened',
      'Cookies',
      'Console Log',
      'Worker PID',
      'TLS',
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});

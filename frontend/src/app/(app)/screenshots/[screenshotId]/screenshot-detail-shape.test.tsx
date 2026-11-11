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
  useSearchParams: () => new URLSearchParams('at=2'),
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

/** A button that downloads a file is a link in the product: `<a download>`. */
function asLink(node: Element): void {
  const link = node.ownerDocument.createElement('a');
  link.append(...Array.from(node.childNodes));
  node.replaceWith(link);
}

/** The page of the mockup, pruned by the Part D rows of
 * docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md and the S07 rows of
 * docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md (D1, D5, N19). */
function prunedMockup(): Element {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main > div') as Element;
  const button = (text: string) =>
    one(root, 'button', (b) => textOf(b).includes(text), `button ${text}`);

  asLink(button('Download PNG'));
  asLink(one(root, 'button', (b) => textOf(b).endsWith('PNG'), 'PNG button'));
  // M20: "Show all" opens the rest of the headers.
  const keyHeaders = one(root, 'span', (e) => textOf(e).endsWith('Shown'), 'header count');
  keyHeaders.after(doc.createElement('button'));
  // D1: tabs carry ARIA roles; HAR and the raw output download as links.
  const tabs = button('Network Log').parentElement as Element;
  tabs.setAttribute('role', 'tablist');
  for (const tab of Array.from(tabs.querySelectorAll('button'))) tab.setAttribute('role', 'tab');
  const har = one(root, 'span', (e) => textOf(e) === 'HAR 1.2 Export', 'HAR');
  asLink(har);
  asLink(one(root, 'button', (b) => b.getAttribute('title') === 'Export Raw Telemetry', 'raw'));
  // Only the open tab is drawn, inside one tabpanel; the network table ends with
  // "Show all" for the events past the top 6.
  const network = one(root, '#tab-network', () => true, 'network pane');
  network.setAttribute('role', 'tabpanel');
  for (const pane of Array.from(root.querySelectorAll('.tab-pane'))) {
    if (pane !== network) pane.remove();
  }
  const footer = one(network, 'span', (e) => textOf(e).startsWith('Showing top'), 'net footer');
  footer.append(doc.createElement('button'));
  // The HTML source opens on demand, as a dialog drawn only while open.
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
  http_headers: {
    server: 'cloudflare',
    'content-type': 'text/html',
    'x-frame-options': 'DENY',
    'cf-ray': '8c9735a2981-IAD',
  },
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:05:00Z',
  similar_group: null,
  similar_count: 1,
  technologies: [],
  retry_job_status: null,
  width: 1920,
  height: 1080,
  worker_name: 'gowitness-02',
  device_scale: 2,
  remote_ip: '198.51.100.24',
  duration_ms: 2480,
  tls: {
    protocol: 'TLS 1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    issuer: 'R3',
    subject: 'auth.example.com',
    san: ['auth.example.com'],
    not_before: '2026-08-15T00:00:00Z',
    not_after: '2026-11-15T00:00:00Z',
  },
  console_log: [],
  cookies: [],
  html_size: 49_357,
  html_sha256: 'abc',
  security_headers: { 'x-frame-options': true },
  security_headers_passed: 1,
  security_headers_total: 1,
};

const NETWORK = Array.from({ length: 8 }, (_, i) => ({
  method: 'GET',
  url: `https://auth.example.com/${String(i)}`,
  status_code: 200,
  content_type: null,
  size_bytes: 10,
  duration_ms: 1,
  remote_ip: null,
}));

function renderScreen() {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      if (path === '/api/v1/auth/me') {
        return Promise.resolve(Response.json({ id: 'me', role: 'admin' }));
      }
      if (path.endsWith('/network')) {
        return Promise.resolve(Response.json({ network_log: NETWORK }));
      }
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
    await screen.findByRole('button', { name: /delete screenshot/i });
    await screen.findByRole('table');
    const page = container.firstElementChild as Element;
    expect(shapeOf(page, 0, landmarks)).toEqual(shapeOf(mockup, 0, landmarks));
  });

  it('builds none of the dropped parts', async () => {
    const { container } = renderScreen();
    await screen.findByText('Nginx');
    const text = textOf(container);
    // N19: no worker PID. M2: a screenshot is never called a capture. The mockup's
    // Wappalyzer chip names a tool ReconOS does not run.
    for (const banned of ['Capture', 'CAP-', 'Wappalyzer', 'Worker PID', 'Telemetry']) {
      expect(text).not.toContain(banned);
    }
  });
});

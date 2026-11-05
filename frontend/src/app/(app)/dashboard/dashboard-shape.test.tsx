import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NAV_GROUPS } from '@/components/nav-items';
import { shapeOf } from '@/test/dom-shape';

import DashboardPage from './page';

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../docs/design/screens/s02-dashboard.html',
);
const landmarks = { landmarks: true };

function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Cuts every `selector` whose text matches. Throws when nothing matches: an exclusion that
 * no longer applies must be deleted, not left behind as a silent no-op. */
function cutWhere(root: Element, selector: string, match: (text: string) => boolean, why: string) {
  const hits = Array.from(root.querySelectorAll(selector)).filter((e) => match(textOf(e)));
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${why}): ${selector}`);
  hits.forEach((hit) => hit.remove());
}

function routeOf(label: string): string | null {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === label)?.href ?? null;
}

/** `main > div > div` of the mockup, pruned by the Part D rows of
 * docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md. */
function prunedMockup(): { root: Element; tileCount: number } {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main > div > div') as Element;

  // M3: no endpoint takes a time window.
  cutWhere(root, 'button', (t) => ['24h', '7d', '30d'].includes(t), 'time window');
  // M3: Top Programs and Top Open Ports have no endpoint; the grid holding both goes.
  const top = Array.from(root.querySelectorAll('h2'))
    .find((h) => textOf(h).startsWith('Top Programs'))
    ?.closest('div.grid');
  if (top == null) throw new Error('Top Programs grid not found in the mockup');
  top.remove();
  // M3: pausing a live stream; the feed reloads through queries, there is no stream to pause.
  cutWhere(root, 'button[title="Pause Stream"]', () => true, 'pause stream');
  // A View all link leads to a list screen; while that screen is unbuilt there is no link.
  const panels: [string, string][] = [
    ['Findings by Severity', 'Findings'],
    ['Staging Snapshot', 'Staging Queue'],
  ];
  for (const [heading, screenLabel] of panels) {
    if (routeOf(screenLabel) !== null) continue;
    const head = Array.from(root.querySelectorAll('h2')).find((h) => textOf(h) === heading);
    const link = head?.closest('div.justify-between')?.querySelector('a');
    if (link == null) throw new Error(`View all link not found for ${heading}`);
    link.remove();
  }

  const tiles = root.querySelector('div.grid') as Element;
  return { root, tileCount: tiles.children.length };
}

function renderScreen() {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      if (path === '/api/v1/dashboard/summary') {
        return Promise.resolve(
          Response.json({
            programs: 1,
            assets: { domain: 1, ip: 1, url: 1, service: 1 },
            findings_by_severity: { critical: 1, high: 1, medium: 1, low: 1, info: 1 },
            jobs_by_status: {
              pending_approval: 1,
              queued: 1,
              dispatched: 1,
              running: 1,
              completed: 1,
              failed: 1,
              cancelled: 1,
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({ items: [], next_cursor: null, total: 0, total_is_estimate: false }),
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S02 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByText(/no asset events yet/i);
    const page = container.firstElementChild as Element;
    expect(shapeOf(page, 0, landmarks)).toEqual(shapeOf(mockup.root, 0, landmarks));
  });

  it('shows the five KPI tiles of the mockup', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen();
    await screen.findByText(/no asset events yet/i);
    expect(mockup.tileCount).toBe(5);
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tileCount);
  });

  it('names the job panel Jobs, as the decision log says', async () => {
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(screen.queryByText('Staging Snapshot')).toBeNull();
  });
});

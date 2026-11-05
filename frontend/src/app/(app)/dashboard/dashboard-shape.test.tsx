import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shapeOf } from '@/test/dom-shape';

import DashboardPage from './page';
import { SUMMARY } from './test-fixtures';

const mockupFile = resolve(
  import.meta.dirname,
  '../../../../../docs/design/screens/s02-dashboard.html',
);
const landmarks = { landmarks: true };

function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** `main > div > div` of the mockup, adjusted only where the screen adds semantics the
 * mockup leaves out (docs/superpowers/specs/2026-11-05-fe-shell-b-e-decisions.md, S02 rebuild). */
function mockupRoot(): Element {
  const doc = new DOMParser().parseFromString(readFileSync(mockupFile, 'utf8'), 'text/html');
  const root = doc.querySelector('main > div > div') as Element;

  // The window buttons are one control: the screen groups them for assistive technology.
  const windowButtons = Array.from(root.querySelectorAll('button')).filter((b) =>
    ['24h', '7d', '30d'].includes(textOf(b)),
  );
  const holder = windowButtons[0]?.parentElement;
  if (holder == null || windowButtons.length !== 3) throw new Error('window buttons not found');
  holder.setAttribute('role', 'group');

  // The chart panel's title is a span in the mockup; the screen makes it a heading like
  // every other panel title.
  const chartTitle = Array.from(root.querySelectorAll('span')).find(
    (s) => textOf(s) === 'New Assets Discovered (14 Days)',
  );
  if (chartTitle == null) throw new Error('chart title not found');
  const heading = doc.createElement('h2');
  heading.textContent = textOf(chartTitle);
  chartTitle.replaceWith(heading);
  return root;
}

function renderScreen() {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      Promise.resolve(
        path.startsWith('/api/v1/dashboard/summary')
          ? Response.json(SUMMARY)
          : Response.json({ items: [], next_cursor: null, total: 0, total_is_estimate: false }),
      ),
    ),
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
    const { container } = renderScreen();
    await screen.findByText('No activity yet.');
    const page = container.firstElementChild as Element;
    expect(shapeOf(page, 0, landmarks)).toEqual(shapeOf(mockupRoot(), 0, landmarks));
  });

  it('shows the five KPI tiles of the mockup', async () => {
    const { container } = renderScreen();
    await screen.findByText('No activity yet.');
    const tiles = mockupRoot().querySelectorAll('.lg\\:grid-cols-5 > div');
    expect(tiles).toHaveLength(5);
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(tiles.length);
  });
});

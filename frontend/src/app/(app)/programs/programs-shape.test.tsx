import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProgramsPage from './page';
import { mockupDocument, pagerToNav, regionsOf, textOf } from './shape-helpers';
import { page, programRow, renderWithClient, stubApi } from './test-api';

/** Tiles the screen does not build, by label, with the reason: decision log part B. */
const DROPPED_TILES = [
  { label: 'Active In Scope', reason: 'M7: KPIs are Programs, Domains, Findings' },
];

function prunedMockup() {
  const doc = mockupDocument('s08-programs.html');
  const root = doc.querySelector('main') as Element;

  const grid = root.querySelector('div.grid') as Element;
  for (const { label, reason } of DROPPED_TILES) {
    const tile = Array.from(grid.children).find((t) =>
      Array.from(t.querySelectorAll('span')).some((s) => textOf(s) === label),
    );
    if (tile === undefined) throw new Error(`Dropped tile not in the mockup (${reason}): ${label}`);
    tile.remove();
  }
  const cards = Array.from(root.querySelectorAll('h2')).length;

  // The numbered pager becomes the Previous and Next nav: frontend/CLAUDE.md bans page numbers.
  const pager = Array.from(root.querySelectorAll('button'))
    .find((b) => textOf(b) === '1')
    ?.closest('div') as Element;
  pagerToNav(pager);
  return { root, tiles: grid.children.length, cards };
}

function renderScreen(count: number) {
  stubApi({
    '/programs?sort=name': page(Array.from({ length: count }, (_, i) => programRow(i + 1))),
  });
  return renderWithClient(<ProgramsPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S08 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(mockup.cards);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(regionsOf(container.firstElementChild as Element)).toEqual(regionsOf(mockup.root));
  });

  it('shows the mockup tiles minus the dropped ones', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(1);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tiles);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = renderScreen(2);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(container.querySelector('input[type=text], input[type=search]')).toBeNull();
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    const words = textOf(container);
    for (const banned of ['BBRF', 'SYNC', 'Last scanned', 'Inactive', 'Wildcards', 'coverage']) {
      expect(words).not.toContain(banned);
    }
  });
});

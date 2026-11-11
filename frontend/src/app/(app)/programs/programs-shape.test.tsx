import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProgramsPage from './page';
import { mockupDocument, pagerToNav, regionsOf, textOf } from './shape-helpers';
import { page, programRow, renderWithClient, stubApi } from './test-api';

function prunedMockup() {
  const doc = mockupDocument('s08-programs.html');
  const root = doc.querySelector('main') as Element;

  const grid = root.querySelector('div.grid') as Element;
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
    '/programs?sort=-domain_count&limit=6': page(
      Array.from({ length: count }, (_, i) => programRow(i + 1)),
    ),
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

  it('shows the four mockup tiles', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(1);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tiles);
  });

  it('builds the search and the empty-scope switch, and nothing from BBRF', async () => {
    const { container } = renderScreen(2);
    await screen.findByRole('heading', { name: 'program-1' });
    expect(container.querySelector('input[type=search]')).not.toBeNull();
    expect(container.querySelector('input[type=checkbox]')).not.toBeNull();
    const words = textOf(container);
    // BBRF and Sync All are out of scope; M2 says Paused, not Inactive.
    for (const banned of ['BBRF', 'SYNC', 'Sync', 'Inactive']) {
      expect(words).not.toContain(banned);
    }
  });
});

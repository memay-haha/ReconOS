import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockupDocument, pagerToNav, regionsOf, textOf } from '../programs/shape-helpers';
import { ME_SUPERADMIN, page, programRow, renderWithClient, stubApi } from '../programs/test-api';
import ManagePage from './page';

/** Headers the decision log renames, part B (M1, M2). */
const RENAMED: Readonly<Record<string, string>> = {
  'Platform / Source': 'Platform',
  'Last Sync': 'Updated',
};

/** Tiles the screen does not build, by label: no endpoint counts programs without scope (M3). */
const DROPPED_TILES = ['Missing Scope'];

function prunedMockup() {
  const doc = mockupDocument('s11-program-management.html');
  const root = doc.querySelector('main') as Element;
  const table = root.querySelector('table') as Element;

  // The select-all checkbox column: bulk actions have no endpoint (M3).
  const heads = Array.from(table.querySelectorAll('thead th'));
  const at = heads.findIndex((th) => th.querySelector('input[type=checkbox]') !== null);
  if (at === -1) throw new Error('Checkbox column not in the mockup');
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    if (tr.children.length === heads.length) tr.children[at]?.remove();
  }
  // The expanded scope row: rows open collapsed.
  const expanded = Array.from(table.querySelectorAll('tbody tr')).find((tr) =>
    textOf(tr).includes('In-Scope Target Wildcards'),
  );
  if (expanded === undefined) throw new Error('Expanded scope row not in the mockup');
  expanded.remove();
  const columns = Array.from(table.querySelectorAll('thead th')).map(
    (th) => RENAMED[textOf(th)] ?? textOf(th),
  );
  const rows = table.querySelectorAll('tbody tr').length;

  const tileLabels = Array.from(root.querySelectorAll('span'))
    .map(textOf)
    .filter((t) =>
      ['Programs Registered', 'Active Surveillance', 'Mapped Targets', ...DROPPED_TILES].includes(
        t,
      ),
    );
  const tiles = tileLabels.filter((t) => !DROPPED_TILES.includes(t)).length;

  const first = root.querySelector('button[title="First Page"]');
  pagerToNav(first?.closest('div') as Element);
  return { root, columns, rows, tiles };
}

function renderScreen(rows: number) {
  stubApi(
    {
      '/programs?sort=name': page(Array.from({ length: rows }, (_, i) => programRow(i + 1))),
    },
    ME_SUPERADMIN,
  );
  return renderWithClient(<ManagePage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S11 against its mockup', () => {
  it('lays out the same regions in the same order', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(mockup.rows);
    await screen.findByRole('table');
    expect(regionsOf(container.firstElementChild as Element)).toEqual(regionsOf(mockup.root));
  });

  it('has the mockup columns, renamed and minus the dropped one, in order', async () => {
    const mockup = prunedMockup();
    renderScreen(1);
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map(textOf)).toEqual(mockup.columns);
  });

  it('shows the mockup tiles minus the dropped one', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(1);
    await screen.findByRole('table');
    expect(mockup.tiles).toBe(3);
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tiles);
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = renderScreen(2);
    await screen.findByRole('table');
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    expect(container.querySelector('input[type=text]')).toBeNull();
    const words = textOf(container);
    for (const banned of [
      'BBRF',
      'Sync',
      'Latency',
      '+ Target',
      'Selected',
      'Osmedeus',
      'Mapped',
    ]) {
      expect(words).not.toContain(banned);
    }
  });
});

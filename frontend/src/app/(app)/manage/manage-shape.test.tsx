import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockupDocument, pagerToNav, regionsOf, textOf } from '../programs/shape-helpers';
import { ME_SUPERADMIN, page, programRow, renderWithClient, stubApi } from '../programs/test-api';
import ManagePage from './page';

/** Headers the decision log renames, part B (M1, M2). */
const RENAMED: Readonly<Record<string, string>> = {
  'Platform / Source': 'Platform',
  'Last Sync': 'Last scanned',
};

const DROPPED_TILES: readonly string[] = [];

function prunedMockup() {
  const doc = mockupDocument('s11-program-management.html');
  const root = doc.querySelector('main') as Element;
  const table = root.querySelector('table') as Element;

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
      [
        'Programs Registered',
        'Active Surveillance',
        'Missing Scope',
        'Mapped Targets',
        ...DROPPED_TILES,
      ].includes(t),
    );
  const tiles = tileLabels.filter((t) => !DROPPED_TILES.includes(t)).length;

  const first = root.querySelector('button[title="First Page"]');
  pagerToNav(first?.closest('div') as Element);
  return { root, columns, rows, tiles };
}

function renderScreen(rows: number) {
  stubApi(
    {
      '/programs?sort=name&limit=10': page(
        Array.from({ length: rows }, (_, i) => programRow(i + 1)),
      ),
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

  it('has the mockup columns, renamed, in order', async () => {
    const mockup = prunedMockup();
    renderScreen(1);
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map(textOf)).toEqual(mockup.columns);
  });

  it('shows the four mockup tiles', async () => {
    const mockup = prunedMockup();
    const { container } = renderScreen(1);
    await screen.findByRole('table');
    expect(mockup.tiles).toBe(4);
    expect(container.querySelectorAll('[data-stat-tile]')).toHaveLength(mockup.tiles);
  });

  it('builds search, selection and latency, and nothing from BBRF', async () => {
    const { container } = renderScreen(2);
    await screen.findByRole('table');
    expect(container.querySelector('input[type=search]')).not.toBeNull();
    expect(container.querySelectorAll('input[type=checkbox]').length).toBeGreaterThan(2);
    const words = textOf(container);
    for (const built of ['Latency', '+ Target', 'Unmapped only', 'No Scope']) {
      expect(words).toContain(built);
    }
    // BBRF and Sync are out of scope; M5 rewrites the claim that wildcards feed Osmedeus.
    for (const banned of ['BBRF', 'Sync', 'Osmedeus', 'Inactive']) {
      expect(words).not.toContain(banned);
    }
  });
});

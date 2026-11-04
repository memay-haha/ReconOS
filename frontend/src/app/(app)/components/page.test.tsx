import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseTokenTable } from '../../../../scripts/generate-tokens.mjs';
import { contrastRatio } from '@/styles/contrast';
import { PAIRS } from '@/styles/contrast-pairs';

// The page imports the generated token module. The tests swap its rows, which is the only
// way to prove the list of tokens is not a copy in the page source. A separate drift test in
// tokens.test.ts proves the module itself matches the Token Table.
const fake = vi.hoisted(() => ({ rows: null as unknown[] | null }));
vi.mock('@/styles/token-table.generated', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/styles/token-table.generated')>();
  return {
    get TOKEN_ROWS() {
      return fake.rows ?? real.TOKEN_ROWS;
    },
  };
});

import ComponentsPage from './page';

const designSystem = readFileSync(
  join(process.cwd(), '..', 'docs', 'design', 'design-system.md'),
  'utf8',
);
const colourRows = parseTokenTable(designSystem).filter((row) => row.group === 'Colors');

beforeEach(() => {
  fake.rows = null;
});

describe('Component Library', () => {
  it('shows one swatch per colour row of the table, in the table order', async () => {
    render(await ComponentsPage());
    const swatches = screen.getAllByTestId('swatch');
    expect(colourRows.length).toBeGreaterThan(50);
    expect(swatches.map((s) => s.getAttribute('data-token'))).toEqual(
      colourRows.map((row) => row.name),
    );
  });

  it('labels each swatch with the token name, never a hex value as its name', async () => {
    render(await ComponentsPage());
    for (const swatch of screen.getAllByTestId('swatch')) {
      const token = swatch.getAttribute('data-token');
      expect(token).toBeTruthy();
      expect(token).not.toMatch(/^#?[0-9a-f]{6}$/i);
      expect(within(swatch).getByText(token as string)).toBeInTheDocument();
    }
  });

  it('follows the table: a token added to the markdown appears, one removed disappears', async () => {
    const paired = new Set(PAIRS.flat());
    // A token no contrast pair uses, so the page can lose it and still render.
    const removed = colourRows.findLast((row) => !paired.has(row.name))!.name;
    const rows = parseTokenTable(designSystem).filter((row) => row.name !== removed);
    const at = rows.findIndex((row) => row.group === 'Radius');
    rows.splice(at, 0, {
      group: 'Colors',
      name: 'color-zz-invented',
      values: { dark: '#123456', light: '#654321' },
    });
    fake.rows = rows;
    render(await ComponentsPage());
    const names = screen.getAllByTestId('swatch').map((s) => s.getAttribute('data-token'));
    expect(names).toContain('color-zz-invented');
    expect(names).not.toContain(removed);
  });

  it('shows the contrast ratio of each theme against that theme background', async () => {
    render(await ComponentsPage());
    const fg = colourRows.find((row) => row.name === 'color-fg');
    const bg = colourRows.find((row) => row.name === 'color-bg');
    expect(fg && bg).toBeTruthy();
    const swatch = screen
      .getAllByTestId('swatch')
      .find((s) => s.getAttribute('data-token') === 'color-fg') as HTMLElement;
    const dark = contrastRatio(fg!.values.dark, bg!.values.dark).toFixed(2);
    const light = contrastRatio(fg!.values.light, bg!.values.light).toFixed(2);
    expect(within(swatch).getByText(new RegExp(`dark ${dark}:1`))).toBeInTheDocument();
    expect(within(swatch).getByText(new RegExp(`light ${light}:1`))).toBeInTheDocument();
  });

  it('shows the five grey text tokens on the surfaces each is used on', async () => {
    render(await ComponentsPage());
    const ramp = screen.getByRole('region', { name: /grey text ramp/i });
    for (const token of ['fg', 'fg-muted', 'fg-faint', 'fg-dim', 'fg-dimmest']) {
      expect(within(ramp).getAllByTestId(`ramp-${token}`).length).toBeGreaterThan(0);
    }
    // fg-dimmest is only guaranteed on bg, so it must not be shown anywhere else.
    expect(within(ramp).getAllByTestId('ramp-fg-dimmest')).toHaveLength(1);
  });

  it('shows the nine type roles by name, read from the table', async () => {
    render(await ComponentsPage());
    const roles = screen.getAllByTestId('type-role').map((r) => r.getAttribute('data-role'));
    const expected = parseTokenTable(designSystem)
      .filter((row) => /^text-[a-z]+(-[a-z]+)*$/.test(row.name))
      .map((row) => row.name.replace('text-', ''));
    expect(expected).toHaveLength(9);
    expect(roles).toEqual(expected);
  });

  it('shows the shared components the screens actually use', async () => {
    render(await ComponentsPage());
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    // The button is the one users/user-form.tsx renders, not a page-local lookalike.
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-primary');
  });

  it('touches no file at runtime: the production image carries no docs/', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(app)/components/page.tsx'), 'utf8');
    expect(source).not.toMatch(/node:fs|from 'fs'|process\.cwd|docs\//);
  });
});

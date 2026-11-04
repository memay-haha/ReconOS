// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateCss, parseTokenTable } from '../../scripts/generate-tokens.mjs';
import { contrastRatio } from './contrast';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const designSystem = readFileSync(`${repoRoot}/docs/design/design-system.md`, 'utf8');
const committedCss = readFileSync(`${repoRoot}/frontend/src/styles/globals.css`, 'utf8');

describe('token generator', () => {
  it('reproduces the committed stylesheet exactly', () => {
    // A hand edit to globals.css, or a token table that drifts from it, fails here.
    expect(generateCss(designSystem)).toBe(committedCss);
  });

  it('emits every token from the table', () => {
    const css = generateCss(designSystem);
    const rows = parseTokenTable(designSystem);
    expect(rows.length).toBeGreaterThan(100);
    for (const row of rows) {
      expect(css).toContain(`--${row.name}:`);
    }
  });

  it('overrides every theme dependent token under data-theme dark', () => {
    const css = generateCss(designSystem);
    const dark = css.split('[data-theme="dark"]')[1];
    expect(dark).toBeDefined();
    for (const row of parseTokenTable(designSystem)) {
      if (row.values.light === '' || row.values.light === row.values.dark) continue;
      expect(dark).toContain(`--${row.name}: ${row.values.dark};`);
    }
  });

  it('keeps theme invariant tokens out of the override blocks', () => {
    const css = generateCss(designSystem);
    const overrides = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(overrides).toContain(':root[data-theme="dark"]');
    for (const row of parseTokenTable(designSystem)) {
      if (row.values.light === '' || row.values.light === row.values.dark) {
        expect(overrides).not.toContain(`--${row.name}:`);
      }
    }
  });

  it('declares the same overrides for the media query and the attribute', () => {
    const css = generateCss(designSystem);
    const declarations = (block: string) => block.match(/--[\w-]+: [^;]+;/g);
    const media = css.split('@media (prefers-color-scheme: dark)')[1].split('\n}\n')[0];
    const attribute = css.split(':root[data-theme="dark"]')[1].split('\n}\n')[0];
    expect(declarations(media)).toEqual(declarations(attribute));
    expect(declarations(media)?.length).toBeGreaterThan(0);
  });

  it('skips group rows and the header row', () => {
    const rows = parseTokenTable(designSystem);
    expect(rows.some((r) => r.name === 'token' || r.name.includes('*'))).toBe(false);
  });
});

/**
 * Foreground token on background token, one entry per place the screens paint text or an
 * icon straight onto that fill. A pair earns a line here only when a component renders
 * the first token on the second one; a pair that nothing renders proves nothing.
 */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  // Body text on the application canvas behind every screen.
  ['color-fg', 'color-bg'],
  // Body text inside cards, panels and table rows.
  ['color-fg', 'color-surface'],
  // Secondary text on a card: column headers, timestamps, helper lines.
  ['color-fg-muted', 'color-surface'],
  // Material role text on a Material role surface, used by the imported role family.
  ['color-on-surface', 'color-surface'],
  // Material role supporting text under a list item title.
  ['color-on-surface-variant', 'color-surface'],
  // Label of a filled primary button.
  ['color-on-primary', 'color-primary'],
  // Label of a tonal primary button and of a selected chip.
  ['color-on-primary-container', 'color-primary-container'],
  // Label of a filled destructive button.
  ['color-on-error', 'color-error'],
  // Text of an error banner and of a field level error message.
  ['color-on-error-container', 'color-error-container'],
  // Status badge: job succeeded, asset alive.
  ['color-good', 'color-good-soft'],
  // Status badge: medium severity, job finished with warnings.
  ['color-warn', 'color-warn-soft'],
  // Status badge: high severity, job failed.
  ['color-crit', 'color-crit-soft'],
  // Status badge: low severity, informational finding.
  ['color-info', 'color-info-soft'],
];

describe.each([['dark'], ['light']] as const)('%s theme contrast', (theme) => {
  const rows = parseTokenTable(designSystem);
  const value = (name: string): string => {
    const row = rows.find((r) => r.name === name);
    if (row === undefined) throw new Error(`unknown token ${name}`);
    // An empty light cell means the token is theme invariant, so it keeps the dark value.
    return theme === 'dark' ? row.values.dark : row.values.light || row.values.dark;
  };

  it.each(PAIRS)('%s on %s reaches WCAG AA', (fg, bg) => {
    expect(contrastRatio(value(fg), value(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

it('every colour token has a light value', () => {
  const missing = parseTokenTable(designSystem)
    .filter((r) => r.name.startsWith('color-') && r.values.light === '')
    .map((r) => r.name);
  expect(missing).toEqual([]);
});

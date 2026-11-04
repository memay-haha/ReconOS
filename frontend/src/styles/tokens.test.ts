// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  generateCss,
  generateTokenModule,
  parseTokenTable,
} from '../../scripts/generate-tokens.mjs';
import { deltaE } from '../../scripts/colour-audit.mjs';
import { contrastRatio } from './contrast';
import { PAIRS } from './contrast-pairs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const designSystem = readFileSync(`${repoRoot}/docs/design/design-system.md`, 'utf8');
const committedCss = readFileSync(`${repoRoot}/frontend/src/styles/globals.css`, 'utf8');
const committedModule = readFileSync(
  `${repoRoot}/frontend/src/styles/token-table.generated.ts`,
  'utf8',
);

describe('token generator', () => {
  it('reproduces the committed stylesheet exactly', () => {
    // A hand edit to globals.css, or a token table that drifts from it, fails here.
    expect(generateCss(designSystem)).toBe(committedCss);
  });

  it('reproduces the committed token module exactly', () => {
    // The Component Library imports this module; an edit to the table without
    // `pnpm tokens` fails here, as it does for the stylesheet.
    expect(generateTokenModule(designSystem)).toBe(committedModule);
  });

  it('emits every token from the table', () => {
    const css = generateCss(designSystem);
    const rows = parseTokenTable(designSystem);
    expect(rows.length).toBeGreaterThan(100);
    for (const row of rows) {
      expect(css).toContain(`--${row.name}:`);
    }
  });

  it('puts the dark value in @theme, because the mockups are dark', () => {
    const css = generateCss(designSystem);
    const theme = css.slice(css.indexOf('@theme'), css.indexOf('@media'));
    for (const row of parseTokenTable(designSystem)) {
      if (row.values.dark === '') continue;
      expect(theme).toContain(`--${row.name}: ${row.values.dark};`);
    }
  });

  it('overrides only the tokens whose light value differs', () => {
    const css = generateCss(designSystem);
    const override = css.slice(css.indexOf(':root[data-theme="light"]'));
    for (const row of parseTokenTable(designSystem)) {
      const differs = row.values.light !== '' && row.values.light !== row.values.dark;
      if (differs) expect(override).toContain(`--${row.name}: ${row.values.light};`);
      else expect(override).not.toContain(`--${row.name}:`);
    }
  });

  it('declares the same overrides for the media query and the attribute', () => {
    const css = generateCss(designSystem);
    const declarations = (block: string) => block.match(/--[\w-]+: [^;]+;/g);
    const media = css.split('@media (prefers-color-scheme: light)')[1].split('\n}\n')[0];
    const attribute = css.split(':root[data-theme="light"]')[1].split('\n}\n')[0];
    expect(declarations(media)).toEqual(declarations(attribute));
    expect(declarations(media)?.length).toBeGreaterThan(0);
  });

  it('lets the operating system pick light only when the reader has not chosen dark', () => {
    const css = generateCss(designSystem);
    expect(css).toContain(':root:not([data-theme="dark"])');
  });

  it('skips group rows and the header row', () => {
    const rows = parseTokenTable(designSystem);
    expect(rows.some((r) => r.name === 'token' || r.name.includes('*'))).toBe(false);
  });
});

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

describe.each([['dark'], ['light']] as const)('%s theme non-text contrast', (theme) => {
  const rows = parseTokenTable(designSystem);
  const value = (name: string): string => {
    const row = rows.find((r) => r.name === name);
    if (row === undefined) throw new Error(`unknown token ${name}`);
    return theme === 'dark' ? row.values.dark : row.values.light || row.values.dark;
  };

  it.each([
    ['color-warn-strong-bd', 'color-warn-strong-soft'],
    ['color-crit-strong-bd', 'color-crit-strong-soft'],
  ])('%s stays distinguishable from %s', (border, fill) => {
    expect(contrastRatio(value(border), value(fill))).toBeGreaterThanOrEqual(1.3);
  });
});

describe('colour scheme', () => {
  it('declares dark by default and light in both light override blocks', () => {
    const css = generateCss(designSystem);
    const dark = css.slice(0, css.indexOf('@media'));
    expect(dark).toContain('color-scheme: dark;');
    const light = css.slice(css.indexOf('@media'));
    expect(light.match(/color-scheme: light;/g)).toHaveLength(2);
    expect(light).not.toContain('color-scheme: dark;');
  });
});

describe.each([['dark'], ['light']] as const)('%s theme grey ramp', (theme) => {
  it('keeps consecutive steps visibly apart (deltaE above 2.3)', () => {
    const rows = parseTokenTable(designSystem);
    const value = (name: string): string => {
      const row = rows.find((r) => r.name === name);
      if (row === undefined) throw new Error(`unknown token ${name}`);
      return theme === 'dark' ? row.values.dark : row.values.light;
    };
    const ramp = ['color-fg-muted', 'color-fg-faint', 'color-fg-dim', 'color-fg-dimmest'];
    for (let i = 1; i < ramp.length; i++) {
      expect(deltaE(value(ramp[i - 1]), value(ramp[i])), ramp[i]).toBeGreaterThan(2.3);
    }
  });
});

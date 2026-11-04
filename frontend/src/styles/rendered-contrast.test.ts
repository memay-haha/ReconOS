// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  scanPaintedForegrounds,
  scanRenderedPairs,
  scanUnresolvedClassNames,
} from '../../scripts/scan-contrast-pairs';
import type { RenderedPair } from '../../scripts/scan-contrast-pairs';
import { CONTRAST_EXCEPTIONS, PAIRS } from './contrast-pairs';
import { contrastRatio } from './contrast';
import { TOKEN_ROWS } from './token-table.generated';

/**
 * The guard the hand-written PAIRS list could not be. It reads the colour pairs out of the
 * components and holds every one of them to WCAG 2.1 AA in both themes, so a screen that
 * paints a pair nobody listed now fails instead of shipping, which is how the primary button
 * reached production at 1.22:1 in the light theme.
 */
const srcRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const COLOUR_TOKENS = TOKEN_ROWS.filter((row) => row.name.startsWith('color-')).map(
  (row) => row.name,
);
const VALUES = new Map(TOKEN_ROWS.map((row) => [row.name, row.values]));
const THEMES = ['dark', 'light'] as const;

/** An empty light cell means the token does not change with the theme. */
function valueOf(token: string, theme: (typeof THEMES)[number]): string {
  const values = VALUES.get(token);
  if (values === undefined) throw new Error(`design-system.md has no token ${token}`);
  const light = values.light;
  return theme === 'light' && light !== undefined && light !== '' ? light : (values.dark ?? '');
}

/** Ratio of a pair, or undefined when a value is not an opaque hex (the focus ring). */
function ratioOf(pair: RenderedPair, theme: (typeof THEMES)[number]): number | undefined {
  try {
    return contrastRatio(valueOf(pair.foreground, theme), valueOf(pair.background, theme));
  } catch {
    return undefined;
  }
}

function describePair(pair: RenderedPair): string {
  const state = pair.state === '' ? 'at rest' : `in the ${pair.state} state`;
  const ratios = THEMES.map((theme) => `${theme} ${ratioOf(pair, theme)?.toFixed(2) ?? '-'}`);
  return `${pair.foreground} on ${pair.background} ${state} (${ratios.join(', ')}) at ${pair.where}`;
}

const RENDERED = scanRenderedPairs(srcRoot, COLOUR_TOKENS);

describe('colour pairs the screens really paint', () => {
  it('finds the pairs instead of trusting a list', () => {
    // A scanner that stops seeing the components would pass every assertion below in
    // silence, so the count is part of the guard.
    expect(RENDERED.length).toBeGreaterThan(30);
  });

  it('understands every className expression it reads', () => {
    // An expression the scanner cannot evaluate contributes no pair, so a component built
    // on it would escape the guard without a sound. Making that loud is the point.
    const blind = scanUnresolvedClassNames(srcRoot).map(
      (item) => `${item.where}  ${item.expression}`,
    );
    expect(
      blind,
      `The contrast scan cannot read these className expressions:\n${blind.join('\n')}\n` +
        'Write the classes as string literals, template literals, ternaries, module-level ' +
        'constants or lookup tables, or pass them to cn/clsx/twMerge as literal arguments.',
    ).toEqual([]);
  });

  it.each(THEMES)('reaches WCAG AA in the %s theme', (theme) => {
    const exempt = new Set(
      CONTRAST_EXCEPTIONS.map((entry) => `${entry.foreground}|${entry.background}`),
    );
    const failures = RENDERED.filter((pair) => {
      if (exempt.has(`${pair.foreground}|${pair.background}`)) return false;
      const ratio = ratioOf(pair, theme);
      return ratio !== undefined && ratio < 4.5;
    }).map(describePair);
    expect(
      failures,
      `Below 4.5:1 in the ${theme} theme:\n${failures.join('\n')}\n` +
        'Change the value in the Token Table of docs/design/design-system.md and run ' +
        '`pnpm --dir frontend tokens`, or add a reasoned entry to CONTRAST_EXCEPTIONS.',
    ).toEqual([]);
  });

  it('carries no exception for a pair the screens stopped painting', () => {
    const rendered = new Set(RENDERED.map((pair) => `${pair.foreground}|${pair.background}`));
    const stale = CONTRAST_EXCEPTIONS.filter(
      (entry) => !rendered.has(`${entry.foreground}|${entry.background}`),
    ).map((entry) => `${entry.foreground} on ${entry.background}`);
    expect(stale, `No screen paints:\n${stale.join('\n')}`).toEqual([]);
  });

  it('leaves no text colour unaccounted for', () => {
    // The scan reads one JSX tree at a time, so a fill painted by a component in another
    // file is invisible to it. Those pairs belong in PAIRS, and this is what notices.
    const resolved = new Set(RENDERED.map((pair) => pair.foreground));
    const listed = new Set(PAIRS.map(([foreground]) => foreground));
    const orphans = [...scanPaintedForegrounds(srcRoot, COLOUR_TOKENS)]
      .filter(([token]) => !resolved.has(token) && !listed.has(token))
      .map(([token, where]) => `${token} at ${where}`);
    expect(
      orphans,
      `Painted on a background this scan cannot see, and absent from PAIRS:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });
});

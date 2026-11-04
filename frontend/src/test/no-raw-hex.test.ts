// @vitest-environment node
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Colour lives in one place: the Token Table of docs/design/design-system.md, which
 * `pnpm tokens` turns into globals.css. A hex written straight into a component leaves the
 * light theme behind and the contrast tests cannot see it, so nothing holds it to AA.
 *
 * `.claude/rules/testing.md` requires a guard on an interface convention to read
 * `frontend/e2e/` as well, and that applies here: a spec that asserts on `#22d3ee` pins a
 * token value from outside the pipeline exactly as a component would, and `src/`-only
 * scanning is how the rule rots in the tree nobody checks.
 */
const ROOTS: ReadonlyArray<readonly [string, string]> = [
  ['', fileURLToPath(new URL('../', import.meta.url))],
  ['e2e/', fileURLToPath(new URL('../../e2e/', import.meta.url))],
];

// Three or six hex digits, and nothing word-like after them, so `#main` and `#ramp-title`
// in an href or an aria reference are left alone.
const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{6})(?![0-9a-z_-])/i;

describe('colour values', () => {
  it('come from the Token Table, never from a hex in the source', () => {
    const offenders: string[] = [];
    for (const [label, root] of ROOTS) {
      const files = globSync('**/*.{ts,tsx}', { cwd: root })
        // A test may name a colour: proving the contrast function needs two of them.
        // A generated module is the Token Table itself, rewritten by `pnpm tokens`.
        .filter((file) => !file.includes('.test.') && !file.includes('.generated.'));
      for (const file of files) {
        readFileSync(`${root}${file}`, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (HEX.test(line)) offenders.push(`${label}${file}:${index + 1}: ${line.trim()}`);
          });
      }
    }
    expect(
      offenders,
      `Raw colour values found. Add the colour to the Token Table in ` +
        `docs/design/design-system.md and run \`pnpm --dir frontend tokens\`:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});

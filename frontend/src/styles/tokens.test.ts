// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateCss, parseTokenTable } from '../../scripts/generate-tokens.mjs';

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

  it('skips group rows and the header row', () => {
    const rows = parseTokenTable(designSystem);
    expect(rows.some((r) => r.name === 'token' || r.name.includes('*'))).toBe(false);
  });
});

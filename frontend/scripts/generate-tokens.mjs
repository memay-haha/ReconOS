// Generates src/styles/globals.css from the token table in the design system.
// The stylesheet is never edited by hand: docs/design/design-system.md is the
// single source, and tokens.test.ts fails when the two drift apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEADER = `/* Design tokens generated from docs/design/design-system.md. Do not hand-edit:
   change the design system first, then regenerate. */
@import "tailwindcss";
`;

const BASE_LAYER = `@layer base {
  html,
  body {
    margin: 0;
    padding: 0;
  }

  body {
    background-color: var(--color-bg);
    color: var(--color-fg);
  }
}
`;

/**
 * @typedef {{ group: string | null, name: string, values: Record<string, string> }} TokenRow
 */

/**
 * Splits one markdown table line into trimmed cells, or null when it is not a table row.
 * @param {string} line
 * @returns {string[] | null}
 */
function splitRow(line) {
  if (!line.startsWith('|') || !line.endsWith('|')) return null;
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Rows of the token table, in document order, with their group headings.
 * Columns are named by the header row, so a new theme column adds a key to `values`.
 * @param {string} markdown
 * @returns {TokenRow[]}
 */
export function parseTokenTable(markdown) {
  const afterHeading = markdown.split('### Token Table')[1];
  if (afterHeading === undefined) throw new Error('design-system.md has no Token Table section');
  // The section ends at the next heading.
  const section = afterHeading.split(/\n#{1,6} /)[0];
  /** @type {TokenRow[]} */
  const rows = [];
  /** @type {string[] | null} */
  let columns = null;
  /** @type {string | null} */
  let group = null;
  for (const line of section.split('\n')) {
    const cells = splitRow(line);
    if (cells === null) continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    const token = cells[0];
    if (columns === null) {
      if (token !== 'token') throw new Error('token table header must start with "token"');
      columns = cells.slice(1);
      continue;
    }
    const groupMatch = /^\*\*(.+)\*\*$/.exec(token);
    if (groupMatch) {
      group = groupMatch[1];
      continue;
    }
    if (!/^[\w-]+$/.test(token)) throw new Error(`invalid token name: ${token}`);
    /** @type {Record<string, string>} */
    const values = {};
    columns.forEach((column, i) => {
      values[column] = cells[i + 1] ?? '';
    });
    rows.push({ group, name: token, values });
  }
  if (rows.length === 0) throw new Error('token table is empty');
  return rows;
}

/**
 * Dark values for the tokens whose light and dark values differ. One declaration list feeds
 * both blocks, so the media query and the attribute selector cannot drift apart.
 * @param {TokenRow[]} rows
 * @returns {string}
 */
function darkOverrides(rows) {
  const themed = rows.filter(
    (row) => row.values.light !== '' && row.values.light !== row.values.dark,
  );
  /** @param {string} indent */
  const declarations = (indent) =>
    themed.map((row) => `${indent}--${row.name}: ${row.values.dark};`).join('\n');
  return `/* Dark theme. The toggle sets data-theme on <html>; without it the
   media query follows the operating system. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${declarations('    ')}
  }
}

:root[data-theme="dark"] {
${declarations('  ')}
}
`;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function generateCss(markdown) {
  const rows = parseTokenTable(markdown);
  /** @type {string[]} */
  const lines = [];
  let group = null;
  for (const row of rows) {
    if (row.group !== group) {
      if (group !== null) lines.push('');
      group = row.group;
      lines.push(`  /* ${group} */`);
    }
    // The light value is the default; a token with no light value is theme invariant.
    const light = row.values.light ?? '';
    lines.push(`  --${row.name}: ${light === '' ? row.values.dark : light};`);
  }
  return `${HEADER}\n@theme {\n${lines.join('\n')}\n}\n\n${BASE_LAYER}\n${darkOverrides(rows)}`;
}

function main() {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const markdown = readFileSync(`${repoRoot}/docs/design/design-system.md`, 'utf8');
  writeFileSync(`${repoRoot}/frontend/src/styles/globals.css`, generateCss(markdown), 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

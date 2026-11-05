// Generates src/styles/globals.css from the token table in the design system.
// The dark theme is the default: the mockups are dark only, so @theme carries the dark
// values and the light values are overrides. Without data-theme on <html> the media query
// follows the operating system (light only when it asks for light); data-theme="dark" or
// "light" set by the toggle always wins.
// The stylesheet is never edited by hand: docs/design/design-system.md is the
// single source, and tokens.test.ts fails when the two drift apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEADER = `/* Design tokens generated from docs/design/design-system.md. Do not hand-edit:
   change the design system first, then regenerate. */
@import "tailwindcss";
`;

// Tells the browser the page is dark, so scrollbars, form controls, autofill and the
// overscroll canvas match. The light blocks below flip it.
const COLOUR_SCHEME = `:root {
  color-scheme: dark;
}
`;

// The icon font's own stylesheet (a <link> in the root layout) sets font-size: 24px,
// display: inline-block and the like on .material-symbols-outlined. It is unlayered, so it
// beats every Tailwind utility, which live in cascade layers: text-icon, hidden and the
// other classes the mockups put on icons never applied. The unlayered rule below, more
// specific than the font's, hands those properties back to the layers (revert-layer); the
// font's defaults are restated in the base layer, so an icon with no class keeps them.
const ICON_FONT = `.material-symbols-outlined.material-symbols-outlined {
  display: revert-layer;
  font-size: revert-layer;
  font-weight: revert-layer;
  letter-spacing: revert-layer;
  line-height: revert-layer;
  text-transform: revert-layer;
  white-space: revert-layer;
}
`;

const BASE_LAYER = `@layer base {
  .material-symbols-outlined {
    display: inline-block;
    font-size: 24px;
    font-weight: normal;
    letter-spacing: normal;
    line-height: 1;
    text-transform: none;
    white-space: nowrap;
  }

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
 * Light values for the tokens whose light and dark values differ. One declaration list feeds
 * both blocks, so the media query and the attribute selector cannot drift apart.
 * @param {TokenRow[]} rows
 * @returns {string}
 */
function lightOverrides(rows) {
  const themed = rows.filter(
    (row) => row.values.light !== '' && row.values.light !== row.values.dark,
  );
  /** @param {string} indent */
  const declarations = (indent) =>
    themed.map((row) => `${indent}--${row.name}: ${row.values.light};`).join('\n');
  return `/* Light theme. The toggle sets data-theme on <html>; without it the
   media query follows the operating system. */
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    color-scheme: light;
${declarations('    ')}
  }
}

:root[data-theme="light"] {
  color-scheme: light;
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
    // The dark value is the default; a token with no dark value falls back to the light one.
    const dark = row.values.dark ?? '';
    lines.push(`  --${row.name}: ${dark === '' ? row.values.light : dark};`);
  }
  return `${HEADER}\n@theme {\n${lines.join('\n')}\n}\n\n${COLOUR_SCHEME}\n${BASE_LAYER}\n${ICON_FONT}\n${lightOverrides(rows)}`;
}

/**
 * The parsed Token Table as a TypeScript module, so the Component Library page imports its
 * rows instead of reading docs/ at runtime (the production image carries no docs/).
 * @param {string} markdown
 * @returns {string}
 */
export function generateTokenModule(markdown) {
  const rows = parseTokenTable(markdown);
  return `// Token Table rows generated from docs/design/design-system.md. Do not hand-edit:
// change the design system first, then run \`pnpm tokens\`.
export interface TokenRow {
  readonly group: string | null;
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

export const TOKEN_ROWS: readonly TokenRow[] = ${JSON.stringify(rows, null, 2)};
`;
}

function main() {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const markdown = readFileSync(`${repoRoot}/docs/design/design-system.md`, 'utf8');
  writeFileSync(`${repoRoot}/frontend/src/styles/globals.css`, generateCss(markdown), 'utf8');
  writeFileSync(
    `${repoRoot}/frontend/src/styles/token-table.generated.ts`,
    generateTokenModule(markdown),
    'utf8',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

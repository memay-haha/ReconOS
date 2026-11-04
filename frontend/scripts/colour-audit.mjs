import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Which token names may serve which Tailwind property. A colour used as text
 * must not be matched to a border token just because the hex is close. */
const ROLE_OF_TOKEN = {
  text: (n) =>
    n.startsWith('fg') ||
    n.startsWith('on-') ||
    n.startsWith('asset-') ||
    ['primary', 'good', 'warn', 'crit', 'info', 'error', 'accent-ink'].includes(n),
  bg: (n) =>
    n.startsWith('bg') ||
    n.startsWith('surface') ||
    n.endsWith('-soft') ||
    n.endsWith('-container'),
  border: (n) =>
    n.startsWith('border') || n.startsWith('outline') || n.endsWith('-bd') || n === 'ring',
};

function srgbToLab(hex) {
  const h = hex.replace('#', '');
  const channel = (v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(h.slice(0, 2));
  const g = channel(h.slice(2, 4));
  const b = channel(h.slice(4, 6));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a, b) {
  const [l1, a1, b1] = srgbToLab(a);
  const [l2, a2, b2] = srgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function nearestToken(hex, role, tokens) {
  const fits = ROLE_OF_TOKEN[role] ?? (() => true);
  const names = Object.keys(tokens).filter(fits);
  const pool = names.length > 0 ? names : Object.keys(tokens);
  let best = { token: pool[0], deltaE: Infinity };
  for (const name of pool) {
    const d = deltaE(hex, tokens[name]);
    if (d < best.deltaE) best = { token: name, deltaE: d };
  }
  return best;
}

export function collectMockupColours(dir) {
  const found = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    const re = /\b(bg|text|border|ring)-\[(#[0-9a-fA-F]{6})\]/g;
    for (const m of text.matchAll(re)) {
      const role = m[1] === 'ring' ? 'border' : m[1];
      const hex = m[2].toLowerCase();
      const entry = found.get(hex) ?? { roles: {}, count: 0 };
      entry.roles[role] = (entry.roles[role] ?? 0) + 1;
      entry.count += 1;
      found.set(hex, entry);
    }
  }
  for (const entry of found.values()) {
    entry.role = Object.entries(entry.roles).sort((a, b) => b[1] - a[1])[0][0];
  }
  return found;
}

/** Read `{tokenName: darkValue}` from the `:root[data-theme="dark"]` block of
 * globals.css. Names lose the `color-` prefix; an alpha channel is dropped. */
export function darkTokenValues(css) {
  const start = css.indexOf(':root[data-theme="dark"]');
  if (start < 0) throw new Error('no dark theme block in the stylesheet');
  const block = css.slice(start, css.indexOf('}', start));
  const out = {};
  for (const m of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})[0-9a-fA-F]{0,2};/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const tokens = darkTokenValues(readFileSync(join(here, '../src/styles/globals.css'), 'utf8'));
  const found = collectMockupColours(join(here, '../../docs/design/screens'));
  const rows = [...found.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log('hex      uses role   nearest-token (same role)           dE');
  for (const [hex, { count, role }] of rows) {
    const hit = nearestToken(hex, role, tokens);
    console.log(
      `${hex} ${String(count).padStart(4)} ${role.padEnd(6)} ${hit.token.padEnd(34)} ${hit.deltaE.toFixed(1)}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

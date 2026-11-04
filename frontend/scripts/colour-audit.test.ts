// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { collectMockupColours, deltaE, nearestToken } from './colour-audit.mjs';

describe('deltaE', () => {
  it('is zero for a colour against itself', () => {
    expect(deltaE('#161d2b', '#161d2b')).toBe(0);
  });

  it('is symmetric', () => {
    expect(deltaE('#94a3b8', '#9aa4b2')).toBeCloseTo(deltaE('#9aa4b2', '#94a3b8'), 10);
  });

  it('calls two greys that differ by one digit indistinguishable', () => {
    // #161d2b is used 118 times and #161d2a 26 times. Below 2.3 the eye
    // cannot tell them apart, so they must collapse to one token.
    expect(deltaE('#161d2b', '#161d2a')).toBeLessThan(2.3);
  });

  it('separates two colours a reader would call different', () => {
    expect(deltaE('#f87171', '#4ade80')).toBeGreaterThan(20);
  });
});

describe('nearestToken', () => {
  const tokens = {
    'fg-muted': '#9aa4b2',
    'border-strong': '#a0a9ba',
    'surface-container-low': '#131c27',
  };

  it('matches within the same role, not merely the closest colour', () => {
    // #94a3b8 is used as text. border-strong is closer in raw distance but
    // is a border token, so a text usage must not land on it.
    const hit = nearestToken('#94a3b8', 'text', tokens);
    expect(hit.token).toBe('fg-muted');
  });

  it('reports the distance so a caller can refuse a loose match', () => {
    const hit = nearestToken('#f87171', 'text', tokens);
    expect(hit.deltaE).toBeGreaterThan(5);
  });
});

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const map: Record<string, string> = JSON.parse(
  readFileSync(`${repoRoot}frontend/scripts/colour-map.json`, 'utf8'),
);

describe('colour-map.json', () => {
  it('covers every hex the mockups write out', () => {
    const found = collectMockupColours(`${repoRoot}docs/design/screens`);
    const missing = [...found.keys()].filter((hex) => !(hex in map));
    expect(missing).toEqual([]);
  });

  it('names tokens by role, never by value', () => {
    for (const token of Object.values(map)) {
      expect(token).not.toMatch(/^[0-9a-f]{3,8}$/);
      expect(token).not.toMatch(/slate|zinc|gray|grey|red-\d|amber-\d/);
    }
  });
});

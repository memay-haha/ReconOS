import { describe, expect, it } from 'vitest';

import { formatAgo } from './format-ago';

const NOW = Date.parse('2026-11-05T10:00:00Z');

describe('formatAgo', () => {
  it.each([
    ['2026-11-05T09:59:48Z', '12s ago'],
    ['2026-11-05T09:58:00Z', '2m ago'],
    ['2026-11-05T07:00:00Z', '3h ago'],
    ['2026-11-03T10:00:00Z', '2d ago'],
    // A clock a little ahead of the server must not print a negative age.
    ['2026-11-05T10:00:05Z', '0s ago'],
  ])('writes %s as %s', (value, text) => {
    expect(formatAgo(value, NOW)).toBe(text);
  });
});

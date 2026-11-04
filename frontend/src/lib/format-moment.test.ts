import { describe, expect, it } from 'vitest';

import { formatMoment } from './format-moment';

describe('formatMoment', () => {
  it.each([
    ['2026-11-04T01:05:00Z', '04/11/2026 08:05'],
    ['2026-11-04T08:30:00Z', '04/11/2026 15:30'],
    ['2026-11-03T17:00:00Z', '04/11/2026 00:00'],
  ])('writes %s as %s (Asia/Ho_Chi_Minh, 24 hour clock)', (iso, expected) => {
    expect(formatMoment(iso)).toBe(expected);
  });
});

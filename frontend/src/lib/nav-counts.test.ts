import { describe, expect, it } from 'vitest';

import { readCount } from './nav-counts';

describe('readCount', () => {
  it('reads a dotted field', () => {
    expect(readCount({ assets_new: { domain: 64 } }, 'assets_new.domain')).toBe(64);
    expect(readCount({ total: 3 }, 'total')).toBe(3);
  });

  it('gives null for a missing or non-numeric field', () => {
    expect(readCount(undefined, 'total')).toBeNull();
    expect(readCount({ assets_new: null }, 'assets_new.domain')).toBeNull();
    expect(readCount({ total: '3' }, 'total')).toBeNull();
  });
});

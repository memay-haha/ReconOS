import { describe, expect, it } from 'vitest';

import { withQuery } from './page';

describe('withQuery', () => {
  it('leaves absent filters out of the URL', () => {
    expect(withQuery('/domains', { program_id: null, dns_status: undefined, cursor: '' })).toBe(
      '/domains',
    );
  });

  it('repeats a parameter for a list and keeps false', () => {
    expect(withQuery('/findings', { severity: ['critical', 'high'], in_scope: false })).toBe(
      '/findings?severity=critical&severity=high&in_scope=false',
    );
  });
});

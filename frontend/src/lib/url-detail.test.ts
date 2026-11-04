import { describe, expect, it } from 'vitest';

import { httpHref } from './url-detail';

describe('httpHref', () => {
  it('keeps http and https', () => {
    expect(httpHref('https://auth.example.com/login')).toBe('https://auth.example.com/login');
    expect(httpHref('http://example.org')).toBe('http://example.org/');
  });

  it('refuses every other scheme and junk', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'x', '']) {
      expect(httpHref(bad)).toBeNull();
    }
    expect(httpHref(null)).toBeNull();
    expect(httpHref(undefined)).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_INIT_SCRIPT } from './theme-init-script';

const run = () => new Function(THEME_INIT_SCRIPT)();

describe('THEME_INIT_SCRIPT', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies the remembered choice', () => {
    localStorage.setItem('reconos-theme', 'dark');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves the attribute off when nothing is stored', () => {
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores a stored value that is neither light nor dark', () => {
    localStorage.setItem('reconos-theme', 'purple');
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from './theme-toggle';

// public/ is served as is, so the test reads the file that ships rather than a copy of it.
// Resolved from the Vitest root (frontend/), because import.meta.url is not a file URL
// once the jsdom environment has transformed the module.
const SOURCE = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');

const run = () => new Function(SOURCE)();

describe('public/theme-init.js', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the key the toggle writes', () => {
    expect(SOURCE).toContain(`'${THEME_STORAGE_KEY}'`);
  });

  it('applies the remembered choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves the attribute off when nothing is stored', () => {
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores a stored value that is neither light nor dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
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

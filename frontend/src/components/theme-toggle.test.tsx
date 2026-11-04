import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('follows the operating system until the reader chooses', () => {
    render(<ThemeToggle />);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('writes the choice to the document and remembers it', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /giao diện/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('reconos-theme')).toBe('dark');
  });

  it('still renders and switches the page when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /giao diện/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('moves to light on the first click when the operating system is dark', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
    }));
    render(<ThemeToggle />);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /giao diện/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('reconos-theme')).toBe('light');
  });

  it('switches back to light from dark', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /giao diện/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('reconos-theme')).toBe('light');
  });
});

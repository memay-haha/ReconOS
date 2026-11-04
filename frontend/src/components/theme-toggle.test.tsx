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
    await userEvent.click(screen.getByRole('button', { name: /switch to \w+ theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('reconos-theme')).toBe('light');
  });

  it('still renders and switches the page when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /switch to \w+ theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('moves to dark on the first click when the operating system asks for light', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
      media: query,
    }));
    render(<ThemeToggle />);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /switch to \w+ theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('reconos-theme')).toBe('dark');
  });

  it('switches back to dark from light', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /switch to \w+ theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('reconos-theme')).toBe('dark');
  });

  it('names the theme a press switches to, and the name follows the switch', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    const button = await screen.findByRole('button', { name: 'Switch to light theme' });
    expect(button).toHaveTextContent('dark_mode');
    await userEvent.click(button);
    const back = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(back).toHaveTextContent('light_mode');
  });

  it('reads the real theme after mount when the page starts light', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeToggle />);
    expect(await screen.findByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('hides the icon glyph text from assistive technology', () => {
    render(<ThemeToggle />);
    const glyph = screen.getByRole('button').querySelector('.material-symbols-outlined');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
  });
});

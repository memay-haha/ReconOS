'use client';

import { useSyncExternalStore } from 'react';

/** Where the chosen theme is remembered. public/theme-init.js reads the same key
 * before first paint; src/components/theme-init.test.ts keeps the two in step. */
export const THEME_STORAGE_KEY = 'reconos-theme';
type Theme = 'light' | 'dark';

// Storage can throw (private window, blocked site data): the page must still work.
function remember(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice still applies to the current page.
  }
}

// Dark is the stylesheet default, so the system shows light only when it asks for light.
function prefersLight(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  );
}

function current(): Theme | null {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : null;
}

function shownTheme(): Theme {
  return current() ?? (prefersLight() ? 'light' : 'dark');
}

function subscribe(notify: () => void): () => void {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The mockup's 32px icon button (s01-login.html). The icon shows the theme on screen;
 * the accessible name says which theme a press switches to. A pseudo-element grows the
 * hit area to 44px without changing the drawn size. */
export function ThemeToggle() {
  // The document attribute is the state, set before paint by public/theme-init.js. The
  // server cannot know it, so the server snapshot assumes the dark default.
  const shown = useSyncExternalStore(subscribe, shownTheme, () => 'dark');

  const toggle = () => {
    const next: Theme = shownTheme() === 'dark' ? 'light' : 'dark';
    remember(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const next: Theme = shown === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      className="relative flex h-8 w-8 items-center justify-center rounded-sm bg-surface-2 text-on-surface-variant transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-surface-container-high hover:text-on-surface"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-icon">
        {shown === 'dark' ? 'dark_mode' : 'light_mode'}
      </span>
    </button>
  );
}

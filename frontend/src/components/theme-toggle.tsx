'use client';

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

export function ThemeToggle() {
  // The document attribute is the state, set before paint by public/theme-init.js.
  // No attribute means "follow the operating system", which is dark unless it asks for light.
  const toggle = () => {
    const shown = current() ?? (prefersLight() ? 'light' : 'dark');
    const next: Theme = shown === 'dark' ? 'light' : 'dark';
    remember(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md border border-border px-3 py-2 text-fg hover:bg-surface-container-high"
    >
      Toggle theme
    </button>
  );
}

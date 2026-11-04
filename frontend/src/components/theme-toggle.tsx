'use client';

const STORAGE_KEY = 'reconos-theme';
type Theme = 'light' | 'dark';

// Storage can throw (private window, blocked site data): the page must still work.
function remember(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice still applies to the current page.
  }
}

function prefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function current(): Theme | null {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : null;
}

export function ThemeToggle() {
  // The document attribute is the state, set before paint by the script in layout.tsx.
  // No attribute means "follow the operating system".
  const toggle = () => {
    const shown = current() ?? (prefersDark() ? 'dark' : 'light');
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
      Đổi giao diện
    </button>
  );
}

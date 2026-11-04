import { ThemeToggle } from './theme-toggle';

export function Topbar() {
  return (
    <header className="fixed top-0 right-0 left-sidebar z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-gutter">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-caption text-fg-faint">
        <span>ReconOS</span>
        <span aria-hidden="true">&gt;</span>
        <span>Console</span>
      </nav>
      <ThemeToggle />
    </header>
  );
}

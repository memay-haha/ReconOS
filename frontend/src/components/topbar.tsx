import { ThemeToggle } from './theme-toggle';

export function Topbar() {
  // Below md the sidebar is folded away and its Menu button sits over the left 14 units.
  return (
    <header className="fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface pr-gutter pl-14 md:left-sidebar md:pl-gutter">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-caption text-fg-faint">
        <span>ReconOS</span>
        <span aria-hidden="true">&gt;</span>
        <span>Console</span>
      </nav>
      <ThemeToggle />
    </header>
  );
}

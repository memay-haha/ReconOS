'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { ComponentStatus } from '@/lib/system';

import { currentScreen } from './nav-items';
import { ThemeToggle } from './theme-toggle';

// The pill shows the dispatcher row of GET /system/health as the backend computed it; the
// frontend does not judge liveness from a heartbeat itself.
const DISPATCHER: Record<ComponentStatus, { label: string; tone: string; dot: string }> = {
  ok: {
    label: 'Dispatcher online',
    tone: 'border-good-bd bg-good-soft text-good',
    dot: 'bg-good motion-safe:animate-pulse',
  },
  degraded: {
    label: 'Dispatcher degraded',
    tone: 'border-warn-bd bg-warn-soft text-warn',
    dot: 'bg-warn',
  },
  down: { label: 'Dispatcher down', tone: 'border-crit-bd bg-crit-soft text-crit', dot: 'bg-crit' },
};

function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function Topbar({
  displayName,
  dispatcher,
  navToggled,
  navExpanded,
  onToggleNav,
}: {
  displayName: string | null;
  /** Null while unknown, or for a role that may not read GET /system/health: no pill then. */
  dispatcher: ComponentStatus | null;
  navToggled: boolean;
  /** Whether the sidebar is on screen now, which depends on the breakpoint as well. */
  navExpanded: boolean;
  onToggleNav: () => void;
}) {
  const where = currentScreen(usePathname());
  const pill = dispatcher === null ? null : DISPATCHER[dispatcher];

  return (
    <header
      className={`${navToggled ? 'md:left-0' : 'md:left-sidebar'} fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between gap-space-md border-b border-border bg-surface px-gutter md:px-margin`}
    >
      <div className="flex min-w-0 items-center gap-space-md">
        <button
          type="button"
          aria-label="Menu"
          aria-controls="sidebar"
          aria-expanded={navExpanded}
          onClick={onToggleNav}
          className="flex rounded-sm border border-border p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Icon name="menu" />
        </button>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
          <ol className="flex items-center gap-1.5 text-caption text-fg-faint">
            <li>ReconOS</li>
            {where === null ? null : (
              <>
                {where.group.heading === null ? null : (
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="material-symbols-outlined text-caption">
                      chevron_right
                    </span>
                    {where.group.heading}
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="material-symbols-outlined text-caption">
                    chevron_right
                  </span>
                  <span aria-current="page" className="truncate font-medium text-fg">
                    {where.item.label}
                  </span>
                </li>
              </>
            )}
          </ol>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-space-md">
        {pill === null ? null : (
          <Link
            href="/system"
            className={`flex items-center gap-2 rounded-sm border px-2.5 py-1 transition-colors ${pill.tone}`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${pill.dot}`} />
            <span className="font-body-code text-caption font-medium tracking-wider uppercase">
              {pill.label}
            </span>
          </Link>
        )}
        <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
        <ThemeToggle look="bare" />
        {displayName === null ? null : (
          <>
            <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
            {/* Who is signed in, as the mockup's avatar shows; the account card in the sidebar
                holds the controls. */}
            <span
              title={displayName}
              aria-hidden="true"
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-border-raised bg-accent-soft font-body-code text-caption font-semibold text-primary sm:flex"
            >
              {initials(displayName)}
            </span>
          </>
        )}
      </div>
    </header>
  );
}

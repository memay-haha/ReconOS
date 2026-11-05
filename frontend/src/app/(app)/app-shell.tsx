'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState, useSyncExternalStore } from 'react';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import type { CurrentUser } from '@/lib/auth';
import { useLogout } from '@/lib/auth';
import { useNavCounts } from '@/lib/nav-counts';
import { useSystemHealth } from '@/lib/system';

// Tailwind's md breakpoint: from here up the sidebar is a column, below it a fold-out.
const WIDE = '(min-width: 48rem)';

function subscribeWide(notify: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

/** Owns the sidebar counts, the dispatcher pill and the sign-out call: the components
 * themselves call no API. */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const counts = useNavCounts();
  const router = useRouter();
  const logout = useLogout();
  // GET /system/health is Superadmin and Admin only (openapi.yaml): a User gets no pill
  // rather than a 403.
  const health = useSystemHealth(user.role !== 'user');
  const dispatcher =
    health.data?.components.find((component) => component.name === 'dispatcher')?.status ?? null;
  // The menu button flips the default of each breakpoint: open the fold-out below md,
  // hide the column from md up. Only CSS reads it, so the server render matches.
  const [navToggled, setNavToggled] = useState(false);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );

  return (
    <>
      <Sidebar
        user={user}
        counts={counts}
        toggled={navToggled}
        onSignOut={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}
        signOutFailed={logout.isError}
      />
      <div className={`${navToggled ? '' : 'md:pl-sidebar'} flex min-h-screen flex-col bg-bg`}>
        <Topbar
          displayName={user.display_name}
          dispatcher={dispatcher}
          navToggled={navToggled}
          navExpanded={wide ? !navToggled : navToggled}
          onToggleNav={() => setNavToggled((value) => !value)}
        />
        {/* Full-bleed under the topbar; each route pads its screens through ScreenFrame. */}
        <main className="w-full flex-1 pt-14">{children}</main>
      </div>
    </>
  );
}

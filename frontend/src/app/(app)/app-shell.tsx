'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState, useSyncExternalStore } from 'react';

import { AlertBell } from '@/components/alert-bell';
import { GlobalSearch } from '@/components/global-search';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import {
  useAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useUnreadAlertCount,
} from '@/lib/alerts';
import type { CurrentUser } from '@/lib/auth';
import { useLogout } from '@/lib/auth';
import { useDispatcherStatus } from '@/lib/dispatcher';
import { useNavCounts } from '@/lib/nav-counts';
import { useRealtimeConnection } from '@/lib/realtime';
import { useGlobalSearch } from '@/lib/search';

// Tailwind's md breakpoint: from here up the sidebar is a column, below it a fold-out.
const WIDE = '(min-width: 48rem)';

function subscribeWide(notify: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

/** Owns the sidebar counts, the dispatcher pill, search, alerts, the WebSocket and the
 * sign-out call: the components themselves call no API. */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const counts = useNavCounts();
  const router = useRouter();
  const logout = useLogout();
  useRealtimeConnection();
  // GET /dispatcher/status is open to every role, so a User sees the pill too.
  const dispatcher = useDispatcherStatus().data?.status ?? null;
  const [searchText, setSearchText] = useState('');
  const search = useGlobalSearch(searchText);
  const [alertsOpened, setAlertsOpened] = useState(false);
  const alerts = useAlerts(10, alertsOpened);
  const unread = useUnreadAlertCount();
  const markRead = useMarkAlertRead();
  const markAllRead = useMarkAllAlertsRead();
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
          // S15 is Superadmin and Admin only.
          dispatcherHref={user.role === 'user' ? null : '/system'}
          search={
            <GlobalSearch
              query={searchText}
              onQueryChange={setSearchText}
              results={search.data?.items ?? null}
              loading={search.isFetching}
              failed={search.isError}
            />
          }
          bell={
            <AlertBell
              unread={unread.data ?? null}
              alerts={alerts.data?.items ?? null}
              loading={alerts.isPending}
              failed={alerts.isError}
              onOpen={() => setAlertsOpened(true)}
              onMarkRead={(id) => markRead.mutate(id)}
              onMarkAllRead={() => markAllRead.mutate()}
              markFailed={markRead.isError || markAllRead.isError}
            />
          }
        />
        {/* Full-bleed under the topbar; each route pads its screens through ScreenFrame. */}
        <main className="w-full flex-1 pt-14">{children}</main>
      </div>
    </>
  );
}

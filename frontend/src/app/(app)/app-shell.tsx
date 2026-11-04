'use client';

import type { ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import type { CurrentUser } from '@/lib/auth';
import { useNavCounts } from '@/lib/nav-counts';

/** Fetches the sidebar counts and hands them down: the components themselves call no API. */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const counts = useNavCounts();
  return (
    <>
      <Sidebar user={user} counts={counts} />
      <div className="flex min-h-screen flex-col bg-bg pl-sidebar">
        <Topbar />
        <main className="w-full flex-1 px-gutter py-gutter-dense pt-14">{children}</main>
      </div>
    </>
  );
}

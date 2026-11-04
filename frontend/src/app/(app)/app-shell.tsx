'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import type { CurrentUser } from '@/lib/auth';
import { useLogout } from '@/lib/auth';
import { useNavCounts } from '@/lib/nav-counts';

/** Owns the sidebar counts and the sign-out call: the components themselves call no API. */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const counts = useNavCounts();
  const router = useRouter();
  const logout = useLogout();
  return (
    <>
      <Sidebar
        user={user}
        counts={counts}
        onSignOut={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}
        signOutFailed={logout.isError}
      />
      <div className="flex min-h-screen flex-col bg-bg md:pl-sidebar">
        <Topbar />
        <main className="w-full flex-1 px-gutter py-gutter-dense pt-14">{children}</main>
      </div>
    </>
  );
}

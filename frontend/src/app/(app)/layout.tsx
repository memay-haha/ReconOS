import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { readSession } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The only authorization decision the frontend makes is "is there a session".
  // Everything finer is the backend's: docs/security/authorization.md.
  const user = await readSession();
  if (user === null) redirect('/login');

  return (
    <div className="flex min-h-dvh flex-col">
      <Topbar user={user} />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1 px-margin-mobile py-margin-mobile md:px-margin md:py-margin">
          {children}
        </main>
      </div>
    </div>
  );
}

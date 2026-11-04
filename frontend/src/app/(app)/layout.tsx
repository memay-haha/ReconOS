import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { readSessionForGuardedScreen } from '@/lib/session';

import { AppShell } from './app-shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The only authorization decision the frontend makes is "is there a session".
  // Everything finer is the backend's: docs/security/authorization.md.
  const user = await readSessionForGuardedScreen();
  if (user === null) redirect('/login');

  return <AppShell user={user}>{children}</AppShell>;
}

'use client';

import { useRouter } from 'next/navigation';

import type { CurrentUser } from '@/lib/auth';
import { useLogout } from '@/lib/auth';

import { ThemeToggle } from './theme-toggle';

const ROLE_LABEL: Record<CurrentUser['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
};

export function Topbar({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const logout = useLogout();

  return (
    <header className="flex items-center justify-between gap-space-md border-b border-border bg-surface px-space-md py-space-sm">
      <span className="font-panel-title text-panel-title text-fg">ReconOS</span>
      <div className="flex min-w-0 items-center gap-space-sm">
        <span className="flex min-w-0 flex-col text-right">
          <span className="truncate text-fg">{user.display_name}</span>
          <span className="text-caption text-fg-muted">{ROLE_LABEL[user.role]}</span>
        </span>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}
          className="rounded-md border border-border px-space-sm py-space-xs text-fg hover:bg-surface-container-high"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}

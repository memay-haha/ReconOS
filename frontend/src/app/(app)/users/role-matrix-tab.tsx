'use client';

import type { ReactElement } from 'react';

import { type PermissionGrant, useRolePermissions } from '@/lib/role-matrix';

const GRANT: Record<PermissionGrant, { label: string; icon: string; tone: string }> = {
  allow: { label: 'Allowed', icon: 'check_circle', tone: 'text-good' },
  limited: { label: 'Limited', icon: 'adjust', tone: 'text-warn' },
  deny: { label: 'Denied', icon: 'block', tone: 'text-fg-faint' },
};

function Grant({ value }: { value: PermissionGrant }): ReactElement {
  const grant = GRANT[value];
  return (
    <span className={`inline-flex items-center gap-1 font-body-code text-[11px] ${grant.tone}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
        {grant.icon}
      </span>
      {grant.label}
    </span>
  );
}

/** Read-only matrix from `GET /roles/permissions` (N36). */
export function RoleMatrixTab(): ReactElement {
  const matrix = useRolePermissions();
  return (
    <div className="w-full overflow-hidden rounded-sm border border-border bg-surface">
      {matrix.isPending && (
        <p className="px-space-md py-space-xl text-body-default text-fg-muted">
          Loading the role matrix…
        </p>
      )}
      {matrix.isError && (
        <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
          Could not load the role matrix.
        </p>
      )}
      {matrix.data !== undefined && (
        <div className="w-full overflow-x-auto" tabIndex={0}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-8 border-b border-border bg-surface-2 font-label-caps text-label-caps uppercase text-fg-muted">
                <th scope="col" className="px-4 py-2.5">
                  Action
                </th>
                <th scope="col" className="px-3 py-2">
                  Superadmin
                </th>
                <th scope="col" className="px-3 py-2">
                  Admin
                </th>
                <th scope="col" className="px-3 py-2">
                  User
                </th>
                <th scope="col" className="px-3 py-2">
                  Note
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-body-default">
              {matrix.data.items.map((row) => (
                <tr key={row.action} className="text-fg hover:bg-surface-3">
                  <td className="px-4 py-2.5 font-body-code text-body-code text-fg">
                    {row.action}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Grant value={row.superadmin} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Grant value={row.admin} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Grant value={row.user} />
                  </td>
                  <td className="px-3 py-2.5 text-caption text-fg-muted">{row.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

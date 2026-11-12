'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export type PermissionGrant = 'allow' | 'deny' | 'limited';

/** A row of `GET /roles/permissions`, generated from the backend's permission declarations
 * (N36), so the screen never keeps its own copy of authorization.md. */
export interface RolePermission {
  readonly action: string;
  readonly superadmin: PermissionGrant;
  readonly admin: PermissionGrant;
  readonly user: PermissionGrant;
  readonly note: string | null;
}

export interface RolePermissions {
  readonly items: readonly RolePermission[];
}

export const roleMatrixKeys = { all: ['roles', 'permissions'] as const };

/** Superadmin only. `enabled` false keeps the request from going out before the tab opens. */
export function useRolePermissions(enabled = true) {
  return useQuery({
    queryKey: roleMatrixKeys.all,
    queryFn: () => apiRequest<RolePermissions>('/roles/permissions'),
    enabled,
  });
}

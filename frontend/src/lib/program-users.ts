'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { CurrentUser } from './auth';
import { type Page, withQuery } from './page';

/** A row of `program_user`: docs/data/schema.md. */
export interface ProgramUser {
  readonly program_id: string;
  readonly user_id: string;
  readonly assigned_by: string | null;
  readonly assigned_at: string;
}

/** What `GET /users` answers an Admin: only these three fields (docs/api/architecture.md).
 * Superadmin receives more, but this screen reads no more than Admin may see. */
export interface UserDirectoryEntry {
  readonly id: string;
  readonly username: string;
  readonly role: CurrentUser['role'];
}

export const programUserKeys = {
  all: ['program-users'] as const,
  list: (programId: string, cursor: string | null) =>
    ['program-users', 'list', programId, cursor] as const,
};

export function useProgramUsers(programId: string, cursor: string | null = null, enabled = true) {
  return useQuery({
    queryKey: programUserKeys.list(programId, cursor),
    queryFn: () =>
      apiRequest<Page<ProgramUser>>(withQuery(`/programs/${programId}/users`, { cursor })),
    enabled,
  });
}

/** Under the users key so an account change refetches it too. */
export function useUserDirectory(enabled = true) {
  return useQuery({
    queryKey: ['users', 'directory'] as const,
    queryFn: () => apiRequest<Page<UserDirectoryEntry>>(withQuery('/users', { limit: 200 })),
    enabled,
  });
}

function useAssignmentMutation<TArg>(send: (arg: TArg) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => client.invalidateQueries({ queryKey: programUserKeys.all }),
  });
}

export function useAssignProgramUser(programId: string) {
  return useAssignmentMutation((userId: string) =>
    apiRequest<void>(`/programs/${programId}/users`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
  );
}

export function useUnassignProgramUser(programId: string) {
  return useAssignmentMutation((userId: string) =>
    apiRequest<void>(`/programs/${programId}/users/${userId}`, { method: 'DELETE' }),
  );
}

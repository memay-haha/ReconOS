'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { formatMoment } from '@/lib/format-moment';
import {
  useAssignProgramUser,
  useProgramUsers,
  useUnassignProgramUser,
  useUserDirectory,
} from '@/lib/program-users';

import { errorText } from '../error-text';
import { shortId } from '../links';
import { ALERT, DANGER_BUTTON, FIELD, LABEL, NOTE, PANEL, ROW_BUTTON, TD, TH } from '../ui';

/** The users tab, Superadmin and Admin only. Superadmin and Admin see every program, so
 * only accounts with the User role are offered for assignment: docs/data/schema.md. */
export function UsersPanel({ programId }: { programId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const assigned = useProgramUsers(programId, cursor);
  const directory = useUserDirectory();
  const assign = useAssignProgramUser(programId);
  const unassign = useUnassignProgramUser(programId);
  const [userId, setUserId] = useState('');

  const names = new Map((directory.data?.items ?? []).map((u) => [u.id, u.username]));
  const assignedIds = new Set((assigned.data?.items ?? []).map((row) => row.user_id));
  const candidates = (directory.data?.items ?? []).filter(
    (u) => u.role === 'user' && !assignedIds.has(u.id),
  );
  const chosen = userId !== '' ? userId : (candidates[0]?.id ?? '');
  const actionError = assign.error ?? unassign.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (chosen === '') return;
    assign.mutate(chosen, { onSuccess: () => setUserId('') });
  };

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      <h2 className="font-panel-title text-panel-title text-fg">Users</h2>
      <p className="text-body-default text-fg-muted">
        Accounts with the User role see only the programs they are assigned to.
      </p>
      <form
        onSubmit={submit}
        aria-label="Assign a user"
        className="flex flex-col gap-space-sm bg-surface sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-space-xs">
          <label htmlFor="assign-user" className={LABEL}>
            User
          </label>
          <select
            id="assign-user"
            value={chosen}
            onChange={(e) => setUserId(e.target.value)}
            disabled={candidates.length === 0}
            className={FIELD}
          >
            {candidates.length === 0 && <option value="">No account left to assign</option>}
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={assign.isPending || chosen === ''} className={ROW_BUTTON}>
          Assign
        </button>
      </form>
      {directory.isError && (
        <p role="alert" className={ALERT}>
          {errorText(directory.error, 'Could not load the account list.')}
        </p>
      )}
      {actionError !== null && (
        <p role="alert" className={ALERT}>
          {errorText(actionError, 'Could not change the assignment.')}
        </p>
      )}
      {assigned.isPending && <p className={NOTE}>Loading assigned users…</p>}
      {assigned.isError && (
        <p role="alert" className={ALERT}>
          {errorText(assigned.error, 'Could not load the assigned users.')}
        </p>
      )}
      {assigned.data !== undefined && assigned.data.items.length === 0 && (
        <p className={NOTE}>No User accounts are assigned to this program.</p>
      )}
      {assigned.data !== undefined && assigned.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse">
            <thead className="border-b border-border bg-surface-2">
              <tr>
                <th className={TH}>Username</th>
                <th className={TH}>Assigned</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assigned.data.items.map((row) => {
                const name = names.get(row.user_id) ?? shortId(row.user_id);
                return (
                  <tr key={row.user_id}>
                    <td className={`${TD} font-body-code`}>{name}</td>
                    <td className={TD}>{formatMoment(row.assigned_at)}</td>
                    <td className={TD}>
                      <button
                        type="button"
                        disabled={unassign.isPending}
                        onClick={() => unassign.mutate(row.user_id)}
                        aria-label={`Unassign ${name}`}
                        className={DANGER_BUTTON}
                      >
                        Unassign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {assigned.data !== undefined && (
        <Pagination
          label="Assigned user pagination"
          page={{
            total: assigned.data.total,
            totalIsEstimate: assigned.data.total_is_estimate,
            nextCursor: assigned.data.next_cursor,
          }}
          canGoBack={canGoBack}
          onBack={goBack}
          onNext={() => goNext(assigned.data.next_cursor)}
        />
      )}
    </div>
  );
}

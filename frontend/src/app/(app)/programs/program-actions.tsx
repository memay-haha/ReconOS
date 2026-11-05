'use client';

import { type ReactElement, useState } from 'react';

import type { CurrentUser } from '@/lib/auth';
import { type Program, useDeleteProgram, useProgramAction } from '@/lib/programs';

import { ConfirmDialog } from './dialog';
import { errorText } from './error-text';
import { ProgramForm } from './program-form';
import { DANGER_BUTTON, ROW_BUTTON } from './ui';

type Pending = 'archive' | 'delete' | null;

export type ProgramActionPart = 'edit' | 'toggle' | 'archive' | 'delete';
const ALL_PARTS: readonly ProgramActionPart[] = ['edit', 'toggle', 'archive', 'delete'];

/** Edit, Pause or Resume, Archive and Delete for one program, hidden by role for convenience
 * only: docs/security/authorization.md. Archive and Delete ask first. */
export function ProgramActions({
  program,
  role,
  parts = ALL_PARTS,
  onGone,
}: {
  program: Program;
  role: CurrentUser['role'] | null;
  /** Which controls to draw; S11 puts Pause and Resume in its Status column. */
  parts?: readonly ProgramActionPart[];
  /** Called after the program is archived or deleted, when it leaves the list. */
  onGone?: () => void;
}): ReactElement | null {
  const action = useProgramAction();
  const remove = useDeleteProgram();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<Pending>(null);
  const canManage = role === 'superadmin' || role === 'admin';
  if (!canManage || program.status === 'archived') return null;

  const closeConfirm = () => {
    setConfirming(null);
    action.reset();
    remove.reset();
  };
  const toggle = program.status === 'active' ? 'pause' : 'resume';
  const confirmError = confirming === 'delete' ? remove.error : action.error;

  return (
    <span className="flex flex-wrap items-center gap-space-xs">
      {parts.includes('edit') && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${program.name}`}
          className={ROW_BUTTON}
        >
          Edit
        </button>
      )}
      {parts.includes('toggle') && (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => action.mutate({ programId: program.id, action: toggle })}
          aria-label={`${toggle === 'pause' ? 'Pause' : 'Resume'} ${program.name}`}
          className={ROW_BUTTON}
        >
          {toggle === 'pause' ? 'Pause' : 'Resume'}
        </button>
      )}
      {parts.includes('archive') && (
        <button
          type="button"
          onClick={() => setConfirming('archive')}
          aria-label={`Archive ${program.name}`}
          className={ROW_BUTTON}
        >
          Archive
        </button>
      )}
      {parts.includes('delete') && role === 'superadmin' && (
        <button
          type="button"
          onClick={() => setConfirming('delete')}
          aria-label={`Delete ${program.name}`}
          className={DANGER_BUTTON}
        >
          Delete
        </button>
      )}
      {action.isError && confirming === null && (
        <span role="alert" className="text-caption text-crit-strong">
          {errorText(action.error, 'Could not change the program status.')}
        </span>
      )}
      {editing && <ProgramForm program={program} onDone={() => setEditing(false)} />}
      {confirming === 'archive' && (
        <ConfirmDialog
          title="Archive program"
          message={`Archive ${program.name}? No new jobs can be created, schedules stop, and jobs waiting for approval or in the queue are cancelled. Data stays read-only.`}
          confirmLabel="Archive"
          busy={action.isPending}
          error={
            confirmError === null ? null : errorText(confirmError, 'Could not archive the program.')
          }
          onClose={closeConfirm}
          onConfirm={() =>
            action.mutate(
              { programId: program.id, action: 'archive' },
              {
                onSuccess: () => {
                  setConfirming(null);
                  onGone?.();
                },
              },
            )
          }
        />
      )}
      {confirming === 'delete' && (
        <ConfirmDialog
          title="Delete program"
          message={`Delete ${program.name} and all of its data for good? This cannot be undone.`}
          confirmLabel="Delete"
          busy={remove.isPending}
          error={
            confirmError === null ? null : errorText(confirmError, 'Could not delete the program.')
          }
          onClose={closeConfirm}
          onConfirm={() =>
            remove.mutate(program.id, {
              onSuccess: () => {
                setConfirming(null);
                onGone?.();
              },
            })
          }
        />
      )}
    </span>
  );
}

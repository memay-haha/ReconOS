'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { RunScanDialog } from '@/components/run-scan-dialog';
import { useCreateJob } from '@/lib/jobs';
import { usePrograms } from '@/lib/programs';
import type { ToolModule } from '@/lib/tool-modules';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, LABEL, Modal } from '../system/modal';
import { loadErrorText } from '../system/states';

/** Run from S18: pick the program first, then the shared Run Scan dialog with free targets.
 * The backend checks scope and approval; nothing here does. */
export function RunModule({
  module,
  onDone,
  onClose,
}: {
  module: ToolModule;
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const programs = usePrograms({ status: 'active', limit: 200 });
  const [programId, setProgramId] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const create = useCreateJob();
  const items = programs.data?.items ?? [];
  const program = items.find((p) => p.id === chosen);

  const pick = (event: FormEvent) => {
    event.preventDefault();
    if (programId !== '') setChosen(programId);
  };

  if (program !== undefined) {
    return (
      <RunScanDialog
        open
        programName={program.name}
        targets={[]}
        editableTargets
        toolModules={[module]}
        pending={create.isPending}
        error={create.error}
        onClose={onClose}
        onSubmit={({ toolModuleId, target }) =>
          create.mutate(
            { program_id: program.id, tool_module_id: toolModuleId, target },
            { onSuccess: onDone },
          )
        }
      />
    );
  }

  return (
    <Modal title={`Run ${module.name}`} busy={false} onClose={onClose}>
      <form onSubmit={pick} className="flex flex-col gap-gutter">
        <label htmlFor="run-program" className={LABEL}>
          Program
          <select
            id="run-program"
            required
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className={FIELD}
          >
            <option value="">Choose a program</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {programs.isPending && <p className="text-body-default text-fg-muted">Loading programs…</p>}
        {programs.isError && (
          <p role="alert" className="text-body-default text-crit">
            {loadErrorText(programs.error, 'program list')}
          </p>
        )}
        {programs.data !== undefined && items.length === 0 && (
          <p className="text-body-default text-fg-muted">No active program to run against.</p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={programId === ''} className={BUTTON_PRIMARY}>
            Next
          </button>
        </div>
      </form>
    </Modal>
  );
}

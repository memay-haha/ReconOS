'use client';

import { type ReactElement, useState } from 'react';

import { RunScanDialog, type RunScanRequest } from '@/components/run-scan-dialog';
import { useCreateJob } from '@/lib/jobs';
import { useToolModules } from '@/lib/tool-modules';

import { PRIMARY_BUTTON } from './asset-ui';

export interface ScanAsset {
  /** The text the job targets: a domain name, an IP address or a URL. */
  readonly target: string;
  readonly programId: string;
}

/** A job belongs to one program, so several assets go into one job only when they share
 * it: docs/architecture/business-flow.md. Scope is the backend's to check, not this. */
export function singleProgram(assets: readonly ScanAsset[]): string | null {
  const first = assets[0];
  if (first === undefined) return null;
  return assets.every((a) => a.programId === first.programId) ? first.programId : null;
}

export function RunScanButton({
  assets,
  programName,
  label = 'Run Scan',
}: {
  assets: readonly ScanAsset[];
  programName: (programId: string) => string;
  label?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const toolModules = useToolModules();
  const createJob = useCreateJob();
  const programId = singleProgram(assets);
  const mixed = assets.length > 0 && programId === null;

  const submit = ({ toolModuleId, target }: RunScanRequest) => {
    if (programId === null) return;
    createJob.mutate(
      { program_id: programId, tool_module_id: toolModuleId, target },
      {
        onSuccess: () => {
          setOpen(false);
          setCreated(true);
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        disabled={programId === null || toolModules.data === undefined}
        aria-describedby={mixed ? 'run-scan-mixed' : undefined}
        onClick={() => {
          createJob.reset();
          setCreated(false);
          setOpen(true);
        }}
        className={PRIMARY_BUTTON}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-icon">
          play_arrow
        </span>
        <span>{label}</span>
      </button>
      {mixed && (
        <span id="run-scan-mixed" className="text-caption text-warn">
          Select assets from one program to run a scan.
        </span>
      )}
      {created && (
        <span role="status" className="text-caption text-good">
          Job created.
        </span>
      )}
      {programId !== null && (
        <RunScanDialog
          open={open}
          programName={programName(programId)}
          targets={assets.map((a) => a.target)}
          editableTargets={false}
          toolModules={toolModules.data?.items ?? []}
          pending={createJob.isPending}
          error={createJob.error}
          onSubmit={submit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

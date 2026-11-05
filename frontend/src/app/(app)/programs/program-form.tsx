'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { type Program, type ProgramBody, useCreateProgram, useUpdateProgram } from '@/lib/programs';

import { Dialog } from './dialog';
import { errorText } from './error-text';
import { FIELD, LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from './ui';

const BOUNTY_TYPE_LABEL: Readonly<Record<Program['bounty_type'], string>> = {
  bounty: 'Bug bounty',
  vdp: 'VDP',
};

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Create or edit a program: name, platform, platform URL, bounty type, description. */
export function ProgramForm({
  program,
  onDone,
}: {
  /** Absent: create a new program. */
  program?: Program;
  onDone: () => void;
}): ReactElement {
  const create = useCreateProgram();
  const update = useUpdateProgram(program?.id ?? '');
  const mutation = program === undefined ? create : update;
  const [name, setName] = useState(program?.name ?? '');
  const [platform, setPlatform] = useState(program?.platform ?? '');
  const [platformUrl, setPlatformUrl] = useState(program?.platform_url ?? '');
  const [bountyType, setBountyType] = useState<Program['bounty_type']>(
    program?.bounty_type ?? 'bounty',
  );
  const [description, setDescription] = useState(program?.description ?? '');
  const errors = fieldErrorsOf(mutation.error);
  const formError =
    mutation.error !== null && Object.keys(errors).length === 0
      ? errorText(mutation.error, 'Could not save the program. Try again later.')
      : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body: ProgramBody = {
      name: name.trim(),
      platform: blankToNull(platform),
      platform_url: blankToNull(platformUrl),
      bounty_type: bountyType,
      description: blankToNull(description),
    };
    mutation.mutate(body, { onSuccess: onDone });
  };

  return (
    <Dialog
      title={program === undefined ? 'New Program' : 'Edit Program'}
      onClose={onDone}
      busy={mutation.isPending}
    >
      <form
        onSubmit={submit}
        className="mt-gutter flex flex-col gap-gutter bg-surface-container"
        noValidate
      >
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="program-name" className={LABEL}>
            Name
          </label>
          <input
            id="program-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
          <FieldError errors={errors} field="name" />
        </div>
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="program-platform" className={LABEL}>
            Platform
          </label>
          <input
            id="program-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="HackerOne, Bugcrowd, Intigriti or self-hosted"
            className={FIELD}
          />
          <FieldError errors={errors} field="platform" />
        </div>
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="program-platform-url" className={LABEL}>
            Platform URL
          </label>
          <input
            id="program-platform-url"
            type="url"
            value={platformUrl}
            onChange={(e) => setPlatformUrl(e.target.value)}
            className={FIELD}
          />
          <FieldError errors={errors} field="platform_url" />
        </div>
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="program-bounty-type" className={LABEL}>
            Type
          </label>
          <select
            id="program-bounty-type"
            value={bountyType}
            onChange={(e) => setBountyType(e.target.value as Program['bounty_type'])}
            className={FIELD}
          >
            {(['bounty', 'vdp'] as const).map((value) => (
              <option key={value} value={value}>
                {BOUNTY_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
          <FieldError errors={errors} field="bounty_type" />
        </div>
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="program-description" className={LABEL}>
            Description
          </label>
          <textarea
            id="program-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-sm border border-border bg-surface-2 px-space-md py-space-sm text-body-default text-fg focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <FieldError errors={errors} field="description" />
        </div>
        {formError !== null && (
          <p role="alert" className="text-body-default text-crit-strong">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onDone}
            disabled={mutation.isPending}
            className={SECONDARY_BUTTON}
          >
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className={PRIMARY_BUTTON}>
            {program === undefined ? 'Create program' : 'Save changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

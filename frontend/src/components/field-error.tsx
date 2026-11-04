import type { ReactElement } from 'react';

import { fieldErrorText } from '@/lib/field-error-text';

export function FieldError({
  errors,
  field,
}: {
  errors: Record<string, string>;
  field: string;
}): ReactElement | null {
  if (!Object.hasOwn(errors, field)) return null;
  const code = errors[field];
  if (code === undefined) return null;
  return (
    <span role="alert" className="text-body-default text-crit">
      {fieldErrorText(code)}
    </span>
  );
}

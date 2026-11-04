'use client';

import type { ReactElement } from 'react';

import { EnginePage } from './engine-page';

/** S16. Superadmin only. */
export default function OsmedeusPage(): ReactElement {
  return (
    <EnginePage
      engineName="osmedeus"
      title="Osmedeus"
      description="REST API connection the runners use, and the variables passed to each Osmedeus run."
      withVariables
    />
  );
}

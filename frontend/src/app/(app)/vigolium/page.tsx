'use client';

import type { ReactElement } from 'react';

import { EnginePage } from '../osmedeus/engine-page';

/** S17. Superadmin only. Connection only: Vigolium takes no engine variables. */
export default function VigoliumPage(): ReactElement {
  return (
    <EnginePage
      engineName="vigolium"
      title="Vigolium"
      description="REST API connection the runners use to start and stop Vigolium scans."
      withVariables={false}
    />
  );
}

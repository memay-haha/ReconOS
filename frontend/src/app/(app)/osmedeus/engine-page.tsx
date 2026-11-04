'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import { useMe } from '@/lib/auth';
import { useEngines } from '@/lib/engines';

import { ALERT_TEXT, STATE_TEXT } from '../system/modal';
import { loadErrorText, NoAccess, PageHeader } from '../system/states';
import { EngineConnection } from './engine-connection';
import { VariablesPanel } from './variables-panel';

const CARD = 'flex flex-col gap-space-md rounded-sm border border-border bg-surface p-space-md';

function SectionTitle({ icon, title }: { icon: string; title: string }): ReactElement {
  return (
    <div className="flex items-center gap-space-sm border-b border-border pb-space-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
        {icon}
      </span>
      <h2 className="text-panel-title text-fg">{title}</h2>
    </div>
  );
}

/** S16 and S17 are one mechanism: the connection of one row of `engine`, found by name.
 * `withVariables` is false for Vigolium, which takes no engine variables (tech-debt item 8). */
export function EnginePage({
  engineName,
  title,
  description,
  withVariables,
}: {
  engineName: string;
  title: string;
  description: string;
  withVariables: boolean;
}): ReactElement {
  const me = useMe();
  const isSuperadmin = me.data?.role === 'superadmin';
  const engines = useEngines(isSuperadmin);
  const engine = engines.data?.items.find((e) => e.name === engineName);

  if (me.data !== undefined && !isSuperadmin) return <NoAccess what={title} />;

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <PageHeader
        section="System"
        current={title}
        title={`${title} Settings`}
        description={description}
      >
        <Link
          href="/modules"
          className="inline-flex h-9 items-center gap-space-sm self-start rounded-sm border border-border-strong bg-surface px-space-md text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            extension
          </span>
          Tool modules
        </Link>
      </PageHeader>

      {(me.isPending || engines.isPending) && <p className={STATE_TEXT}>Loading the engine…</p>}
      {engines.isError && (
        <p role="alert" className={ALERT_TEXT}>
          {loadErrorText(engines.error, 'engine list')}
        </p>
      )}
      {engines.data !== undefined && engine === undefined && (
        <p role="alert" className={ALERT_TEXT}>
          The {title} engine does not exist.
        </p>
      )}
      {engine !== undefined && (
        <>
          <section aria-label="Engine connection" className={CARD}>
            <SectionTitle icon="settings_ethernet" title="Engine Connection" />
            <EngineConnection key={engine.id} engine={engine} />
          </section>
          {withVariables && (
            <section aria-label="Engine variables" className={CARD}>
              <SectionTitle icon="key" title="Engine Variables" />
              <VariablesPanel engineId={engine.id} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

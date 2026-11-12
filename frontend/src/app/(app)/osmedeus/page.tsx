'use client';

import { type ReactElement, useState } from 'react';

import { type ScanPreset, SCAN_PRESETS, useEngineWorkflows } from '@/lib/engines';
import { useSchedules } from '@/lib/schedules';

import { ALERT_TEXT, STATE_TEXT } from '../system/modal';
import { loadErrorText, NoAccess } from '../system/states';
import { EngineConnection, engineFormId } from './engine-connection';
import {
  EngineHeader,
  HEADER_BUTTON,
  HEADER_PRIMARY,
  HealthChip,
  SectionTabs,
  useEngineScreen,
  useEngineTest,
} from './engine-shared';
import {
  EventStream,
  ResourceOverhead,
  ScanTactics,
  StatusStrip,
  WorkflowsPanel,
} from './osmedeus-panels';
import { ENGINE_PANEL, PanelTitle } from './panel-title';
import { SchedulesPanel } from './schedules-panel';
import { VariablesPanel } from './variables-panel';

const DESCRIPTION =
  'Scan engine configuration, REST API gateway connection, scan intensity and workflow index.';

function presetOf(settings: Readonly<Record<string, unknown>>): ScanPreset {
  const value = settings.scan_preset;
  return SCAN_PRESETS.find((p) => p === value) ?? 'balanced';
}

/** S16. Superadmin only. D3-B: connection, variables, Scan Tactics and the workflow index
 * read through the engine's REST. Schedules lists ReconOS schedules on this engine (P4).
 * Environments, Database & Redis and Cloud & LLM are out (G1, tech-debt 8). */
export default function OsmedeusPage(): ReactElement {
  const { me, isSuperadmin, engines, engine, component } = useEngineScreen('osmedeus');
  const test = useEngineTest(engine);
  const workflows = useEngineWorkflows(engine?.id ?? null);
  // First page only, for the tab count; the panel shares its cache.
  const schedules = useSchedules(engine === undefined ? null : { engineId: engine.id });
  const [preset, setPreset] = useState<ScanPreset | null>(null);

  if (me.data !== undefined && !isSuperadmin) return <NoAccess what="Osmedeus" />;
  const activePreset = preset ?? (engine === undefined ? 'balanced' : presetOf(engine.settings));

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <EngineHeader name="Osmedeus" version={engine?.version ?? null} description={DESCRIPTION}>
        {test.button}
        <button
          type="button"
          onClick={() => void workflows.refetch()}
          disabled={engine === undefined || workflows.isFetching}
          className={HEADER_BUTTON}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-fg-muted">
            sync
          </span>
          Refresh Index
        </button>
        <button
          type="submit"
          form={engine === undefined ? undefined : engineFormId(engine)}
          disabled={engine === undefined}
          className={HEADER_PRIMARY}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            save
          </span>
          Save Changes
        </button>
      </EngineHeader>
      {test.outcome}

      {(me.isPending || engines.isPending) && <p className={STATE_TEXT}>Loading the engine…</p>}
      {engines.isError && (
        <p role="alert" className={ALERT_TEXT}>
          {loadErrorText(engines.error, 'engine list')}
        </p>
      )}
      {engines.data !== undefined && engine === undefined && (
        <p role="alert" className={ALERT_TEXT}>
          The Osmedeus engine does not exist.
        </p>
      )}
      {engine !== undefined && (
        <>
          <StatusStrip engine={engine} component={component} />
          <SectionTabs
            tabs={[
              { id: 'connection', label: 'Connection', icon: 'code' },
              { id: 'variables', label: 'Engine Variables', icon: 'data_object' },
              { id: 'scan-tactics', label: 'Scan Tactics', icon: 'speed' },
              {
                id: 'workflows',
                label: 'Workflows',
                icon: 'account_tree',
                count: workflows.data?.total ?? null,
              },
              {
                id: 'schedules',
                label: 'Schedules',
                icon: 'event_repeat',
                count: schedules.data?.total ?? null,
              },
            ]}
          />
          <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
            <div className="flex flex-col gap-space-lg xl:col-span-5">
              <section
                id="connection"
                aria-label="Engine connection"
                className={`${ENGINE_PANEL} scroll-mt-20`}
              >
                <PanelTitle
                  bar="primary"
                  title="Engine Connection"
                  subtitle="REST API the runners call when they claim a job."
                >
                  <HealthChip component={component} />
                </PanelTitle>
                <EngineConnection
                  key={engine.id}
                  engine={engine}
                  extra={() => ({
                    settings: { ...engine.settings, scan_preset: activePreset },
                  })}
                  onSaved={() => setPreset(null)}
                >
                  <EventStream engine="osmedeus" />
                </EngineConnection>
              </section>
              <ResourceOverhead engine={engine} />
            </div>
            <div className="flex flex-col gap-space-lg xl:col-span-7">
              <section
                id="variables"
                aria-label="Engine variables"
                className={`${ENGINE_PANEL} scroll-mt-20`}
              >
                <VariablesPanel engineId={engine.id} />
              </section>
              <ScanTactics value={activePreset} onChange={setPreset} />
            </div>
          </div>
          <WorkflowsPanel engine={engine} />
          <SchedulesPanel engine={engine} />
        </>
      )}
    </div>
  );
}

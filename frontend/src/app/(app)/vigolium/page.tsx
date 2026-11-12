'use client';

import { type ReactElement, useRef, useState } from 'react';

import { useEngineModules, useValidateEngine } from '@/lib/engines';

import { EngineConnection, engineFormId } from '../osmedeus/engine-connection';
import {
  EngineHeader,
  HEADER_BUTTON,
  HEADER_PRIMARY,
  HealthChip,
  SectionTabs,
  useEngineScreen,
  useEngineTest,
} from '../osmedeus/engine-shared';
import { EventStream } from '../osmedeus/osmedeus-panels';
import { ENGINE_PANEL, PanelTitle } from '../osmedeus/panel-title';
import { ALERT_TEXT, STATE_TEXT } from '../system/modal';
import { loadErrorText, NoAccess } from '../system/states';
import {
  type LlmDraft,
  LlmPanel,
  llmDraftOf,
  ModulesPanel,
  ValidationBanner,
} from './vigolium-panels';

const DESCRIPTION =
  'Vulnerability scanner connection, LLM verification model and native module suite.';

/** S17. Superadmin only. D3-B: connection, LLM model and native modules read through the
 * engine's REST. Ingest proxy, MITM, CA, Burp/Caido bridge, Scope Defaults, Hardening flags
 * and Projects are out (G5, tech-debt 8). */
export default function VigoliumPage(): ReactElement {
  const { me, isSuperadmin, engines, engine, component } = useEngineScreen('vigolium');
  const test = useEngineTest(engine);
  const validate = useValidateEngine();
  const modules = useEngineModules(engine?.id ?? null);
  const [draft, setDraft] = useState<LlmDraft | null>(null);
  // The LLM key is write-only: read from the field at save, then cleared.
  const llmKeyRef = useRef<HTMLInputElement>(null);

  if (me.data !== undefined && !isSuperadmin) return <NoAccess what="Vigolium" />;
  const llm = draft ?? (engine === undefined ? null : llmDraftOf(engine));

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <EngineHeader name="Vigolium" version={engine?.version ?? null} description={DESCRIPTION}>
        <button
          type="button"
          onClick={() => {
            if (engine !== undefined) validate.mutate(engine.id);
          }}
          disabled={engine === undefined || validate.isPending}
          className={HEADER_BUTTON}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-fg-muted">
            rule
          </span>
          {validate.isPending ? 'Validating…' : 'Validate Config'}
        </button>
        {test.button}
        <button
          type="submit"
          form={engine === undefined ? undefined : engineFormId(engine)}
          disabled={engine === undefined}
          className={HEADER_PRIMARY}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            save
          </span>
          Save Configuration
        </button>
      </EngineHeader>
      {test.outcome}
      {validate.data !== undefined && <ValidationBanner result={validate.data} />}
      {validate.isError && (
        <p role="alert" className="text-body-default text-crit">
          Could not validate the configuration. The engine did not answer.
        </p>
      )}

      {(me.isPending || engines.isPending) && <p className={STATE_TEXT}>Loading the engine…</p>}
      {engines.isError && (
        <p role="alert" className={ALERT_TEXT}>
          {loadErrorText(engines.error, 'engine list')}
        </p>
      )}
      {engines.data !== undefined && engine === undefined && (
        <p role="alert" className={ALERT_TEXT}>
          The Vigolium engine does not exist.
        </p>
      )}
      {engine !== undefined && llm !== null && (
        <>
          <SectionTabs
            tabs={[
              { id: 'connection', label: 'Connection & Server', icon: 'tune' },
              { id: 'scan-engine', label: 'Scan Engine & AI', icon: 'psychology' },
              {
                id: 'native-modules',
                label: 'Native Modules',
                icon: 'widgets',
                count: modules.data?.total ?? null,
              },
            ]}
          />
          <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
            <section
              id="connection"
              aria-label="Engine connection"
              className={`${ENGINE_PANEL} scroll-mt-20 xl:col-span-7`}
            >
              <PanelTitle
                bar="primary"
                title="Engine Connection"
                subtitle="REST control endpoint the runners call when they claim a job."
              >
                <HealthChip component={component} />
              </PanelTitle>
              <EngineConnection
                key={engine.id}
                engine={engine}
                extra={() => {
                  const key = llmKeyRef.current?.value ?? '';
                  return {
                    settings: {
                      ...engine.settings,
                      llm_provider: llm.provider,
                      llm_model: llm.model,
                      llm_base_url: llm.baseUrl,
                    },
                    ...(key === '' ? {} : { llm_api_key: key }),
                  };
                }}
                onSaved={() => {
                  if (llmKeyRef.current !== null) llmKeyRef.current.value = '';
                  setDraft(null);
                }}
              >
                <EventStream engine="vigolium" />
              </EngineConnection>
            </section>
            <div className="flex flex-col gap-space-lg xl:col-span-5">
              <LlmPanel engine={engine} draft={llm} onChange={setDraft} keyRef={llmKeyRef} />
              <ModulesPanel engine={engine} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

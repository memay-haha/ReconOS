'use client';

import { type ReactElement, type RefObject, useState } from 'react';

import {
  type Engine,
  type EngineCheckResult,
  type EngineModule,
  useEngineModules,
  usePatchEngineModules,
  useVerifyModel,
} from '@/lib/engines';

import { LABEL_CAPS } from '../osmedeus/engine-connection';
import { ENGINE_PANEL, PanelTitle } from '../osmedeus/panel-title';
import { loadErrorText } from '../system/states';

const COUNT = new Intl.NumberFormat('en-US');
const PLAIN =
  'h-9 w-full rounded-sm bg-surface-2 px-3 font-body-code text-body-code normal-case tracking-normal text-fg placeholder:text-fg-faint focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';
// M41: "Top Active Modules" are the first enabled native modules by name.
const TOP_COUNT = 5;

/** The mockup's provider choices. `llm_provider` is free text in docs/data/schema.md, so a
 * stored value outside this list is still offered. */
const PROVIDERS = ['openai-compatible', 'anthropic-native', 'ollama-local', 'azure-openai-gateway'];

export interface LlmDraft {
  provider: string;
  model: string;
  baseUrl: string;
}

export function llmDraftOf(engine: Engine): LlmDraft {
  const s = engine.settings;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    provider: text(s.llm_provider) || 'openai-compatible',
    model: text(s.llm_model),
    baseUrl: text(s.llm_base_url),
  };
}

/** "Config Valid · 0 Critical Issues · 1 Advisory", after Validate Config. */
export function ValidationBanner({ result }: { result: EngineCheckResult }): ReactElement {
  const critical = result.issues.filter((i) => i.level === 'critical');
  const advisory = result.issues.filter((i) => i.level === 'advisory');
  return (
    <div
      role="status"
      className="flex flex-col gap-space-sm rounded-sm border border-border bg-surface p-space-md"
    >
      <div className="flex flex-wrap items-center gap-space-sm font-body-code text-body-code">
        <span
          aria-hidden="true"
          className={`material-symbols-outlined rounded-sm border p-1 text-[20px] ${result.ok ? 'border-good-bd bg-good-soft text-good' : 'border-crit-bd bg-crit-soft text-crit'}`}
        >
          {result.ok ? 'verified' : 'gpp_bad'}
        </span>
        <span className="text-fg">{result.ok ? 'Config Valid' : 'Config Invalid'}</span>
        <span aria-hidden="true" className="text-fg-faint">
          ·
        </span>
        <span className={critical.length === 0 ? 'text-good' : 'text-crit'}>
          {COUNT.format(critical.length)} Critical Issues
        </span>
        <span aria-hidden="true" className="text-fg-faint">
          ·
        </span>
        <span className={advisory.length === 0 ? 'text-fg-muted' : 'text-warn'}>
          {COUNT.format(advisory.length)} Advisories
        </span>
      </div>
      {result.issues.length > 0 && (
        <ul className="flex flex-col gap-1 font-body-code text-[12px]">
          {result.issues.map((issue, i) => (
            <li key={i} className={issue.level === 'critical' ? 'text-crit' : 'text-warn'}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Provider, model and base URL go to `engine.settings`; the API key is write-only and
 * encrypted at rest (G7). All of it is saved with Save Configuration. */
export function LlmPanel({
  engine,
  draft,
  onChange,
  keyRef,
}: {
  engine: Engine;
  draft: LlmDraft;
  onChange: (next: LlmDraft) => void;
  keyRef: RefObject<HTMLInputElement | null>;
}): ReactElement {
  const verify = useVerifyModel();
  const providers = PROVIDERS.includes(draft.provider) ? PROVIDERS : [draft.provider, ...PROVIDERS];
  return (
    <section id="scan-engine" aria-label="LLM model" className={`${ENGINE_PANEL} scroll-mt-20`}>
      <PanelTitle
        bar="primary"
        title="LLM Verification Model"
        subtitle="Model Vigolium calls to verify findings. Saved with Save Configuration."
      />
      <div className={LABEL_CAPS}>
        <label htmlFor="vigolium-llm-provider">LLM Provider Format</label>
        <select
          id="vigolium-llm-provider"
          value={draft.provider}
          onChange={(e) => onChange({ ...draft, provider: e.target.value })}
          className={PLAIN}
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className={LABEL_CAPS}>
        <label htmlFor="vigolium-llm-model">Target Model Identifier</label>
        <input
          id="vigolium-llm-model"
          value={draft.model}
          onChange={(e) => onChange({ ...draft, model: e.target.value })}
          className={PLAIN}
        />
      </div>
      <div className={LABEL_CAPS}>
        <label htmlFor="vigolium-llm-base-url">Inference Base URL</label>
        <input
          id="vigolium-llm-base-url"
          type="url"
          value={draft.baseUrl}
          onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
          className={PLAIN}
        />
      </div>
      <div className={LABEL_CAPS}>
        <label htmlFor="vigolium-llm-key">LLM API Key</label>
        {/* Uncontrolled and write-only: the key never sits in the DOM or a response (G7). */}
        <input
          id="vigolium-llm-key"
          ref={keyRef}
          type="password"
          autoComplete="off"
          placeholder={
            engine.has_llm_api_key === true
              ? 'A key is stored. Leave blank to keep it'
              : 'No key stored'
          }
          className={PLAIN}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <span className="flex items-center gap-1.5 font-body-code text-[11px] text-fg-muted">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${engine.has_llm_api_key === true ? 'bg-good' : 'bg-fg-faint'}`}
          />
          {engine.has_llm_api_key === true ? 'Key stored' : 'No key'}
        </span>
        <button
          type="button"
          onClick={() => verify.mutate(engine.id)}
          disabled={verify.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-3 font-body-code text-[12px] font-semibold text-primary hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            psychology
          </span>
          {verify.isPending ? 'Verifying…' : 'Verify Model'}
        </button>
      </div>
      {verify.data !== undefined && (
        <p
          role="status"
          className={`text-body-default ${verify.data.ok ? 'text-good' : 'text-crit'}`}
        >
          {verify.data.ok
            ? 'The model answered.'
            : (verify.data.issues[0]?.message ?? 'The model did not answer.')}
        </p>
      )}
      {verify.isError && (
        <p role="alert" className="text-body-default text-crit">
          Could not verify the model. Check the saved provider, model and key.
        </p>
      )}
    </section>
  );
}

function Toggle({
  module,
  busy,
  onToggle,
}: {
  module: EngineModule;
  busy: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={module.is_enabled}
      aria-label={`${module.name} enabled`}
      onClick={onToggle}
      disabled={busy}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${module.is_enabled ? 'bg-primary-container' : 'bg-surface-3'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-fg transition-all ${module.is_enabled ? 'left-3.5' : 'left-0.5'}`}
      />
    </button>
  );
}

/** Native modules read live from Vigolium (D3-B). Counts, then the first enabled modules by
 * name (M41); Manage All opens the whole list. */
export function ModulesPanel({ engine }: { engine: Engine }): ReactElement {
  const modules = useEngineModules(engine.id);
  const patch = usePatchEngineModules();
  const [all, setAll] = useState(false);
  const items = modules.data?.items ?? [];
  const active = items.filter((m) => m.kind === 'active').length;
  const passive = items.filter((m) => m.kind === 'passive').length;
  const byName = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const shown = all ? byName : byName.filter((m) => m.is_enabled).slice(0, TOP_COUNT);
  const toggle = (m: EngineModule) =>
    patch.mutate({ engineId: engine.id, modules: [{ name: m.name, is_enabled: !m.is_enabled }] });

  return (
    <section
      id="native-modules"
      aria-label="Native modules"
      className={`${ENGINE_PANEL} scroll-mt-20`}
    >
      <PanelTitle
        bar="primary"
        title="Native Modules Suite"
        subtitle="Scanning modules installed on Vigolium, read live from its REST API."
      >
        <button
          type="button"
          aria-pressed={all}
          onClick={() => setAll((v) => !v)}
          className="font-body-code text-[12px] text-primary hover:underline"
        >
          {all ? 'Show Top Active' : 'Manage All'}
        </button>
      </PanelTitle>
      {modules.isPending && <p className="text-body-default text-fg-muted">Loading modules…</p>}
      {modules.isError && (
        <p role="alert" className="text-body-default text-crit">
          {loadErrorText(modules.error, 'module list')}
        </p>
      )}
      {modules.data !== undefined && (
        <>
          <div className="grid grid-cols-3 gap-space-sm">
            <div className="rounded-sm border border-border bg-surface-2 p-space-sm">
              <p className="font-label-caps text-[10px] uppercase text-fg-faint">Total Modules</p>
              <p className="font-stat-lg text-stat-lg text-fg">{COUNT.format(items.length)}</p>
            </div>
            <div className="rounded-sm border border-border bg-surface-2 p-space-sm">
              <p className="font-label-caps text-[10px] uppercase text-good">Active</p>
              <p className="font-stat-lg text-stat-lg text-good">{COUNT.format(active)}</p>
            </div>
            <div className="rounded-sm border border-border bg-surface-2 p-space-sm">
              <p className="font-label-caps text-[10px] uppercase text-info">Passive</p>
              <p className="font-stat-lg text-stat-lg text-info">{COUNT.format(passive)}</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-sm border border-border">
            <div className="flex items-center justify-between bg-surface-2 px-space-md py-1.5 font-label-caps text-label-caps uppercase text-fg-muted">
              <span>{all ? 'All Modules' : 'Top Active Modules'}</span>
              <span>State</span>
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {shown.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center justify-between gap-space-sm px-space-md py-2 font-body-code text-body-code text-fg"
                >
                  <span className="truncate" title={m.description ?? undefined}>
                    {m.name}
                  </span>
                  <Toggle module={m} busy={patch.isPending} onToggle={() => toggle(m)} />
                </li>
              ))}
              {shown.length === 0 && (
                <li className="px-space-md py-2 text-body-default text-fg-muted">
                  No enabled modules.
                </li>
              )}
            </ul>
          </div>
          {patch.isError && (
            <p role="alert" className="text-body-default text-crit">
              Could not change the module. Try again later.
            </p>
          )}
        </>
      )}
    </section>
  );
}

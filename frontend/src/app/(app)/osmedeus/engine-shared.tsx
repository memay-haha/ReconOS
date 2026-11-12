'use client';

import type { ReactElement, ReactNode } from 'react';

import { ApiError } from '@/lib/api-client';
import { useMe } from '@/lib/auth';
import { type Engine, useEngines, useTestEngine } from '@/lib/engines';
import { type HealthComponent, useSystemHealth } from '@/lib/system';

const COUNT = new Intl.NumberFormat('en-US');

/** The engine row, its health component and the Superadmin gate shared by S16 and S17. */
export function useEngineScreen(engineName: string) {
  const me = useMe();
  const isSuperadmin = me.data?.role === 'superadmin';
  const engines = useEngines(isSuperadmin);
  const health = useSystemHealth(isSuperadmin);
  const engine = engines.data?.items.find((e) => e.name === engineName);
  const component = health.data?.components.find((c) => c.name === engineName);
  return { me, isSuperadmin, engines, engine, component };
}

export const HEADER_BUTTON =
  'inline-flex h-9 items-center gap-2 rounded-sm border border-border bg-surface-2 px-3.5 text-body-default text-fg transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export const HEADER_PRIMARY =
  'inline-flex h-9 items-center gap-2 rounded-sm bg-primary-container px-3.5 font-semibold text-body-default text-accent-ink shadow-sm transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

export function EngineHeader({
  name,
  version,
  description,
  children,
}: {
  name: string;
  version: string | null;
  description: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-end">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 font-caption text-caption text-fg-faint">
          <span>ReconOS</span>
          <span aria-hidden="true">/</span>
          <span>System</span>
          <span aria-hidden="true">/</span>
          <span className="font-body-code text-primary">{name} Engine</span>
        </div>
        <h1 className="flex items-center gap-space-sm font-headline-lg text-headline-lg tracking-tight text-fg">
          {name} Settings
          {version !== null && (
            <span className="rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-body-code text-caption font-normal text-fg-muted">
              {version}
            </span>
          )}
        </h1>
        <p className="max-w-3xl font-body-default text-body-default text-fg-muted">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-space-sm">{children}</div>
    </div>
  );
}

const CHIP_TONE = {
  ok: 'border-good-bd bg-good-soft text-good',
  degraded: 'border-warn-bd bg-warn-soft text-warn',
  down: 'border-crit-bd bg-crit-soft text-crit',
  unknown: 'border-border bg-surface-2 text-fg-muted',
} as const;
const DOT_TONE = {
  ok: 'bg-good',
  degraded: 'bg-warn',
  down: 'bg-crit',
  unknown: 'bg-fg-faint',
} as const;
const STATUS_WORD = { ok: 'Healthy', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' };

/** "Healthy · 28ms" from the engine's health component (S16, S17 panel chip). */
export function HealthChip({
  component,
}: {
  component: HealthComponent | undefined;
}): ReactElement {
  const status = component?.status ?? 'unknown';
  const latency = component?.latency_ms == null ? '' : ` · ${COUNT.format(component.latency_ms)}ms`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-body-code text-[11px] ${CHIP_TONE[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[status]}`} />
      {STATUS_WORD[status]}
      {latency}
    </span>
  );
}

/** In-page tab bar: every panel stays on screen, as the mockups draw them; a tab jumps to it. */
export function SectionTabs({
  tabs,
}: {
  tabs: readonly { id: string; label: string; icon: string; count?: number | null }[];
}): ReactElement {
  return (
    <nav
      aria-label="Engine settings sections"
      className="flex items-center gap-1 overflow-x-auto rounded-sm border border-border bg-surface-container-lowest p-1"
    >
      {tabs.map((tab, i) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 font-label-caps text-[11px] transition-colors ${i === 0 ? 'bg-surface-3 text-primary' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
            {tab.icon}
          </span>
          {tab.label}
          {tab.count != null && (
            <span className="rounded-sm bg-surface-2 px-1.5 font-body-code text-[10px] text-fg-faint">
              {COUNT.format(tab.count)}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}

function testErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'You do not have permission to test this engine.';
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'The engine did not answer. Check the base URL and the API key.';
}

/** The header's Test Connection button and its outcome line. */
export function useEngineTest(engine: Engine | undefined) {
  const test = useTestEngine();
  const version = test.data?.version;
  const button = (
    <button
      type="button"
      onClick={() => {
        if (engine !== undefined) test.mutate(engine.id);
      }}
      disabled={engine === undefined || test.isPending}
      className={HEADER_BUTTON}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${test.isError ? 'bg-crit' : 'bg-good'}`}
      />
      {test.isPending ? 'Testing…' : 'Test Connection'}
    </button>
  );
  const outcome = test.isSuccess ? (
    <p role="status" className="text-body-default text-good">
      The engine answered{typeof version === 'string' && version !== '' ? `: ${version}` : '.'}
    </p>
  ) : test.isError ? (
    <p role="alert" className="text-body-default text-crit">
      {testErrorText(test.error)}
    </p>
  ) : null;
  return { button, outcome };
}

/** "18d 04h" from `uptime_seconds` (M35). */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${pad(hours)}h` : `${hours}h ${pad(minutes)}m`;
}

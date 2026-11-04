import type { ReactElement } from 'react';

import { FieldError } from '@/components/field-error';
import { contrastRatio } from '@/styles/contrast';
import { PAIRS } from '@/styles/contrast-pairs';
import { TOKEN_ROWS } from '@/styles/token-table.generated';
import type { TokenRow } from '@/styles/token-table.generated';
import { PaginationDemo } from './pagination-demo';

type Row = TokenRow;
type Theme = 'dark' | 'light';

// The grey text ramp: each step on the surfaces the contrast test holds it to.
const RAMP_TOKENS = ['fg', 'fg-muted', 'fg-faint', 'fg-dim', 'fg-dimmest'] as const;
const RAMP: ReadonlyArray<readonly [string, readonly string[]]> = RAMP_TOKENS.map((token) => [
  token,
  PAIRS.filter(([fg]) => fg === `color-${token}`).map(([, bg]) => bg.replace('color-', '')),
]);

/** A blank light cell means the token does not change with the theme. */
function valueIn(row: Row, theme: Theme): string {
  const light = row.values.light;
  return theme === 'light' && light !== undefined && light !== '' ? light : row.values.dark;
}

/** Ratio text, or a dash for values that are not opaque hex colours (for example the focus ring). */
function ratio(foreground: Row, background: Row, theme: Theme): string {
  try {
    return `${contrastRatio(valueIn(foreground, theme), valueIn(background, theme)).toFixed(2)}:1`;
  } catch {
    return '-';
  }
}

function Swatch({ row, bg }: { row: Row; bg: Row }): ReactElement {
  return (
    <li
      data-testid="swatch"
      data-token={row.name}
      className="flex items-center gap-space-md rounded-md border border-border bg-bg p-space-md"
    >
      <span
        aria-hidden="true"
        className="size-10 shrink-0 rounded-sm border border-border-strong"
        style={{ backgroundColor: `var(--${row.name})` }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-body-code text-body-code break-all text-fg">{row.name}</span>
        <span className="text-caption text-fg-muted">
          {`dark ${ratio(row, bg, 'dark')} · light ${ratio(row, bg, 'light')}`}
        </span>
        <span className="font-body-code text-caption text-fg-muted">
          {`${row.values.dark} / ${valueIn(row, 'light')}`}
        </span>
      </span>
    </li>
  );
}

function RampCell({ token, surface }: { token: Row; surface: Row }): ReactElement {
  return (
    <li
      data-testid={`ramp-${token.name.replace('color-', '')}`}
      className="rounded-md border border-border p-space-md"
      style={{ backgroundColor: `var(--${surface.name})`, color: `var(--${token.name})` }}
    >
      <span className="text-body-default">
        {`${token.name.replace('color-', '')} on ${surface.name.replace('color-', '')}`}
      </span>
      <span className="font-body-code text-caption block">
        {`dark ${ratio(token, surface, 'dark')} · light ${ratio(token, surface, 'light')}`}
      </span>
    </li>
  );
}

// Class strings copied from users/user-form.tsx, the screen that renders them.
const LABEL = 'text-label-caps uppercase text-fg-muted';
const FIELD =
  'h-10 w-full rounded-sm border border-border bg-surface-2 px-space-md text-body-default text-fg ' +
  'focus:outline-none focus:ring-2 focus:ring-ring';
const PRIMARY =
  'h-10 rounded-sm bg-primary px-space-xl text-panel-title text-on-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
const SECONDARY =
  'h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring';

export default async function ComponentsPage(): Promise<ReactElement> {
  // Rows come from the generated module, itself reproduced from the Token Table by a test.
  const table = TOKEN_ROWS;
  const byName = new Map(table.map((row) => [row.name, row]));
  const need = (name: string): Row => {
    const row = byName.get(name);
    if (row === undefined) throw new Error(`design-system.md has no token ${name}`);
    return row;
  };
  const colours = table.filter((row) => row.group === 'Colors');
  const bg = need('color-bg');
  const roles = table
    .filter((row) => /^text-[a-z]+(-[a-z]+)*$/.test(row.name))
    .map((row) => row.name.replace('text-', ''));

  return (
    <div className="flex flex-col gap-space-xl">
      <header>
        <h1 className="font-headline-lg text-headline-lg text-fg">Component Library</h1>
        <p className="text-body-default text-fg-muted">
          Read from the Token Table in the design system. Flip the theme in the top bar to review
          both palettes.
        </p>
      </header>

      <section aria-labelledby="ramp-title" className="flex flex-col gap-space-md">
        <h2 id="ramp-title" className="font-panel-title text-panel-title text-fg">
          Colours
        </h2>
        <div
          role="region"
          aria-label="Grey text ramp"
          className="flex flex-col gap-space-md rounded-md border border-border p-space-lg"
        >
          <p className="text-body-default text-fg-muted">
            Grey text ramp, each step on the surfaces it is used on. Ratios are WCAG 2.1 contrast
            against that surface in each theme.
          </p>
          {RAMP.map(([token, surfaces]) => (
            <ul key={token} className="grid gap-space-sm sm:grid-cols-2 lg:grid-cols-4">
              {surfaces.map((surface) => (
                <RampCell
                  key={surface}
                  token={need(`color-${token}`)}
                  surface={need(`color-${surface}`)}
                />
              ))}
            </ul>
          ))}
        </div>
        <p className="text-body-default text-fg-muted">
          Every colour token. Ratios are against the background of the same theme.
        </p>
        <ul className="grid gap-space-sm sm:grid-cols-2 lg:grid-cols-3">
          {colours.map((row) => (
            <Swatch key={row.name} row={row} bg={bg} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="type-title" className="flex flex-col gap-space-md">
        <h2 id="type-title" className="font-panel-title text-panel-title text-fg">
          Type roles
        </h2>
        <ul className="flex flex-col gap-space-sm">
          {roles.map((role) => (
            <li
              key={role}
              data-testid="type-role"
              data-role={role}
              className="rounded-md border border-border bg-surface p-space-md"
              style={{
                fontFamily: `var(--font-${role})`,
                fontSize: `var(--text-${role})`,
                lineHeight: `var(--text-${role}--line-height)`,
                fontWeight: `var(--text-${role}--font-weight)`,
                letterSpacing: `var(--text-${role}--letter-spacing)`,
              }}
            >
              <span className="text-fg">{role}</span>
              <span className="block text-fg-muted">Scan 10.0.0.1:443 finished in 12 s</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="shared-title" className="flex flex-col gap-space-lg">
        <h2 id="shared-title" className="font-panel-title text-panel-title text-fg">
          Shared components
        </h2>

        <div className="flex flex-wrap gap-space-sm">
          <button type="button" className={PRIMARY}>
            Save
          </button>
          <button type="button" disabled className={PRIMARY}>
            Save (disabled)
          </button>
          <button type="button" className={SECONDARY}>
            Cancel
          </button>
        </div>

        <div className="flex max-w-sm flex-col gap-space-xs">
          <label htmlFor="sample-input" className={LABEL}>
            Username
          </label>
          <input id="sample-input" type="text" className={FIELD} />
          <FieldError errors={{ username: 'missing' }} field="username" />
        </div>

        <div className="rounded-md border border-border bg-surface p-space-lg">
          <p className="text-label-caps text-fg-muted uppercase">Active sessions</p>
          <p className="font-stat-lg text-stat-lg text-fg">1.234</p>
        </div>

        <PaginationDemo />

        <div className="flex flex-col gap-space-sm">
          <p className="text-body-default text-fg-muted">Loading the audit log…</p>
          <p className="text-body-default text-fg-muted">No audit log entries.</p>
          <p
            role="alert"
            className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
          >
            Could not load the audit log.
          </p>
        </div>
      </section>
    </div>
  );
}

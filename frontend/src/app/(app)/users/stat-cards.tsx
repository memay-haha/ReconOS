import type { ReactElement } from 'react';

const COUNT = new Intl.NumberFormat('en-US');

/** `undefined` is still loading. `null` is a figure the backend did not provide
 * (for example a 403): say so rather than show 0. */
type Figure = number | null | undefined;

function Tile({
  label,
  icon,
  tone,
  value,
  unit,
  note,
}: {
  label: string;
  icon: string;
  tone: 'primary' | 'good';
  value: Figure;
  /** Mono word after the figure, as the mockup writes "6 accounts" (M7). */
  unit: { text: string; live: boolean };
  note?: { label: string; text: string } | null;
}): ReactElement {
  const bar = tone === 'primary' ? 'bg-primary' : 'bg-good';
  const ink = tone === 'primary' ? 'text-primary' : 'text-good';
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md"
    >
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${bar}`} />
      <div className="flex items-start justify-between">
        <span className="font-label-caps text-label-caps uppercase text-fg-faint">{label}</span>
        <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${ink}`}>
          {icon}
        </span>
      </div>
      <div className="my-2">
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="font-stat-lg text-stat-lg tracking-tight text-fg">
              {COUNT.format(value)}
            </span>
            {unit.live ? (
              <span className="flex items-center gap-1 font-body-code text-xs text-good">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-good" />
                {unit.text}
              </span>
            ) : (
              <span className="font-body-code text-xs text-fg-faint">{unit.text}</span>
            )}
          </p>
        )}
      </div>
      {note != null && (
        <div className="flex items-center justify-between gap-space-sm font-caption text-caption text-fg-muted">
          <span>{note.label}</span>
          <span className={`font-body-code text-[11px] ${ink}`}>{note.text}</span>
        </div>
      )}
    </div>
  );
}

export function StatCards({
  userTotal,
  sessionTotal,
  roleBreakdown,
}: {
  userTotal: Figure;
  sessionTotal: Figure;
  /** Counted from the rows on screen only, so it is labelled as this page. */
  roleBreakdown: string | null;
}): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
      <Tile
        label="Total accounts"
        icon="groups"
        tone="primary"
        value={userTotal}
        unit={{ text: userTotal === 1 ? 'account' : 'accounts', live: false }}
        note={roleBreakdown === null ? null : { label: 'On this page:', text: roleBreakdown }}
      />
      <Tile
        label="Active sessions"
        icon="podcasts"
        tone="good"
        value={sessionTotal}
        unit={{ text: 'live', live: true }}
        note={{ label: 'Counted over:', text: 'All accounts' }}
      />
    </div>
  );
}

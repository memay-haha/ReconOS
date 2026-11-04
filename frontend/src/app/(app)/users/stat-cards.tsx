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
  note,
}: {
  label: string;
  icon: string;
  tone: 'primary' | 'good';
  value: Figure;
  note?: { label: string; text: string } | null;
}): ReactElement {
  const bar = tone === 'primary' ? 'bg-primary' : 'bg-good';
  const ink = tone === 'primary' ? 'text-primary' : 'text-good';
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md"
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 ${bar}`} />
      <div className="flex items-start justify-between">
        <span className="text-label-caps uppercase text-fg-faint">{label}</span>
        <span aria-hidden="true" className={`material-symbols-outlined text-icon ${ink}`}>
          {icon}
        </span>
      </div>
      <div className="my-space-sm">
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className="text-stat-lg text-fg">{COUNT.format(value)}</p>
        )}
      </div>
      {note != null && (
        <div className="flex items-center justify-between gap-space-sm text-caption text-fg-muted">
          <span>{note.label}</span>
          <span className={`text-body-code ${ink}`}>{note.text}</span>
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
        note={roleBreakdown === null ? null : { label: 'On this page:', text: roleBreakdown }}
      />
      <Tile label="Active sessions" icon="podcasts" tone="good" value={sessionTotal} />
    </div>
  );
}

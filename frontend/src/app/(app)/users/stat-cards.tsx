import type { ReactElement } from 'react';

const COUNT = new Intl.NumberFormat('en-US');

/** A null total means the backend did not provide it (for example a 403): say so rather than show 0. */
export function StatCards({
  userTotal,
  sessionTotal,
}: {
  userTotal: number | null;
  sessionTotal: number | null;
}): ReactElement {
  const cards = [
    { label: 'Total accounts', value: userTotal },
    { label: 'Active sessions', value: sessionTotal },
  ];
  return (
    <div className="grid gap-gutter sm:grid-cols-2">
      {cards.map((card) => (
        <div key={card.label} className="rounded-sm border border-border bg-surface p-space-lg">
          <p className="text-body-default text-fg-muted">{card.label}</p>
          {card.value === null ? (
            <p className="font-body-default text-body-default text-fg-muted">Unavailable</p>
          ) : (
            <p className="font-stat-lg text-stat-lg text-fg">{COUNT.format(card.value)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

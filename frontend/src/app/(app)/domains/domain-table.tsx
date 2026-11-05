'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import type { DomainRow } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';

import { DnsBadge, FindingChips } from './asset-bits';
import { CELL, COUNT, HEAD, HEAD_ROW } from './asset-ui';

/** S04 columns, in mockup order. "Last scan" and "Discovered" are the two sightings the
 * schema records; "Ports" counts services: decision log, part C. */
export const DOMAIN_COLUMNS = [
  'Domain',
  'Program',
  'DNS',
  'IPs',
  'URLs',
  'Services',
  'Findings',
  'Last seen',
  'First seen',
] as const;

export function DomainTable({
  rows,
  selected,
  programName,
  onToggle,
  onToggleAll,
}: {
  rows: readonly DomainRow[];
  selected: ReadonlySet<string>;
  programName: (programId: string) => string;
  onToggle: (row: DomainRow) => void;
  onToggleAll: (select: boolean) => void;
}): ReactElement {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    // Focusable so a keyboard user can scroll the table sideways on a narrow screen.
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className={HEAD_ROW}>
            <th scope="col" className={HEAD}>
              <input
                type="checkbox"
                aria-label="Select every domain on this page"
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </th>
            {DOMAIN_COLUMNS.map((label) => (
              <th key={label} scope="col" className={HEAD}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-body-default">
          {rows.map((row) => (
            <tr
              key={row.id}
              className={
                'text-fg hover:bg-surface-3 ' + (selected.has(row.id) ? 'bg-accent-soft' : '')
              }
            >
              <td className={CELL}>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  checked={selected.has(row.id)}
                  onChange={() => onToggle(row)}
                  className="h-4 w-4 accent-primary"
                />
              </td>
              <td className={CELL}>
                <div className="flex items-center gap-space-sm">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-icon text-fg-muted"
                  >
                    language
                  </span>
                  <Link
                    href={`/domains/${encodeURIComponent(row.id)}`}
                    title={row.name}
                    className="max-w-xs truncate text-body-code text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {row.name}
                  </Link>
                </div>
              </td>
              <td className={CELL}>
                <span className="text-body-code text-fg-muted">{programName(row.program_id)}</span>
              </td>
              <td className={CELL}>
                <DnsBadge status={row.dns_status} />
              </td>
              <td className={CELL + ' text-body-code'}>{COUNT.format(row.ips.length)}</td>
              <td className={CELL + ' text-body-code'}>{COUNT.format(row.url_count)}</td>
              <td className={CELL + ' text-body-code'}>{COUNT.format(row.service_count)}</td>
              <td className={CELL}>
                <FindingChips counts={row.finding_counts} />
              </td>
              <td className={CELL + ' text-body-code text-fg-muted'}>
                {formatMoment(row.last_seen_at)}
              </td>
              <td className={CELL + ' text-body-code text-fg-muted'}>
                {formatMoment(row.first_seen_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

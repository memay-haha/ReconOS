'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import type { DnsStatus, DomainRow } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';

import { DnsBadge, FindingChips } from './asset-bits';
import {
  CELL,
  CHECKBOX,
  COUNT,
  HEAD,
  HEAD_ROW,
  MONO,
  MONO_FAINT,
  MONO_MUTED,
  PROGRAM_TAG,
  ROW,
  ROW_SELECTED,
  TBODY,
} from './asset-ui';

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

/** Count columns are right-aligned, as in the mockup. */
const RIGHT: ReadonlySet<string> = new Set(['IPs', 'URLs', 'Services']);

// The mockup marks a domain that does not resolve with its own icon and a dimmed name.
const NAME_ICON: Readonly<Record<DnsStatus, string>> = {
  unknown: 'language',
  resolved: 'language',
  nxdomain: 'domain_disabled',
  timeout: 'sync_problem',
};
const NAME_TONE: Readonly<Record<DnsStatus, string>> = {
  unknown: 'text-asset-domain',
  resolved: 'text-asset-domain',
  nxdomain: 'text-fg-faint',
  timeout: 'text-warn',
};

const NUMBER = CELL + ' text-right ' + MONO;

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
            <th scope="col" className={HEAD + ' w-10 text-center'}>
              <input
                type="checkbox"
                aria-label="Select every domain on this page"
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                className={CHECKBOX}
              />
            </th>
            {DOMAIN_COLUMNS.map((label) => (
              <th
                key={label}
                scope="col"
                className={RIGHT.has(label) ? HEAD + ' text-right' : HEAD}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={TBODY}>
          {rows.map((row) => (
            <tr key={row.id} className={selected.has(row.id) ? ROW_SELECTED : ROW}>
              <td className={CELL + ' text-center'}>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  checked={selected.has(row.id)}
                  onChange={() => onToggle(row)}
                  className={CHECKBOX}
                />
              </td>
              <td className={CELL}>
                <div className="flex max-w-80 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined shrink-0 text-[15px] ${NAME_TONE[row.dns_status]}`}
                  >
                    {NAME_ICON[row.dns_status]}
                  </span>
                  <Link
                    href={`/domains/${encodeURIComponent(row.id)}`}
                    title={row.name}
                    className={`block truncate font-body-code text-body-code-bold tracking-tight hover:underline focus:outline-none focus:ring-2 focus:ring-ring ${row.dns_status === 'nxdomain' ? 'text-fg-muted' : 'text-primary'}`}
                  >
                    {row.name}
                  </Link>
                </div>
              </td>
              <td className={CELL}>
                <span className={PROGRAM_TAG}>{programName(row.program_id)}</span>
              </td>
              <td className={CELL}>
                <DnsBadge status={row.dns_status} />
              </td>
              <td className={NUMBER}>{COUNT.format(row.ips.length)}</td>
              <td className={NUMBER}>{COUNT.format(row.url_count)}</td>
              <td className={NUMBER}>{COUNT.format(row.service_count)}</td>
              <td className={CELL}>
                <FindingChips counts={row.finding_counts} />
              </td>
              <td className={CELL + ' ' + MONO_MUTED}>{formatMoment(row.last_seen_at)}</td>
              <td className={CELL + ' ' + MONO_FAINT}>{formatMoment(row.first_seen_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

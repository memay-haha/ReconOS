'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import type { DnsStatus, DomainRow } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';

import { DnsBadge, FindingChips } from './asset-bits';
import {
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
export type DomainColumn = (typeof DOMAIN_COLUMNS)[number];

/** Columns the reader may hide; Domain always stays. */
export const OPTIONAL_COLUMNS = DOMAIN_COLUMNS.filter((c) => c !== 'Domain');

export type Density = 'comfortable' | 'compact';

/** Count columns are right-aligned, as in the mockup. */
const RIGHT: ReadonlySet<string> = new Set(['IPs', 'URLs', 'Services']);

// Row height follows the density toggle; both keep the mockup's 14 px side padding.
const CELL_BY_DENSITY: Readonly<Record<Density, string>> = {
  comfortable: 'px-3.5 py-2 whitespace-nowrap',
  compact: 'px-3.5 py-1 whitespace-nowrap',
};

/** The link out opens the domain itself in a new tab: only for names that resolve. */
function externalHref(row: DomainRow): string | null {
  if (row.dns_status !== 'resolved' || row.is_wildcard) return null;
  return `https://${row.name}`;
}

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

export function DomainTable({
  rows,
  selected,
  programName,
  hidden,
  density,
  sort,
  onSort,
  onOpen,
  onToggle,
  onToggleAll,
}: {
  rows: readonly DomainRow[];
  selected: ReadonlySet<string>;
  programName: (programId: string) => string;
  hidden: ReadonlySet<string>;
  density: Density;
  sort: 'name' | '-name';
  onSort: () => void;
  onOpen: () => void;
  onToggle: (row: DomainRow) => void;
  onToggleAll: (select: boolean) => void;
}): ReactElement {
  const CELL = CELL_BY_DENSITY[density];
  const NUMBER = CELL + ' text-right ' + MONO;
  const shown = (c: DomainColumn) => !hidden.has(c);
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
            {DOMAIN_COLUMNS.filter(shown).map((label) =>
              label === 'Domain' ? (
                <th
                  key={label}
                  scope="col"
                  aria-sort={sort === 'name' ? 'ascending' : 'descending'}
                  className={HEAD}
                >
                  <button
                    type="button"
                    onClick={onSort}
                    className="inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {label}
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                      {sort === 'name' ? 'expand_more' : 'expand_less'}
                    </span>
                  </button>
                </th>
              ) : (
                <th
                  key={label}
                  scope="col"
                  className={RIGHT.has(label) ? HEAD + ' text-right' : HEAD}
                >
                  {label}
                </th>
              ),
            )}
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
                    onClick={onOpen}
                    className={`block truncate font-body-code text-body-code-bold tracking-tight hover:underline focus:outline-none focus:ring-2 focus:ring-ring ${row.dns_status === 'nxdomain' ? 'text-fg-muted' : 'text-primary'}`}
                  >
                    {row.name}
                  </Link>
                  {externalHref(row) !== null && (
                    <a
                      href={externalHref(row) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${row.name} in a new tab`}
                      className="inline-flex shrink-0 items-center text-fg-faint hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                        open_in_new
                      </span>
                    </a>
                  )}
                </div>
              </td>
              {shown('Program') && (
                <td className={CELL}>
                  <span className={PROGRAM_TAG}>{programName(row.program_id)}</span>
                </td>
              )}
              {shown('DNS') && (
                <td className={CELL}>
                  <DnsBadge status={row.dns_status} />
                </td>
              )}
              {shown('IPs') && <td className={NUMBER}>{COUNT.format(row.ips.length)}</td>}
              {shown('URLs') && <td className={NUMBER}>{COUNT.format(row.url_count)}</td>}
              {shown('Services') && <td className={NUMBER}>{COUNT.format(row.service_count)}</td>}
              {shown('Findings') && (
                <td className={CELL}>
                  <FindingChips counts={row.finding_counts} />
                </td>
              )}
              {shown('Last seen') && (
                <td className={CELL + ' ' + MONO_MUTED}>{formatMoment(row.last_seen_at)}</td>
              )}
              {shown('First seen') && (
                <td className={CELL + ' ' + MONO_FAINT} title={formatMoment(row.first_seen_at)}>
                  {/* The date alone, as the mockup's Discovered column; the title keeps the time. */}
                  {formatMoment(row.first_seen_at).slice(0, 10)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

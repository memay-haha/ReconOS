'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import type { DomainRow } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';
import type { Ip } from '@/lib/ips';
import type { Service } from '@/lib/services';
import type { UrlRow } from '@/lib/urls';

import { DnsBadge, InScopeBadge } from '../domains/asset-bits';
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
} from '../domains/asset-ui';

/** Columns per tab. Domains follows the mockup minus ASN / Org, which a domain row does not
 * carry (M3); IPs, URLs and Services follow the columns of their tables (M7). */
export const COLUMNS = {
  domains: [
    'Domain',
    'Program',
    'DNS Status',
    'IP Resolution',
    'URLs',
    'Services',
    'Last seen',
    'Actions',
  ],
  ips: ['Address', 'Program', 'ASN', 'ASN Org', 'Country', 'CDN', 'Scope', 'Last seen'],
  urls: ['URL', 'Program', 'Status', 'Title', 'Content type', 'Web server', 'Scope', 'Last seen'],
  services: ['Port', 'Transport', 'Name', 'Product', 'Version', 'Program', 'Scope', 'Last seen'],
} as const;

/** Headers of count columns, aligned right like their cells. */
const RIGHT: ReadonlySet<string> = new Set(['URLs', 'Services']);

export interface Selectable<T> {
  readonly rows: readonly T[];
  readonly selected: ReadonlySet<string>;
  readonly programName: (programId: string) => string;
  readonly onToggle: (row: T) => void;
  readonly onToggleAll: (select: boolean) => void;
}

const MUTED = CELL + ' ' + MONO_MUTED;
const CODE = CELL + ' ' + MONO;
const FAINT = CELL + ' ' + MONO_FAINT;
// Count columns line up on the right, as in the mockup.
const NUMBER = CELL + ' text-right ' + MONO;

function Frame({
  label,
  columns,
  allSelected,
  onToggleAll,
  children,
}: {
  label: string | null;
  columns: readonly string[];
  allSelected: boolean;
  onToggleAll: ((select: boolean) => void) | null;
  children: ReactNode;
}): ReactElement {
  return (
    // Focusable so a keyboard user can scroll the table sideways on a narrow screen.
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className={HEAD_ROW}>
            {onToggleAll !== null && (
              <th scope="col" className={HEAD + ' w-10 text-center'}>
                <input
                  type="checkbox"
                  aria-label={`Select every ${label ?? 'row'} on this page`}
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className={CHECKBOX}
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c} scope="col" className={RIGHT.has(c) ? HEAD + ' text-right' : HEAD}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={TBODY}>{children}</tbody>
      </table>
    </div>
  );
}

function Check({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
}): ReactElement {
  return (
    <td className={CELL + ' text-center'}>
      <input
        type="checkbox"
        aria-label={`Select ${name}`}
        checked={checked}
        onChange={onChange}
        className={CHECKBOX}
      />
    </td>
  );
}

function allOf<T extends { id: string }>(rows: readonly T[], selected: ReadonlySet<string>) {
  return rows.length > 0 && rows.every((r) => selected.has(r.id));
}

export function DomainsTable(props: Selectable<DomainRow>): ReactElement {
  const { rows, selected, programName, onToggle, onToggleAll } = props;
  return (
    <Frame
      label="domain"
      columns={COLUMNS.domains}
      allSelected={allOf(rows, selected)}
      onToggleAll={onToggleAll}
    >
      {rows.map((row) => (
        <tr key={row.id} className={selected.has(row.id) ? ROW_SELECTED : ROW}>
          <Check name={row.name} checked={selected.has(row.id)} onChange={() => onToggle(row)} />
          <td className={CELL}>
            <div className="flex items-center gap-space-sm">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[15px] text-asset-domain"
              >
                language
              </span>
              <span
                title={row.name}
                className="max-w-72 truncate font-body-code text-body-default text-fg"
              >
                {row.name}
              </span>
            </div>
          </td>
          <td className={CELL}>
            <span className={PROGRAM_TAG}>{programName(row.program_id)}</span>
          </td>
          <td className={CELL}>
            <DnsBadge status={row.dns_status} />
          </td>
          <td className={CODE}>
            {row.ips[0] === undefined ? (
              <span className="text-fg-faint">None</span>
            ) : (
              <>
                <span>{row.ips[0]}</span>
                {row.ips.length > 1 && (
                  <span className="ml-1 text-[11px] text-fg-faint">
                    {`(${COUNT.format(row.ips.length)} IPs)`}
                  </span>
                )}
              </>
            )}
          </td>
          <td className={NUMBER}>{COUNT.format(row.url_count)}</td>
          <td className={NUMBER}>{COUNT.format(row.service_count)}</td>
          <td className={FAINT}>{formatMoment(row.last_seen_at)}</td>
          <td className={CELL + ' text-right'}>
            <Link
              href={`/domains/${encodeURIComponent(row.id)}`}
              aria-label={`View detail of ${row.name}`}
              className="rounded-sm border border-border bg-surface-2 px-2 py-1 text-[11px] text-fg hover:bg-surface-3 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
            >
              View Detail
            </Link>
          </td>
        </tr>
      ))}
    </Frame>
  );
}

function orNone(value: string | number | null): string {
  return value === null || value === '' ? 'None' : String(value);
}

export function IpsTable(props: Selectable<Ip>): ReactElement {
  const { rows, selected, programName, onToggle, onToggleAll } = props;
  return (
    <Frame
      label="IP"
      columns={COLUMNS.ips}
      allSelected={allOf(rows, selected)}
      onToggleAll={onToggleAll}
    >
      {rows.map((row) => (
        <tr key={row.id} className={selected.has(row.id) ? ROW_SELECTED : ROW}>
          <Check name={row.address} checked={selected.has(row.id)} onChange={() => onToggle(row)} />
          <td className={CODE}>{row.address}</td>
          <td className={MUTED}>{programName(row.program_id)}</td>
          <td className={MUTED}>{row.asn === null ? 'None' : `AS${row.asn}`}</td>
          <td className={MUTED}>{orNone(row.asn_org)}</td>
          <td className={MUTED}>{orNone(row.country)}</td>
          <td className={MUTED}>{orNone(row.cdn_name)}</td>
          <td className={CELL}>
            <InScopeBadge inScope={row.in_scope} />
          </td>
          <td className={FAINT}>{formatMoment(row.last_seen_at)}</td>
        </tr>
      ))}
    </Frame>
  );
}

export function UrlsTable(props: Selectable<UrlRow>): ReactElement {
  const { rows, selected, programName, onToggle, onToggleAll } = props;
  return (
    <Frame
      label="URL"
      columns={COLUMNS.urls}
      allSelected={allOf(rows, selected)}
      onToggleAll={onToggleAll}
    >
      {rows.map((row) => (
        <tr key={row.id} className={selected.has(row.id) ? ROW_SELECTED : ROW}>
          <Check name={row.url} checked={selected.has(row.id)} onChange={() => onToggle(row)} />
          {/* The URL comes from the target: text, never a link. */}
          <td className={CODE}>
            <span title={row.url} className="block max-w-md truncate">
              {row.url}
            </span>
          </td>
          <td className={MUTED}>{programName(row.program_id)}</td>
          <td className={CODE}>{orNone(row.status_code)}</td>
          <td className={MUTED}>
            <span title={row.title ?? undefined} className="block max-w-xs truncate">
              {orNone(row.title)}
            </span>
          </td>
          <td className={MUTED}>{orNone(row.content_type)}</td>
          <td className={MUTED}>{orNone(row.webserver)}</td>
          <td className={CELL}>
            <InScopeBadge inScope={row.in_scope} />
          </td>
          <td className={FAINT}>{formatMoment(row.last_seen_at)}</td>
        </tr>
      ))}
    </Frame>
  );
}

/** A service has no target text of its own, so this tab offers no selection. */
export function ServicesTable({
  rows,
  programName,
}: {
  rows: readonly Service[];
  programName: (programId: string) => string;
}): ReactElement {
  return (
    <Frame label={null} columns={COLUMNS.services} allSelected={false} onToggleAll={null}>
      {rows.map((row) => (
        <tr key={row.id} className={ROW}>
          <td className={CODE}>{row.port}</td>
          <td className={MUTED}>{row.transport.toUpperCase()}</td>
          <td className={MUTED}>{orNone(row.name)}</td>
          <td className={MUTED}>{orNone(row.product)}</td>
          <td className={MUTED}>{orNone(row.version)}</td>
          <td className={MUTED}>{programName(row.program_id)}</td>
          <td className={CELL}>
            <InScopeBadge inScope={row.in_scope} />
          </td>
          <td className={FAINT}>{formatMoment(row.last_seen_at)}</td>
        </tr>
      ))}
    </Frame>
  );
}

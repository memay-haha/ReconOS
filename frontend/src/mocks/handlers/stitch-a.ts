import { HttpResponse } from 'msw';

import { ips, services, urls } from '../data/part-c';
import { type MockRoute, route } from './helpers';

/** Decision N2: case-insensitive substring, `*` a wildcard. */
function matchesQ(text: string, q: string | null): boolean {
  if (q === null || q.trim() === '') return true;
  const pattern = q
    .trim()
    .toLowerCase()
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(pattern).test(text.toLowerCase());
}

/** A cell a spreadsheet would run as a formula gets a leading quote: security.md. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** `GET /<asset>/export`: CSV or JSONL of the filtered rows, `ids` narrowing to a selection. */
function exportRoute<T extends { id: string; program_id: string }>(
  name: 'ips' | 'urls' | 'services',
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
  search: (row: T) => string,
): MockRoute {
  return route(`GET /${name}/export`, ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.getAll('ids');
    const programId = url.searchParams.get('program_id');
    const picked = rows
      .filter((r) => programId === null || r.program_id === programId)
      .filter((r) => ids.length === 0 || ids.includes(r.id))
      .filter((r) => matchesQ(search(r), url.searchParams.get('q')));
    const format = url.searchParams.get('format') ?? 'csv';
    const body =
      format === 'jsonl'
        ? picked.map((r) => JSON.stringify(r)).join('\n')
        : [columns.join(','), ...picked.map((r) => columns.map((c) => cell(r[c])).join(','))].join(
            '\n',
          );
    return new HttpResponse(body, {
      headers: {
        'content-type': format === 'jsonl' ? 'application/x-ndjson' : 'text/csv',
        'content-disposition': `attachment; filename="${name}.${format}"`,
      },
    });
  });
}

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. Agent A: shell, S01-S03. */
export const stitchARoutes: readonly MockRoute[] = [
  exportRoute(
    'ips',
    ips,
    ['address', 'asn', 'asn_org', 'country', 'in_scope'],
    (r) => `${r.address} ${r.asn_org ?? ''}`,
  ),
  exportRoute(
    'urls',
    urls,
    ['url', 'status_code', 'title', 'in_scope'],
    (r) => `${r.url} ${r.title ?? ''}`,
  ),
  exportRoute(
    'services',
    services,
    ['port', 'transport', 'name', 'product', 'version'],
    (r) => `${r.name ?? ''} ${r.product ?? ''}`,
  ),
];

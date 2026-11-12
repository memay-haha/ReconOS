import { HttpResponse } from 'msw';

import type { DomainDetail } from '@/lib/domains';
import type { SavedFilter } from '@/lib/saved-filters';

import { ips, services, tagOf, urls } from '../data/part-c';
import {
  activityOf,
  allDomains,
  deletedDomainIds,
  savedFilters,
  updateDomain,
} from '../data/stitch-b';
import { type MockRoute, page, route } from './helpers';

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Error', status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** `q` as docs/api/architecture.md reads it: a case-insensitive substring, `*` a wildcard. */
function matchesQ(value: string, q: string | null): boolean {
  if (q === null || q === '') return true;
  const pattern = q
    .toLowerCase()
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(pattern).test(value.toLowerCase());
}

function openFindings(d: DomainDetail): number {
  const c = d.finding_counts;
  return c.critical + c.high + c.medium + c.low + c.info;
}

function ipOf(address: string) {
  return ips.find((ip) => ip.address === address);
}

/** The list row: detail-only fields dropped, computed fields added. */
function listRow(d: DomainDetail) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- detail-only fields leave the row
  const { tags, ip_records, service_ports, ...row } = d;
  const first = d.ips[0] === undefined ? undefined : ipOf(d.ips[0]);
  return {
    ...row,
    has_findings: openFindings(d) > 0,
    asn: first?.asn ?? null,
    asn_org: first?.asn_org ?? null,
  };
}

function servicePorts(d: DomainDetail): number[] {
  const ipIds = new Set(d.ips.map((a) => ipOf(a)?.id).filter((x) => x !== undefined));
  const found = services.filter((s) => ipIds.has(s.ip_id)).map((s) => s.port);
  // Sample domains without matching services still show plausible ports.
  const ports = found.length > 0 ? found : [80, 443, 8080, 8443].slice(0, d.service_count);
  return [...new Set(ports)].sort((a, b) => a - b);
}

function detail(d: DomainDetail) {
  return {
    ...listRow(d),
    tags: d.tags,
    ip_records: d.ips.map((address) => ({
      address,
      record_type: address.includes(':') ? 'AAAA' : 'A',
    })),
    service_ports: servicePorts(d),
  };
}

function visible(): DomainDetail[] {
  return allDomains().filter((d) => !deletedDomainIds.has(d.id));
}

/** Every filter of `GET /domains`, shared by the summary and the export. */
function filtered(url: URL): DomainDetail[] {
  const p = url.searchParams;
  const programId = p.get('program_id');
  const dns = p.getAll('dns_status');
  const scope = p.get('in_scope');
  const hasFindings = p.get('has_findings');
  const from = p.get('first_seen_at_from');
  return visible()
    .filter((d) => programId === null || d.program_id === programId)
    .filter((d) => dns.length === 0 || dns.includes(d.dns_status))
    .filter((d) => scope === null || String(d.in_scope) === scope)
    .filter((d) => hasFindings === null || String(openFindings(d) > 0) === hasFindings)
    .filter((d) => from === null || d.first_seen_at >= from)
    .filter((d) => matchesQ(d.name, p.get('q')));
}

/** Offset cursors: enough for a mock, opaque to the screen. */
function paged<T>(rows: readonly T[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? '25');
  const offset = Number(url.searchParams.get('cursor') ?? '0');
  const end = offset + limit;
  return {
    ...page(rows.slice(offset, end)),
    total: rows.length,
    next_cursor: end < rows.length ? String(end) : null,
  };
}

function sortDomains(rows: DomainDetail[], sort: string | null): DomainDetail[] {
  const desc = sort === '-name';
  return [...rows].sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
}

const DAY = 86_400_000;

function exportBody(rows: readonly DomainDetail[], format: string): string {
  // A cell a spreadsheet would run as a formula gets a leading quote: security.md.
  const cell = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
  if (format === 'jsonl') return rows.map((d) => JSON.stringify(listRow(d))).join('\n');
  if (format === 'md')
    return [
      '| name | dns_status | in_scope |',
      '|---|---|---|',
      ...rows.map((d) => `| ${d.name} | ${d.dns_status} | ${d.in_scope} |`),
    ].join('\n');
  return [
    'name,dns_status,in_scope',
    ...rows.map((d) => `${cell(d.name)},${d.dns_status},${d.in_scope}`),
  ].join('\n');
}

/** Mock routes added by the Stitch fidelity pass for S04 and S05
 * (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md). Fixed paths come before
 * `/domains/:domain_id`, which would otherwise answer them. */
export const stitchBRoutes: readonly MockRoute[] = [
  route('GET /domains', ({ request }) => {
    const url = new URL(request.url);
    const rows = sortDomains(filtered(url), url.searchParams.get('sort'));
    return HttpResponse.json(paged(rows.map(listRow), url));
  }),
  route('GET /domains/summary', ({ request }) => {
    const rows = filtered(new URL(request.url));
    const now = Date.now();
    const recent = (d: DomainDetail) => now - Date.parse(d.first_seen_at) < DAY;
    const lastWeek = rows.filter((d) => {
      const age = now - Date.parse(d.first_seen_at);
      return age >= DAY && age < 8 * DAY;
    });
    return HttpResponse.json({
      total: rows.length,
      in_scope: rows.filter((d) => d.in_scope).length,
      resolved: rows.filter((d) => d.dns_status === 'resolved').length,
      resolved_new_24h: rows.filter((d) => d.dns_status === 'resolved' && recent(d)).length,
      unresolved: rows.filter((d) => d.dns_status === 'nxdomain' || d.dns_status === 'timeout')
        .length,
      with_findings: rows.filter((d) => openFindings(d) > 0).length,
      with_critical: rows.filter((d) => d.finding_counts.critical > 0).length,
      new_24h: rows.filter(recent).length,
      new_daily_avg_7d: lastWeek.length / 7,
    });
  }),
  route('GET /domains/export', ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.getAll('ids');
    const rows = filtered(url).filter((d) => ids.length === 0 || ids.includes(d.id));
    const format = url.searchParams.get('format') ?? 'csv';
    const type = { csv: 'text/csv', jsonl: 'application/x-ndjson', md: 'text/markdown' }[format];
    return new HttpResponse(exportBody(rows, format), {
      headers: {
        'content-type': type ?? 'text/csv',
        'content-disposition': `attachment; filename="domains.${format}"`,
      },
    });
  }),
  route('POST /domains/bulk-delete', async ({ request }) => {
    const body = (await request.json()) as { ids: string[] };
    const known = new Set(visible().map((d) => d.id));
    if (body.ids.length === 0 || body.ids.length > 500 || body.ids.some((id) => !known.has(id)))
      return problem(422, 'validation_error');
    for (const id of body.ids) deletedDomainIds.add(id);
    return new HttpResponse(null, { status: 204 });
  }),
  route('GET /domains/:domain_id/activity', ({ params, request }) => {
    const found = visible().find((d) => d.id === params.domain_id);
    if (found === undefined) return problem(404, 'not_found');
    return HttpResponse.json(paged(activityOf(found), new URL(request.url)));
  }),
  route('GET /domains/:domain_id', ({ params }) => {
    const found = visible().find((d) => d.id === params.domain_id);
    return found === undefined ? problem(404, 'not_found') : HttpResponse.json(detail(found));
  }),
  route('DELETE /domains/:domain_id', ({ params }) => {
    const id = String(params.domain_id);
    if (!visible().some((d) => d.id === id)) return problem(404, 'not_found');
    deletedDomainIds.add(id);
    return new HttpResponse(null, { status: 204 });
  }),

  // Lists S05 reads by domain_id: the part C routes filter by program only.
  route('GET /urls', ({ request }) => {
    const url = new URL(request.url);
    const domainId = url.searchParams.get('domain_id');
    const programId = url.searchParams.get('program_id');
    const rows = urls
      .filter((u) => domainId === null || u.domain_id === domainId)
      .filter((u) => programId === null || u.program_id === programId)
      .filter((u) => matchesQ(`${u.url} ${u.title ?? ''}`, url.searchParams.get('q')));
    return HttpResponse.json(paged(rows, url));
  }),
  route('GET /services', ({ request }) => {
    const url = new URL(request.url);
    const domainId = url.searchParams.get('domain_id');
    const programId = url.searchParams.get('program_id');
    const domain = domainId === null ? undefined : allDomains().find((d) => d.id === domainId);
    const ipIds = new Set((domain?.ips ?? []).map((a) => ipOf(a)?.id));
    const rows = services
      .filter((s) => domainId === null || ipIds.has(s.ip_id))
      .filter((s) => programId === null || s.program_id === programId)
      .filter((s) => matchesQ(`${s.name ?? ''} ${s.product ?? ''}`, url.searchParams.get('q')));
    return HttpResponse.json(paged(rows, url));
  }),
  route('GET /ips', ({ request }) => {
    const url = new URL(request.url);
    const programId = url.searchParams.get('program_id');
    const rows = ips
      .filter((ip) => programId === null || ip.program_id === programId)
      .filter((ip) => matchesQ(`${ip.address} ${ip.asn_org ?? ''}`, url.searchParams.get('q')));
    return HttpResponse.json(paged(rows, url));
  }),

  // Tags: the part C routes only know their own five domains.
  route('POST /asset-tags', async ({ request }) => {
    const body = (await request.json()) as { tag_id: string; domain_id: string };
    const tag = tagOf(body.tag_id);
    if (tag === null) return problem(404, 'not_found');
    const id = crypto.randomUUID();
    const done = updateDomain(body.domain_id, (d) => ({
      ...d,
      tags: [...d.tags, { ...tag, id }],
    }));
    if (!done) return problem(404, 'not_found');
    return HttpResponse.json({
      id,
      tag_id: body.tag_id,
      domain_id: body.domain_id,
      ip_id: null,
      url_id: null,
      service_id: null,
      created_by: null,
      created_at: new Date().toISOString(),
    });
  }),
  route('POST /asset-tags/bulk-create', async ({ request }) => {
    const body = (await request.json()) as { tag_id: string; asset_type: string; ids: string[] };
    const tag = tagOf(body.tag_id);
    if (tag === null || body.asset_type !== 'domain') return problem(422, 'validation_error');
    for (const domainId of body.ids) {
      updateDomain(domainId, (d) =>
        d.tags.some((t) => t.tag_id === body.tag_id)
          ? d
          : { ...d, tags: [...d.tags, { ...tag, id: crypto.randomUUID() }] },
      );
    }
    return new HttpResponse(null, { status: 204 });
  }),
  route('DELETE /asset-tags/:asset_tag_id', ({ params }) => {
    const owner = allDomains().find((d) => d.tags.some((t) => t.id === params.asset_tag_id));
    if (owner === undefined) return problem(404, 'not_found');
    updateDomain(owner.id, (d) => ({
      ...d,
      tags: d.tags.filter((t) => t.id !== params.asset_tag_id),
    }));
    return new HttpResponse(null, { status: 204 });
  }),

  route('GET /saved-filters', ({ request }) => {
    const screen = new URL(request.url).searchParams.get('screen');
    const rows = savedFilters
      .filter((f) => screen === null || f.screen === screen)
      .sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(page(rows));
  }),
  route('POST /saved-filters', async ({ request }) => {
    const body = (await request.json()) as Omit<SavedFilter, 'id' | 'created_at'>;
    if (body.name.trim() === '') return problem(422, 'validation_error');
    if (savedFilters.some((f) => f.screen === body.screen && f.name === body.name))
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'conflict',
          errors: [{ field: 'name', code: 'already_exists' }],
        },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      );
    const created: SavedFilter = {
      ...body,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    savedFilters.push(created);
    return HttpResponse.json(created);
  }),
  route('DELETE /saved-filters/:saved_filter_id', ({ params }) => {
    const index = savedFilters.findIndex((f) => f.id === params.saved_filter_id);
    if (index < 0) return problem(404, 'not_found');
    savedFilters.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

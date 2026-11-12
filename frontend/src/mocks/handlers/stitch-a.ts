import { HttpResponse } from 'msw';

import { domains, ips, services, urls } from '../data/part-c';
import { assetEvents, dashboardSummary } from '../data/part-d';
import { findings } from '../data/part-e';
import { programs, toolModules } from '../data/programs';
import { alerts } from '../data/stitch-a';
import { allDomains } from '../data/stitch-b';
import { jobs } from '../data/stitch-d';
import { type MockRoute, page, route } from './helpers';

/** The completed recon job that found the sample domains. */
function discoveryJob() {
  return jobs.find(
    (j) => j.tool_module_name === 'osmedeus-domain-lite' && j.status === 'completed',
  );
}

function contains(text: string | null | undefined, q: string): boolean {
  return (text ?? '').toLowerCase().includes(q);
}

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
  // Decision N1: programs, domains, URLs, findings, tool modules; substring, case-insensitive.
  route('GET /search', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const q = (search.get('q') ?? '').trim().toLowerCase();
    const limit = Math.min(Number(search.get('limit') ?? 10), 50);
    const rows = [
      ...programs
        .filter((p) => contains(p.name, q))
        .map((p) => ({ type: 'program', id: p.id, label: p.name, program_id: p.id })),
      ...domains
        .filter((d) => contains(d.name, q))
        .map((d) => ({ type: 'domain', id: d.id, label: d.name, program_id: d.program_id })),
      ...urls
        .filter((u) => contains(u.url, q))
        .map((u) => ({ type: 'url', id: u.id, label: u.url, program_id: u.program_id })),
      ...findings
        .filter((f) => contains(f.name, q))
        .map((f) => ({ type: 'finding', id: f.id, label: f.name, program_id: f.program_id })),
      ...toolModules
        .filter((m) => contains(m.name, q))
        .map((m) => ({ type: 'tool_module', id: m.id, label: m.name, program_id: null })),
    ];
    return HttpResponse.json({ items: q === '' ? [] : rows.slice(0, limit) });
  }),
  // Decision M3, M21: closed services and findings near their SLA join the summary.
  // P3: `active_sync_ratio` comes from the shared summary, the same in every window.
  route('GET /dashboard/summary', ({ request }) => {
    const scale =
      { '24h': 1, '7d': 6, '30d': 21 }[new URL(request.url).searchParams.get('window') ?? '24h'] ??
      1;
    const n = dashboardSummary.assets_new;
    return HttpResponse.json({
      ...dashboardSummary,
      programs_new: scale === 1 ? 0 : dashboardSummary.programs_new,
      assets_new: {
        domain: n.domain * scale,
        ip: n.ip * scale,
        url: n.url * scale,
        service: n.service * scale,
      },
      assets_closed: { service: 74 * scale },
      findings_near_sla: 3,
    });
  }),
  // Tool module of the job on every event, ASN on IP events. Every event points at a job
  // GET /jobs/:job_id knows (stitch-d), so S05 can name its discovery source. A domain with
  // no sample event gets a discovery event, so every domain of stitch-b has a source.
  route('GET /asset-events', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const programId = search.get('program_id');
    const domainId = search.get('domain_id');
    const recon = discoveryJob();
    const scan = jobs.find((j) => j.tool_module_name === 'nuclei') ?? recon;
    const ip = ips[0];
    const base = assetEvents.map((e, i) => ({
      ...e,
      job_id: i < 3 ? (recon?.id ?? e.job_id) : (scan?.id ?? e.job_id),
      tool_module_name:
        i < 3 ? (recon?.tool_module_name ?? null) : (scan?.tool_module_name ?? null),
      asn: null as number | null,
      asn_org: null as string | null,
    }));
    const ipEvent =
      ip === undefined || assetEvents[0] === undefined
        ? []
        : [
            {
              ...assetEvents[0],
              id: '0190d600-0000-7000-8000-0000000000ff',
              domain_id: null,
              ip_id: ip.id,
              event_type: 'discovered' as const,
              job_id: recon?.id ?? null,
              diff: null,
              created_at: new Date(Date.now() - 90_000).toISOString(),
              asset_type: 'ip' as const,
              asset_name: ip.address,
              tool_module_name: recon?.tool_module_name ?? null,
              asn: ip.asn,
              asn_org: ip.asn_org,
            },
          ];
    let rows = [...base, ...ipEvent];
    if (domainId !== null && !rows.some((e) => e.domain_id === domainId)) {
      const domain = allDomains().find((d) => d.id === domainId);
      if (domain !== undefined && assetEvents[0] !== undefined) {
        rows.push({
          ...assetEvents[0],
          id: `${domain.id.slice(0, 24)}ffffffffffff`,
          program_id: domain.program_id,
          domain_id: domain.id,
          event_type: 'discovered',
          job_id: recon?.id ?? null,
          raw_output_id: null,
          diff: null,
          created_at: domain.first_seen_at,
          asset_type: 'domain',
          asset_name: domain.name,
          program_name: programs.find((p) => p.id === domain.program_id)?.name ?? '',
          tool_module_name: recon?.tool_module_name ?? null,
          asn: null,
          asn_org: null,
        });
      }
    }
    rows = rows
      .filter((e) => programId === null || e.program_id === programId)
      .filter((e) => domainId === null || e.domain_id === domainId);
    const ascending = search.get('sort') === 'created_at';
    rows.sort((x, y) => (ascending ? 1 : -1) * x.created_at.localeCompare(y.created_at));
    const limit = Number(search.get('limit') ?? rows.length);
    return HttpResponse.json({ ...page(rows.slice(0, limit)), total: rows.length });
  }),
  route('GET /alerts', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const isRead = search.get('is_read');
    const limit = Number(search.get('limit') ?? 50);
    const rows = alerts
      .filter((a) => isRead === null || String(a.is_read) === isRead)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json({ ...page(rows.slice(0, limit)), total: rows.length });
  }),
  route('POST /alerts/:alert_id/read', ({ params }) => {
    const alert = alerts.find((a) => a.id === params.alert_id);
    if (alert !== undefined) alert.is_read = true;
    return new HttpResponse(null, { status: 204 });
  }),
  route('POST /alerts/read-all', () => {
    for (const alert of alerts) alert.is_read = true;
    return new HttpResponse(null, { status: 204 });
  }),
];

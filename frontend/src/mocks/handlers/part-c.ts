import { HttpResponse } from 'msw';

import { domains, ips, services, tagOf, tags, urls } from '../data/part-c';
import { type MockRoute, page, route } from './helpers';

function notFound() {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

function byProgram<T extends { program_id: string }>(rows: readonly T[], url: URL): T[] {
  const programId = url.searchParams.get('program_id');
  return programId === null ? [...rows] : rows.filter((r) => r.program_id === programId);
}

/** Domains as the list filters them, without the detail-only `tags`. */
function domainRows(url: URL) {
  const dns = url.searchParams.get('dns_status');
  const scope = url.searchParams.get('in_scope');
  return byProgram(domains, url)
    .filter((d) => dns === null || d.dns_status === dns)
    .filter((d) => scope === null || String(d.in_scope) === scope)
    .map((d) => {
      const row: { -readonly [K in keyof typeof d]?: (typeof d)[K] } = { ...d };
      delete row.tags;
      return row;
    });
}

/** Mock routes for part C screens. Only the part C branch edits this file. */
export const partCRoutes: readonly MockRoute[] = [
  route('GET /domains', ({ request }) => {
    const url = new URL(request.url);
    const rows = domainRows(url);
    const limit = Number(url.searchParams.get('limit') ?? '25');
    return HttpResponse.json({ ...page(rows.slice(0, limit)), total: rows.length });
  }),
  route('GET /domains/export', ({ request }) => {
    const rows = domainRows(new URL(request.url));
    const csv = [
      'name,dns_status,in_scope',
      ...rows.map((d) => `${d.name},${d.dns_status},${d.in_scope}`),
    ];
    return new HttpResponse(csv.join('\n'), {
      headers: {
        'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="domains.csv"',
      },
    });
  }),
  route('GET /domains/:domain_id', ({ params }) => {
    const found = domains.find((d) => d.id === params.domain_id);
    return found === undefined ? notFound() : HttpResponse.json(found);
  }),
  route('GET /ips', ({ request }) => HttpResponse.json(page(byProgram(ips, new URL(request.url))))),
  route('GET /urls', ({ request }) =>
    HttpResponse.json(page(byProgram(urls, new URL(request.url)))),
  ),
  route('GET /services', ({ request }) =>
    HttpResponse.json(page(byProgram(services, new URL(request.url)))),
  ),
  route('GET /tags', () => HttpResponse.json(page(tags))),
  route('POST /tags', async ({ request }) => {
    const body = (await request.json()) as { key: string; value: string };
    const created = {
      id: crypto.randomUUID(),
      key: body.key,
      value: body.value,
      created_by: null,
      created_at: new Date().toISOString(),
    };
    tags.push(created);
    return HttpResponse.json(created);
  }),
  route('POST /asset-tags', async ({ request }) => {
    const body = (await request.json()) as { tag_id: string; domain_id: string };
    const index = domains.findIndex((d) => d.id === body.domain_id);
    const tag = tagOf(body.tag_id);
    const target = domains[index];
    if (target === undefined || tag === null) return notFound();
    const id = crypto.randomUUID();
    domains[index] = { ...target, tags: [...target.tags, { ...tag, id }] };
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
  route('DELETE /asset-tags/:asset_tag_id', ({ params }) => {
    const index = domains.findIndex((d) => d.tags.some((t) => t.id === params.asset_tag_id));
    const target = domains[index];
    if (target === undefined) return notFound();
    domains[index] = { ...target, tags: target.tags.filter((t) => t.id !== params.asset_tag_id) };
    return new HttpResponse(null, { status: 204 });
  }),
];

import { HttpResponse } from 'msw';

import { PLACEHOLDER_PNG } from '../data/part-d';
import {
  GOWITNESS_ID,
  gowitnessJobs,
  SAMPLE_HTML,
  type SampleScreenshot,
  screenshotSamples,
  technologies,
} from '../data/stitch-c';
import { type MockRoute, page, route } from './helpers';

function notFound() {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

// Soft-deleted in this browser session: DELETE hides the row, as `deleted_at` does.
const deleted = new Set<string>();

function statusClassOf(code: number | null): string | null {
  return code === null ? null : `${String(Math.floor(code / 100))}xx`;
}

function technologyIdsOf(shot: SampleScreenshot): string[] {
  return shot.technologies.flatMap((t) => {
    const found = technologies.find((c) => c.name === t.name);
    return found === undefined ? [] : [found.id];
  });
}

/** Every filter of `GET /screenshots` but `status_code`, shared with the summary. */
function filtered(search: URLSearchParams): SampleScreenshot[] {
  const programId = search.get('program_id');
  const isFailed = search.get('is_failed');
  const q = (search.get('q') ?? '').toLowerCase();
  const tech = search.getAll('technology_id');
  const jobId = search.get('job_id');
  return screenshotSamples.filter(
    (s) =>
      !deleted.has(s.id) &&
      (programId === null || s.program_id === programId) &&
      (isFailed === null || String(s.is_failed) === isFailed) &&
      (q === '' ||
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.final_url ?? '').toLowerCase().includes(q)) &&
      (tech.length === 0 || technologyIdsOf(s).some((id) => tech.includes(id))) &&
      (jobId === null || s.job_id === jobId),
  );
}

/** Numbers look-alike groups inside the filter by the earliest `captured_at` (M15). */
function withGroups(rows: readonly SampleScreenshot[]): SampleScreenshot[] {
  const byHash = new Map<string, SampleScreenshot[]>();
  for (const r of rows) {
    if (r.perception_hash === null) continue;
    byHash.set(r.perception_hash, [...(byHash.get(r.perception_hash) ?? []), r]);
  }
  const groups = [...byHash.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([hash, members]) => ({
      hash,
      size: members.length,
      first: Math.min(...members.map((m) => Date.parse(m.captured_at))),
    }))
    .sort((a, b) => a.first - b.first);
  return rows.map((r) => {
    const at = groups.findIndex((g) => g.hash === r.perception_hash);
    const group = groups[at];
    return group === undefined
      ? { ...r, similar_group: null, similar_count: 1 }
      : { ...r, similar_group: at + 1, similar_count: group.size };
  });
}

/** Detail-only fields, absent from a list row. */
const DETAIL_ONLY = [
  'worker_name',
  'device_scale',
  'remote_ip',
  'duration_ms',
  'tls',
  'console_log',
  'cookies',
  'html_size',
  'html_sha256',
  'security_headers',
  'security_headers_passed',
  'security_headers_total',
];

function without(shot: SampleScreenshot, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(shot).filter(([k]) => !keys.includes(k)));
}

function listRow(shot: SampleScreenshot) {
  return without(shot, [...DETAIL_ONLY, 'network_log']);
}

function detailRow(shot: SampleScreenshot) {
  return without(shot, ['network_log']);
}

function find(id: unknown): SampleScreenshot | undefined {
  return screenshotSamples.find((s) => s.id === id && !deleted.has(s.id));
}

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. */
export const stitchCRoutes: readonly MockRoute[] = [
  route('GET /screenshots/summary', ({ request }) => {
    const rows = filtered(new URL(request.url).searchParams);
    const by: Record<string, number> = {};
    for (const r of rows) {
      const c = statusClassOf(r.status_code);
      if (c !== null) by[c] = (by[c] ?? 0) + 1;
    }
    return HttpResponse.json({ by_status_code: by });
  }),
  route('GET /screenshots', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const classes = search.getAll('status_code');
    let rows = withGroups(filtered(search)).filter(
      (s) => classes.length === 0 || classes.includes(statusClassOf(s.status_code) ?? ''),
    );
    rows.sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
    if (search.get('sort') === 'perception_hash') {
      rows = [...rows].sort((a, b) =>
        (a.perception_hash ?? '~').localeCompare(b.perception_hash ?? '~'),
      );
    }
    const limit = Number(search.get('limit') ?? rows.length);
    const offset = Number(search.get('cursor') ?? 0);
    const slice = rows.slice(offset, offset + limit);
    return HttpResponse.json({
      ...page(slice.map(listRow)),
      next_cursor: offset + limit < rows.length ? String(offset + limit) : null,
      total: rows.length,
    });
  }),
  route('GET /screenshots/:screenshot_id', ({ params }) => {
    const found = find(params.screenshot_id);
    return found === undefined ? notFound() : HttpResponse.json(detailRow(found));
  }),
  route('DELETE /screenshots/:screenshot_id', ({ params }) => {
    const found = find(params.screenshot_id);
    if (found === undefined) return notFound();
    deleted.add(found.id);
    return new HttpResponse(null, { status: 204 });
  }),
  route('GET /screenshots/:screenshot_id/image', () =>
    HttpResponse.arrayBuffer(PLACEHOLDER_PNG.slice().buffer, {
      headers: { 'content-type': 'image/png', 'x-content-type-options': 'nosniff' },
    }),
  ),
  route('GET /screenshots/:screenshot_id/network', ({ params }) => {
    const found = find(params.screenshot_id);
    return found === undefined ? notFound() : HttpResponse.json({ network_log: found.network_log });
  }),
  route('GET /screenshots/:screenshot_id/html', ({ params }) =>
    find(params.screenshot_id) === undefined
      ? notFound()
      : new HttpResponse(SAMPLE_HTML, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'x-content-type-options': 'nosniff',
          },
        }),
  ),
  route('GET /screenshots/:screenshot_id/har', ({ params }) => {
    const found = find(params.screenshot_id);
    if (found === undefined) return notFound();
    const har = {
      log: {
        version: '1.2',
        creator: { name: 'ReconOS', version: '0' },
        entries: found.network_log.map((n) => ({
          request: { method: n.method, url: n.url },
          response: {
            status: n.status_code,
            content: { size: n.size_bytes, mimeType: n.content_type },
          },
          time: n.duration_ms,
          serverIPAddress: n.remote_ip,
        })),
      },
    };
    return new HttpResponse(JSON.stringify(har), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="screenshot-${found.id}.har"`,
      },
    });
  }),
  route('GET /technologies', () => HttpResponse.json(page(technologies))),
  // Only gowitness job lists are answered here; any other `GET /jobs` falls through to the
  // older handler, since MSW tries the next match when a resolver returns nothing.
  route('GET /jobs', ({ request }) => {
    const search = new URL(request.url).searchParams;
    if (!search.getAll('tool_module_id').includes(GOWITNESS_ID)) return undefined;
    const statuses = search.getAll('status');
    const programId = search.get('program_id');
    const rows = gowitnessJobs.filter(
      (j) =>
        (statuses.length === 0 || statuses.includes(j.status)) &&
        (programId === null || j.program_id === programId),
    );
    return HttpResponse.json(page([...rows].reverse()));
  }),
];

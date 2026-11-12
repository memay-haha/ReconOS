import { HttpResponse } from 'msw';

import type { JobStatus } from '@/lib/jobs';
import type { ProgramRow } from '@/lib/programs';
import type { ScopeRuleBody } from '@/lib/scope-rules';

import { gowitnessJobs } from '../data/stitch-c';
import { jobs, programs, schedules, scopeRules, workers } from '../data/stitch-d';
import { type MockRoute, route } from './helpers';

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. Agent D: S08 to S11. */

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const noContent = () => new HttpResponse(null, { status: 204 });

/** Keyset pagination stand-in: the cursor is the offset, as opaque to the screen as the real one. */
function paged<T>(rows: readonly T[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? '50') || 50;
  const offset = Number(url.searchParams.get('cursor') ?? '0') || 0;
  const items = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? String(offset + limit) : null;
  return HttpResponse.json({
    items,
    next_cursor: next,
    total: rows.length,
    total_is_estimate: false,
  });
}

function matches(value: string | null | undefined, q: string): boolean {
  return (value ?? '').toLowerCase().includes(q.toLowerCase());
}

async function idsOf(request: Request): Promise<string[]> {
  const body = (await request.json()) as { ids?: unknown };
  return Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : [];
}

const PROGRAM_SORT: Readonly<Record<string, (a: ProgramRow, b: ProgramRow) => number>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  '-domain_count': (a, b) => b.domain_count - a.domain_count,
  '-finding_critical_count': (a, b) => b.finding_counts.critical - a.finding_counts.critical,
  '-last_job_finished_at': (a, b) =>
    (b.last_job_finished_at ?? '').localeCompare(a.last_job_finished_at ?? ''),
};

function setStatus(ids: readonly string[], status: ProgramRow['status']): void {
  for (const id of ids) {
    const at = programs.findIndex((p) => p.id === id);
    const found = programs[at];
    if (found !== undefined) programs[at] = { ...found, status };
  }
}

export const stitchDRoutes: readonly MockRoute[] = [
  // Programs
  route('GET /programs', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const status = url.searchParams.get('status');
    const hasRule = url.searchParams.get('has_in_scope_rule');
    const hasDomain = url.searchParams.get('has_domain');
    const sort = PROGRAM_SORT[url.searchParams.get('sort') ?? 'name'] ?? PROGRAM_SORT.name;
    const rows = programs
      .filter((p) => p.status !== 'archived')
      .filter((p) => status === null || p.status === status)
      .filter(
        (p) =>
          q === null ||
          [p.name, p.platform, p.platform_handle, p.description].some((v) => matches(v, q)),
      )
      .filter((p) => hasRule === null || p.in_scope_rule_count > 0 === (hasRule === 'true'))
      .filter((p) => hasDomain === null || p.domain_count > 0 === (hasDomain === 'true'))
      .sort(sort);
    return paged(rows, url);
  }),
  route('GET /programs/:program_id', ({ params }) => {
    const found = programs.find((p) => p.id === params.program_id);
    return found === undefined ? problem(404, 'not_found') : HttpResponse.json(found);
  }),
  route('POST /programs/bulk-pause', async ({ request }) => {
    setStatus(await idsOf(request), 'paused');
    return noContent();
  }),
  route('POST /programs/bulk-resume', async ({ request }) => {
    setStatus(await idsOf(request), 'active');
    return noContent();
  }),
  route('POST /programs/bulk-archive', async ({ request }) => {
    setStatus(await idsOf(request), 'archived');
    return noContent();
  }),
  route('POST /programs/bulk-delete', async ({ request }) => {
    for (const id of await idsOf(request)) {
      const at = programs.findIndex((p) => p.id === id);
      if (at !== -1) programs.splice(at, 1);
    }
    return noContent();
  }),

  // Scope rules
  route('GET /programs/:program_id/scope-rules', ({ params, request }) =>
    paged(
      scopeRules.filter((r) => r.program_id === params.program_id),
      new URL(request.url),
    ),
  ),
  route('POST /programs/:program_id/scope-rules/bulk-create', async ({ params, request }) => {
    const body = (await request.json()) as { items?: ScopeRuleBody[] };
    const created = (body.items ?? []).map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      program_id: String(params.program_id),
      created_by: null,
      created_at: new Date().toISOString(),
      matched_domain_count: 0,
    }));
    scopeRules.push(...created);
    return HttpResponse.json({ items: created });
  }),

  // Schedules
  route('GET /programs/:program_id/schedules', ({ params, request }) =>
    paged(
      schedules.filter((s) => s.program_id === params.program_id),
      new URL(request.url),
    ),
  ),
  route('POST /schedules/:schedule_id/run', ({ params }) => {
    const found = schedules.find((s) => s.id === params.schedule_id);
    if (found === undefined) return problem(404, 'not_found');
    return HttpResponse.json({
      id: crypto.randomUUID(),
      program_id: found.program_id,
      tool_module_id: found.tool_module_id,
      status: 'queued',
      schedule_id: found.id,
    });
  }),

  // Jobs and the dispatcher
  route('GET /jobs', ({ request }) => {
    const url = new URL(request.url);
    const statuses = url.searchParams.getAll('status') as JobStatus[];
    const programId = url.searchParams.get('program_id');
    const modules = url.searchParams.getAll('tool_module_id');
    const q = url.searchParams.get('q');
    // `target`: jobs that have this target (S05 Scan History).
    const target = url.searchParams.get('target');
    const rows = jobs.filter(
      (j) =>
        (target === null || j.target.includes(target)) &&
        (statuses.length === 0 || statuses.includes(j.status)) &&
        (programId === null || j.program_id === programId) &&
        (modules.length === 0 || modules.includes(j.tool_module_id)) &&
        (q === null || j.target.some((t) => matches(t, q)) || matches(j.tool_module_name, q)),
    );
    return paged(rows, url);
  }),
  route('GET /jobs/:job_id', ({ params }) => {
    // The gowitness jobs behind the sample screenshots (S05 latest capture, S07) live in
    // stitch-c data.
    const found = [...jobs, ...gowitnessJobs].find((j) => j.id === params.job_id);
    return found === undefined ? problem(404, 'not_found') : HttpResponse.json(found);
  }),
  route('POST /jobs/:job_id/prioritize', ({ params }) => {
    const at = jobs.findIndex((j) => j.id === params.job_id);
    const found = jobs[at];
    if (found === undefined) return problem(404, 'not_found');
    if (found.status !== 'queued') return problem(409, 'conflict');
    jobs[at] = { ...found, priority: 'high' };
    return noContent();
  }),
  route('POST /jobs/bulk-retry', async ({ request }) => {
    const ids = await idsOf(request);
    return HttpResponse.json({ items: ids.map(() => ({ id: crypto.randomUUID() })) });
  }),
  route('POST /jobs/cleanup', () => {
    const paused = new Set(programs.filter((p) => p.status !== 'active').map((p) => p.id));
    let cancelled = 0;
    jobs.forEach((j, at) => {
      if (j.status === 'queued' && paused.has(j.program_id)) {
        jobs[at] = { ...j, status: 'cancelled', status_reason: 'Program paused' };
        cancelled += 1;
      }
    });
    return HttpResponse.json({ cancelled });
  }),
  route('POST /dispatcher/wake', noContent),
  route('GET /dispatcher/status', () => {
    const queued = jobs.filter((j) => j.status === 'queued');
    const count = (key: (j: (typeof jobs)[number]) => string) =>
      queued.reduce<Record<string, number>>((acc, j) => {
        acc[key(j)] = (acc[key(j)] ?? 0) + 1;
        return acc;
      }, {});
    const online = workers.filter((w) => w.is_online === true);
    return HttpResponse.json({
      status: 'ok',
      last_heartbeat_at: new Date(Date.now() - 4_000).toISOString(),
      queued_by_tool_module: count((j) => j.tool_module_id),
      queued_by_program: count((j) => j.program_id),
      queued_total: queued.length,
      queue_capacity: 1000,
      workers_online: online.length,
      running_total: jobs.filter((j) => j.status === 'running').length,
      slot_capacity: 14,
      jobs_per_minute: 3.2,
      avg_wait_seconds: 102,
      redis_used_bytes: 1_258_291,
      last_dispatched_at: new Date(Date.now() - 12_000).toISOString(),
      last_dispatched_tool_module: 'nuclei',
    });
  }),
  route('GET /workers', ({ request }) => paged(workers, new URL(request.url))),

  // Public settings S09 reads (N30).
  route('GET /system-settings/:key', ({ params }) => {
    const values: Readonly<Record<string, number>> = {
      log_retention_days: 30,
      queue_capacity: 1000,
      finding_sla_days: 30,
    };
    const key = String(params.key);
    const value = values[key];
    return value === undefined
      ? problem(404, 'not_found')
      : HttpResponse.json({ key, value, updated_at: '2026-11-01T00:00:00Z', updated_by: null });
  }),
];

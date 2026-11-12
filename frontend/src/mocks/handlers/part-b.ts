import { HttpResponse } from 'msw';

import type { JobStatus } from '@/lib/jobs';

import { jobLogs, jobs, rawOutputs, schedules } from '../data/part-b';
import { users } from '../data/users';
import { type MockRoute, page, route } from './helpers';

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const noContent = () => new HttpResponse(null, { status: 204 });

function remove<T>(rows: T[], match: (row: T) => boolean): boolean {
  const at = rows.findIndex(match);
  if (at === -1) return false;
  rows.splice(at, 1);
  return true;
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/** Mock routes for part B screens. Only the part B branch edits this file. */
export const partBRoutes: readonly MockRoute[] = [
  // Schedules
  route('GET /programs/:program_id/schedules', ({ params }) =>
    HttpResponse.json(page(schedules.filter((s) => s.program_id === params.program_id))),
  ),
  route('POST /programs/:program_id/schedules', async ({ params, request }) => {
    const body = await bodyOf(request);
    const schedule = {
      id: crypto.randomUUID(),
      program_id: String(params.program_id),
      tool_module_id: String(body.tool_module_id ?? ''),
      target: Array.isArray(body.target) ? body.target.map(String) : [],
      params: {},
      interval_minutes: Number(body.interval_minutes ?? 1440),
      is_enabled: true,
      created_by: users[0]?.id ?? null,
      last_run_at: null,
      next_run_at: null,
      created_at: new Date().toISOString(),
    };
    schedules.push(schedule);
    return HttpResponse.json(schedule);
  }),
  route('PATCH /schedules/:schedule_id', async ({ params, request }) => {
    const at = schedules.findIndex((s) => s.id === params.schedule_id);
    const found = schedules[at];
    if (found === undefined) return problem(404, 'not_found');
    const next = { ...found, ...(await bodyOf(request)) } as typeof found;
    schedules[at] = next;
    return HttpResponse.json(next);
  }),
  route('DELETE /schedules/:schedule_id', ({ params }) =>
    remove(schedules, (s) => s.id === params.schedule_id) ? noContent() : problem(404, 'not_found'),
  ),

  // Jobs
  route('GET /jobs', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const status = query.get('status') as JobStatus | null;
    const programId = query.get('program_id');
    const target = query.get('target');
    const rows = jobs.filter(
      (j) =>
        (status === null || j.status === status) &&
        (programId === null || j.program_id === programId) &&
        (target === null || j.target.includes(target)),
    );
    return HttpResponse.json(page([...rows].reverse()));
  }),
  route('GET /jobs/:job_id', ({ params }) => {
    const found = jobs.find((j) => j.id === params.job_id);
    return found === undefined ? problem(404, 'not_found') : HttpResponse.json(found);
  }),
  route('POST /jobs/:job_id/approve', ({ params }) => {
    const found = jobs.find((j) => j.id === params.job_id);
    if (found === undefined) return problem(404, 'not_found');
    // The sample jobs are created by the sample Superadmin, as the real rule would refuse.
    return found.created_by === users[0]?.id
      ? problem(403, 'self_approval_forbidden')
      : noContent();
  }),
  route('POST /jobs/:job_id/reject', noContent),
  route('POST /jobs/:job_id/cancel', noContent),
  route('POST /jobs/:job_id/retry', ({ params }) => {
    const found = jobs.find((j) => j.id === params.job_id);
    if (found === undefined) return problem(404, 'not_found');
    return HttpResponse.json({
      ...found,
      id: crypto.randomUUID(),
      status: 'queued',
      retry_of_job_id: found.id,
      status_reason: null,
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    });
  }),
  route('GET /dispatcher/status', () => {
    const queued = jobs.filter((j) => j.status === 'queued');
    const count = (key: (j: (typeof jobs)[number]) => string) =>
      queued.reduce<Record<string, number>>((acc, j) => {
        acc[key(j)] = (acc[key(j)] ?? 0) + 1;
        return acc;
      }, {});
    return HttpResponse.json({
      last_heartbeat_at: new Date().toISOString(),
      queued_by_tool_module: count((j) => j.tool_module_id),
      queued_by_program: count((j) => j.program_id),
    });
  }),
  route('GET /jobs/:job_id/raw-outputs', ({ params }) =>
    HttpResponse.json(page(rawOutputs.filter((o) => o.job_id === params.job_id))),
  ),
  route('GET /jobs/:job_id/logs', ({ params }) =>
    HttpResponse.json(page(jobLogs.filter((l) => l.job_id === params.job_id))),
  ),
];

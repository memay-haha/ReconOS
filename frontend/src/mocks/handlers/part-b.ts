import { HttpResponse } from 'msw';

import type { JobStatus } from '@/lib/jobs';

import {
  jobLogs,
  jobs,
  programUsers,
  proxies,
  rawOutputs,
  schedules,
  scopeRules,
} from '../data/part-b';
import { programs } from '../data/programs';
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
  // Programs
  route('POST /programs', async ({ request }) => {
    const body = await bodyOf(request);
    const now = new Date().toISOString();
    return HttpResponse.json({
      id: crypto.randomUUID(),
      status: 'active',
      created_by: users[0]?.id ?? null,
      created_at: now,
      updated_at: now,
      archived_at: null,
      ...body,
    });
  }),
  route('PATCH /programs/:program_id', async ({ params, request }) => {
    const found = programs.find((p) => p.id === params.program_id);
    if (found === undefined) return problem(404, 'not_found');
    return HttpResponse.json({ ...found, ...(await bodyOf(request)) });
  }),
  route('DELETE /programs/:program_id', noContent),
  route('POST /programs/:program_id/pause', noContent),
  route('POST /programs/:program_id/resume', noContent),
  route('POST /programs/:program_id/archive', noContent),

  // Scope rules
  route('GET /programs/:program_id/scope-rules', ({ params }) =>
    HttpResponse.json(page(scopeRules.filter((r) => r.program_id === params.program_id))),
  ),
  route('POST /programs/:program_id/scope-rules', async ({ params, request }) => {
    const body = await bodyOf(request);
    if (body.scope_type === 'out_of_scope' && (body.reason ?? '') === '') {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Validation error',
          status: 422,
          code: 'validation_error',
          errors: [{ field: 'reason', code: 'missing' }],
        },
        { status: 422, headers: { 'content-type': 'application/problem+json' } },
      );
    }
    const rule = {
      id: crypto.randomUUID(),
      program_id: String(params.program_id),
      scope_type: body.scope_type === 'out_of_scope' ? 'out_of_scope' : 'in_scope',
      rule_type: (body.rule_type ?? 'domain') as 'domain',
      value: String(body.value ?? ''),
      reason: typeof body.reason === 'string' ? body.reason : null,
      created_by: users[0]?.id ?? null,
      created_at: new Date().toISOString(),
    } as const;
    scopeRules.push(rule);
    return HttpResponse.json(rule);
  }),
  route('PATCH /scope-rules/:scope_rule_id', async ({ params, request }) => {
    const at = scopeRules.findIndex((r) => r.id === params.scope_rule_id);
    const found = scopeRules[at];
    if (found === undefined) return problem(404, 'not_found');
    const next = { ...found, ...(await bodyOf(request)) } as typeof found;
    scopeRules[at] = next;
    return HttpResponse.json(next);
  }),
  route('DELETE /scope-rules/:scope_rule_id', ({ params }) =>
    remove(scopeRules, (r) => r.id === params.scope_rule_id)
      ? noContent()
      : problem(404, 'not_found'),
  ),

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

  // Program users
  route('GET /programs/:program_id/users', ({ params }) =>
    HttpResponse.json(page(programUsers.filter((u) => u.program_id === params.program_id))),
  ),
  route('POST /programs/:program_id/users', async ({ params, request }) => {
    const body = await bodyOf(request);
    programUsers.push({
      program_id: String(params.program_id),
      user_id: String(body.user_id ?? ''),
      assigned_by: users[0]?.id ?? null,
      assigned_at: new Date().toISOString(),
    });
    return noContent();
  }),
  route('DELETE /programs/:program_id/users/:user_id', ({ params }) =>
    remove(programUsers, (u) => u.program_id === params.program_id && u.user_id === params.user_id)
      ? noContent()
      : problem(404, 'not_found'),
  ),

  // Proxies: the list never carries the URL.
  route('GET /programs/:program_id/proxies', ({ params }) =>
    HttpResponse.json(page(proxies.filter((p) => p.program_id === params.program_id))),
  ),
  route('POST /programs/:program_id/proxies', async ({ params, request }) => {
    const body = await bodyOf(request);
    const now = new Date().toISOString();
    const proxy = {
      id: crypto.randomUUID(),
      program_id: String(params.program_id),
      name: String(body.name ?? ''),
      is_enabled: true,
      created_at: now,
      updated_at: now,
    };
    proxies.push(proxy);
    return HttpResponse.json(proxy);
  }),
  route('PATCH /proxies/:proxy_id', async ({ params, request }) => {
    const at = proxies.findIndex((p) => p.id === params.proxy_id);
    const found = proxies[at];
    if (found === undefined) return problem(404, 'not_found');
    const body = await bodyOf(request);
    const next = {
      ...found,
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.is_enabled === 'boolean' ? { is_enabled: body.is_enabled } : {}),
      updated_at: new Date().toISOString(),
    };
    proxies[at] = next;
    return HttpResponse.json(next);
  }),
  route('DELETE /proxies/:proxy_id', ({ params }) =>
    remove(proxies, (p) => p.id === params.proxy_id) ? noContent() : problem(404, 'not_found'),
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

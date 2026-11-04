import { HttpResponse } from 'msw';

import { programs, toolModules } from '../data/programs';
import { users } from '../data/users';
import { type MockRoute, page, route } from './helpers';

/** Routes several parts read. Each part adds its own routes in its own file. */
export const sharedRoutes: readonly MockRoute[] = [
  route('GET /users', () => HttpResponse.json(page(users))),
  // Spelled with a path parameter on purpose: it is in IMPLEMENTED, so
  // registry.test.ts proves the parameter spelling lines up with the filter.
  route('GET /users/:user_id', () => HttpResponse.json(users[0])),
  route('GET /programs', () => HttpResponse.json(page(programs))),
  route('GET /programs/:program_id', ({ params }) => {
    const found = programs.find((p) => p.id === params.program_id);
    return found === undefined
      ? HttpResponse.json(
          { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        )
      : HttpResponse.json(found);
  }),
  route('GET /tool-modules', () => HttpResponse.json(page(toolModules))),
  route('GET /workers', () =>
    HttpResponse.json(
      page([
        {
          id: '0190c000-0000-7000-8000-000000000001',
          name: 'worker-recon-01',
          tool_modules: ['osmedeus-domain-lite', 'gowitness', 'nuclei'],
          last_heartbeat_at: new Date().toISOString(),
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: '0190c000-0000-7000-8000-000000000002',
          name: 'worker-exploit-01',
          tool_modules: ['sqlmap', 'dalfox'],
          last_heartbeat_at: '2026-11-04T01:00:00Z',
          created_at: '2026-10-01T00:00:00Z',
        },
      ]),
    ),
  ),
  route('POST /jobs', async ({ request }) => {
    const body = (await request.json()) as {
      program_id: string;
      tool_module_id: string;
      target: string[];
    };
    const exploit = toolModules.find((m) => m.id === body.tool_module_id)?.group === 'exploit';
    return HttpResponse.json({
      id: crypto.randomUUID(),
      program_id: body.program_id,
      tool_module_id: body.tool_module_id,
      status: exploit ? 'pending_approval' : 'queued',
      priority: 0,
      target: body.target,
      params: {},
      proxy_id: null,
      schedule_id: null,
      retry_of_job_id: null,
      worker_id: null,
      created_by: users[0]?.id ?? null,
      approved_by: null,
      status_reason: null,
      created_at: new Date().toISOString(),
      approved_at: null,
      dispatched_at: null,
      started_at: null,
      last_heartbeat_at: null,
      finished_at: null,
    });
  }),
];

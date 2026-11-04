import { HttpResponse } from 'msw';

import {
  appLogs,
  engines,
  engineVariables,
  findings,
  systemHealth,
  systemSettings,
} from '../data/part-e';
import { toolModules } from '../data/programs';
import { type MockRoute, page, route } from './helpers';

function notFound() {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

function invalid(field: string, code: string) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: 'Validation error',
      status: 422,
      code: 'validation_error',
      errors: [{ field, code }],
    },
    { status: 422, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Mock routes for part E screens. Only the part E branch edits this file. */
export const partERoutes: readonly MockRoute[] = [
  route('GET /system/health', () => HttpResponse.json(systemHealth())),
  route('GET /system-settings', () => HttpResponse.json(page(systemSettings))),
  route('PATCH /system-settings/:key', async ({ params, request }) => {
    const found = systemSettings.find((s) => s.key === params.key);
    if (found === undefined) return notFound();
    const body = (await request.json()) as { value: unknown };
    return HttpResponse.json({ ...found, value: body.value, updated_at: new Date().toISOString() });
  }),
  route('GET /logs', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const level = query.get('level');
    const service = query.get('service');
    return HttpResponse.json(
      page(
        appLogs.filter(
          (l) =>
            (level === null || l.level === level) && (service === null || l.service === service),
        ),
      ),
    );
  }),
  route('DELETE /logs', ({ request }) => {
    const before = new URL(request.url).searchParams.get('before');
    if (before === null) return invalid('before', 'missing');
    return new HttpResponse(null, { status: 204 });
  }),
  route('GET /engines', () => HttpResponse.json(page(engines))),
  route('PATCH /engines/:engine_id', async ({ params, request }) => {
    const found = engines.find((e) => e.id === params.engine_id);
    if (found === undefined) return notFound();
    const body = (await request.json()) as { base_url?: string };
    return HttpResponse.json({ ...found, base_url: body.base_url ?? found.base_url });
  }),
  route('POST /engines/:engine_id/test', ({ params }) => {
    const found = engines.find((e) => e.id === params.engine_id);
    if (found === undefined) return notFound();
    return HttpResponse.json({ version: found.name === 'osmedeus' ? 'v5.0.1' : 'v0.5.3' });
  }),
  route('GET /engines/:engine_id/variables', ({ params }) =>
    HttpResponse.json(page(engineVariables.filter((v) => v.engine_id === params.engine_id))),
  ),
  route('PUT /engines/:engine_id/variables/:key', () => new HttpResponse(null, { status: 204 })),
  route('DELETE /engines/:engine_id/variables/:key', () => new HttpResponse(null, { status: 204 })),
  route('PATCH /tool-modules/:tool_module_id', async ({ params, request }) => {
    const found = toolModules.find((m) => m.id === params.tool_module_id);
    if (found === undefined) return notFound();
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...found, ...body, updated_at: new Date().toISOString() });
  }),
  route('GET /findings', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const severities = query.getAll('severity');
    const triage = query.get('triage_status');
    const program = query.get('program_id');
    return HttpResponse.json(
      page(
        findings.filter(
          (f) =>
            (severities.length === 0 || severities.includes(f.severity)) &&
            (triage === null || f.triage_status === triage) &&
            (program === null || f.program_id === program),
        ),
      ),
    );
  }),
  route('GET /findings/export', () =>
    HttpResponse.text(findings.map((f) => JSON.stringify(f)).join('\n'), {
      headers: { 'content-disposition': 'attachment; filename="findings.jsonl"' },
    }),
  ),
  route('GET /findings/:finding_id', ({ params }) => {
    const found = findings.find((f) => f.id === params.finding_id);
    return found === undefined ? notFound() : HttpResponse.json(found);
  }),
  route('PATCH /findings/:finding_id', async ({ params, request }) => {
    const found = findings.find((f) => f.id === params.finding_id);
    if (found === undefined) return notFound();
    const body = (await request.json()) as {
      triage_status: string;
      duplicate_of_id?: string | null;
    };
    if (body.triage_status === 'duplicate' && !body.duplicate_of_id) {
      return invalid('duplicate_of_id', 'missing');
    }
    return HttpResponse.json({ ...found, ...body, triaged_at: new Date().toISOString() });
  }),
  route('POST /findings/bulk-triage', () => new HttpResponse(null, { status: 204 })),
];

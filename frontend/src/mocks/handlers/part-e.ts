import { HttpResponse } from 'msw';

import { appLogs, systemHealth, systemSettings } from '../data/part-e';
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
];

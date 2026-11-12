import { HttpResponse } from 'msw';

import { schedules } from '../data/stitch-d';
import { type MockRoute, route } from './helpers';

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. Agent D: S08 to S11. */

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

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

export const stitchDRoutes: readonly MockRoute[] = [
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

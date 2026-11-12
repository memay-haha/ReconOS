import { HttpResponse } from 'msw';

import { type MockRoute, route } from './helpers';

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. Agent D: S08 to S11. */

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

export const stitchDRoutes: readonly MockRoute[] = [
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

import { HttpResponse } from 'msw';

import type { SavedFilter } from '@/lib/saved-filters';

import { savedFilters } from '../data/stitch-b';
import { type MockRoute, page, route } from './helpers';

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Error', status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Mock routes added by the Stitch fidelity pass for S04 and S05
 * (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md). The domain, IP, URL,
 * service and tag routes left when the backend began serving them in batch 5: registry.ts. */
export const stitchBRoutes: readonly MockRoute[] = [
  route('GET /saved-filters', ({ request }) => {
    const screen = new URL(request.url).searchParams.get('screen');
    const rows = savedFilters
      .filter((f) => screen === null || f.screen === screen)
      .sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(page(rows));
  }),
  route('POST /saved-filters', async ({ request }) => {
    const body = (await request.json()) as Omit<SavedFilter, 'id' | 'created_at'>;
    if (body.name.trim() === '') return problem(422, 'validation_error');
    if (savedFilters.some((f) => f.screen === body.screen && f.name === body.name))
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'conflict',
          errors: [{ field: 'name', code: 'already_exists' }],
        },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      );
    const created: SavedFilter = {
      ...body,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    savedFilters.push(created);
    return HttpResponse.json(created);
  }),
  route('DELETE /saved-filters/:saved_filter_id', ({ params }) => {
    const index = savedFilters.findIndex((f) => f.id === params.saved_filter_id);
    if (index < 0) return problem(404, 'not_found');
    savedFilters.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

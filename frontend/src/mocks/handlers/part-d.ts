import { HttpResponse } from 'msw';

import {
  assetEvents,
  dashboardSummary,
  PLACEHOLDER_PNG,
  screenshots,
  urlDetails,
} from '../data/part-d';
import { type MockRoute, page, route } from './helpers';

function notFound() {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Mock routes for part D screens. Only the part D branch edits this file. */
export const partDRoutes: readonly MockRoute[] = [
  route('GET /dashboard/summary', () => HttpResponse.json(dashboardSummary)),
  route('GET /asset-events', ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? assetEvents.length);
    return HttpResponse.json({ ...page(assetEvents.slice(0, limit)), total: assetEvents.length });
  }),
  route('GET /screenshots', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const programId = search.get('program_id');
    let rows = screenshots.filter((s) => programId === null || s.program_id === programId);
    if (search.get('sort') === 'perception_hash') {
      rows = [...rows].sort((a, b) =>
        (a.perception_hash ?? '~').localeCompare(b.perception_hash ?? '~'),
      );
    }
    return HttpResponse.json(page(rows));
  }),
  route('GET /screenshots/:screenshot_id', ({ params }) => {
    const found = screenshots.find((s) => s.id === params.screenshot_id);
    return found === undefined ? notFound() : HttpResponse.json(found);
  }),
  route('GET /screenshots/:screenshot_id/image', () =>
    HttpResponse.arrayBuffer(PLACEHOLDER_PNG.slice().buffer, {
      headers: { 'content-type': 'image/png', 'x-content-type-options': 'nosniff' },
    }),
  ),
  route('GET /urls/:url_id', ({ params }) => {
    const found = urlDetails.find((u) => u.id === params.url_id);
    return found === undefined ? notFound() : HttpResponse.json(found);
  }),
];

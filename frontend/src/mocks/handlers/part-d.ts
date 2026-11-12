import { HttpResponse } from 'msw';

import { assetEvents, urlDetails } from '../data/part-d';
import { type MockRoute, page, route } from './helpers';

function notFound() {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Mock routes for part D screens. Only the part D branch edits this file. */
export const partDRoutes: readonly MockRoute[] = [
  route('GET /asset-events', ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? assetEvents.length);
    return HttpResponse.json({ ...page(assetEvents.slice(0, limit)), total: assetEvents.length });
  }),
  route('GET /urls/:url_id', ({ params }) => {
    const found = urlDetails.find((u) => u.id === params.url_id);
    return found === undefined ? notFound() : HttpResponse.json(found);
  }),
];

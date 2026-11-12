import { HttpResponse } from 'msw';

import { jobLogs } from '../data/part-b';
import { type MockRoute, page, route } from './helpers';

/** Mock routes for part B screens. Only the part B branch edits this file. */
export const partBRoutes: readonly MockRoute[] = [
  // Jobs
  route('GET /jobs/:job_id/logs', ({ params }) =>
    HttpResponse.json(page(jobLogs.filter((l) => l.job_id === params.job_id))),
  ),
];

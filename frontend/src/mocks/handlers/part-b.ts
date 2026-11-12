import { HttpResponse } from 'msw';

import { jobLogs, jobs } from '../data/part-b';
import { users } from '../data/users';
import { type MockRoute, page, route } from './helpers';

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const noContent = () => new HttpResponse(null, { status: 204 });

/** Mock routes for part B screens. Only the part B branch edits this file. */
export const partBRoutes: readonly MockRoute[] = [
  // Jobs
  route('POST /jobs/:job_id/approve', ({ params }) => {
    const found = jobs.find((j) => j.id === params.job_id);
    if (found === undefined) return problem(404, 'not_found');
    // The sample jobs are created by the sample Superadmin, as the real rule would refuse.
    return found.created_by === users[0]?.id
      ? problem(403, 'self_approval_forbidden')
      : noContent();
  }),
  route('POST /jobs/:job_id/reject', noContent),
  route('GET /jobs/:job_id/logs', ({ params }) =>
    HttpResponse.json(page(jobLogs.filter((l) => l.job_id === params.job_id))),
  ),
];

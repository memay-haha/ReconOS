import type { MockRoute } from './helpers';
import { partBRoutes } from './part-b';
import { partCRoutes } from './part-c';
import { partDRoutes } from './part-d';
import { partERoutes } from './part-e';
import { sharedRoutes } from './shared';
import { stitchARoutes } from './stitch-a';
import { stitchBRoutes } from './stitch-b';
import { stitchDRoutes } from './stitch-d';
import { stitchERoutes } from './stitch-e';

export type { MockRoute } from './helpers';

/** Handlers are described, not built: registry.ts builds only the routes the
 * backend does not serve, so a mock for a live endpoint never exists. */
// Stitch pass routes come first: MSW answers with the first match, so a route redefined
// there replaces the older one in part-b..e and shared.
export const mockRoutes: readonly MockRoute[] = [
  ...stitchARoutes,
  ...stitchBRoutes,
  ...stitchDRoutes,
  ...stitchERoutes,
  ...sharedRoutes,
  ...partBRoutes,
  ...partCRoutes,
  ...partDRoutes,
  ...partERoutes,
];

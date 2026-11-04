import type { MockRoute } from './helpers';
import { partBRoutes } from './part-b';
import { partCRoutes } from './part-c';
import { partDRoutes } from './part-d';
import { partERoutes } from './part-e';
import { sharedRoutes } from './shared';

export type { MockRoute } from './helpers';

/** Handlers are described, not built: registry.ts builds only the routes the
 * backend does not serve, so a mock for a live endpoint never exists. */
export const mockRoutes: readonly MockRoute[] = [
  ...sharedRoutes,
  ...partBRoutes,
  ...partCRoutes,
  ...partDRoutes,
  ...partERoutes,
];

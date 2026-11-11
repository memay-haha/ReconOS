import { toolModule } from '../system/fixtures';

/** A `GET /tool-modules` row for the S18 tests. Not imported by any screen. */
export function moduleRow(
  id: string,
  name: string,
  group: string,
  enabled = true,
  overrides: Record<string, unknown> = {},
) {
  return {
    ...toolModule(id, name, group, enabled),
    title: `${name} title`,
    description: `${name} description`,
    runs_on: null,
    tools: [name],
    output_types: ['url'],
    param_schema: {},
    last_job_at: null,
    jobs_24h: 3,
    finding_count: 0,
    engine_status: null,
    disabled_reason: enabled ? null : 'off',
    estimated_seconds: null,
    ...overrides,
  };
}

export function moduleList(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    items,
    next_cursor: null,
    total: items.length,
    total_is_estimate: false,
    enabled_count: 3,
    disabled_count: 1,
    disabled_names: ['dalfox'],
    group_counts: { recon: 1, scan: 1, exploit: 2 },
    engines_bound: 1,
    installed_count: 3,
    ...extra,
  };
}

import { finding } from '../system/fixtures';

/** A `GET /findings` row for the S20 tests. Not imported by any screen. */
export function findingRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...finding(id),
    tool_module_name: 'nuclei',
    asset: {
      type: 'url',
      name: 'https://api.example.com/env',
      ip: '198.51.100.7',
      port: 443,
      service_name: 'https',
    },
    matcher: 'word: activeProfiles',
    ...overrides,
  };
}

/** `GET /findings/{finding_id}`: the row plus the D2 keys and the scope state. */
export function findingDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...findingRow(id),
    description: 'The actuator endpoint answers without authentication.',
    remediation: 'Expose only health and info.',
    request: 'GET /actuator/env HTTP/1.1\nHost: api.example.com\nAccept: application/json',
    response: 'HTTP/1.1 200 OK\n\n<script>alert(1)</script>',
    in_scope: true,
    scope_rule: '*.example.com',
    tags: [{ tag_id: 't1', key: 'env', value: 'prod' }],
    allowed_triage_statuses: ['confirmed', 'false_positive', 'duplicate'],
    ...overrides,
  };
}

const ZERO = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

export const SUMMARY = {
  total: 12,
  by_severity: { critical: 2, high: 3, medium: 4, low: 1, info: 2 },
  by_triage_status: {
    new: 5,
    confirmed: 3,
    false_positive: 1,
    duplicate: 1,
    reported: 1,
    resolved: 1,
  },
  by_program: [{ program_id: 'p1', name: 'Example Corp', count: 12 }],
  new_24h_by_severity: { ...ZERO, critical: 2 },
};

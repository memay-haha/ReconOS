import type { ReportDetail, ReportRow } from '@/lib/reports';

export const ROW: ReportRow = {
  id: 'r1',
  program_id: 'p1',
  program_name: 'acme-vdp',
  title: 'Exposed git config',
  status: 'draft',
  platform_report_ref: null,
  finding_count: 2,
  severity_counts: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
  created_by: 'u1',
  created_by_username: 'alice',
  created_at: '2026-11-13T01:00:00Z',
  updated_at: '2026-11-13T01:00:00Z',
  submitted_at: null,
};

function finding(id: string, name: string) {
  return {
    id,
    program_id: 'p1',
    program_name: 'acme-vdp',
    job_id: 'j1',
    raw_output_id: 'ro1',
    tool_module_name: 'nuclei',
    dedup_key: `nuclei:${id}`,
    name,
    template_id: 'git-config',
    severity: 'critical' as const,
    matched_at: 'https://a.example.com/.git/config',
    evidence: null,
    cve: [],
    matcher: null,
    asset: {
      type: 'url' as const,
      id: 'u1',
      name: 'https://a.example.com/.git/config',
      ip: null,
      port: 443,
      service_name: null,
    },
    triage_status: 'confirmed' as const,
    duplicate_of_id: null,
    triaged_by: null,
    triaged_by_username: null,
    triaged_at: null,
    first_seen_at: '2026-11-12T01:00:00Z',
    last_seen_at: '2026-11-12T01:00:00Z',
    tags: [],
    raw_output: {
      id: 'ro1',
      job_id: 'j1',
      filename: 'nuclei.jsonl',
      content_type: 'application/x-ndjson',
      size_bytes: 120,
      sha256: 'ab'.repeat(32),
      parse_status: 'parsed' as const,
      parse_error: null,
      created_at: '2026-11-12T01:00:00Z',
      parsed_at: '2026-11-12T01:00:01Z',
    },
  };
}

export const DETAIL: ReportDetail = {
  ...ROW,
  body: '## Impact\n\n<img src=x onerror=alert(1)>',
  findings: [finding('f1', '<script>alert(1)</script>'), finding('f2', 'Git config')],
};

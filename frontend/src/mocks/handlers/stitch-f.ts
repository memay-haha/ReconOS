import { HttpResponse } from 'msw';

import { SEVERITIES, type Severity } from '@/lib/programs';
import { TOOL_GROUPS, type ToolGroup } from '@/lib/tool-modules';
import { type FindingDetail, TRIAGE_STATUSES, type TriageStatus } from '@/lib/findings';

import { programs } from '../data/programs';
import { findingRows, toolModuleRows } from '../data/stitch-f';
import { type MockRoute, page, route } from './helpers';

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. Agent F: S18 and S20. */

function notFound() {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found' },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function zero<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** The list filters of `GET /findings`, shared by the list, summary and export. */
function filterFindings(query: URLSearchParams) {
  const severities = query.getAll('severity');
  const statuses = query.getAll('triage_status');
  const program = query.get('program_id');
  const domain = query.get('domain_id');
  const q = query.get('q')?.toLowerCase() ?? '';
  const ids = query.getAll('ids');
  return findingRows.filter(
    (f) =>
      (ids.length === 0 || ids.includes(f.id)) &&
      (severities.length === 0 || severities.includes(f.severity)) &&
      (statuses.length === 0 || statuses.includes(f.triage_status)) &&
      (program === null || f.program_id === program) &&
      (domain === null || f.domain_id === domain) &&
      (q === '' ||
        [f.name, f.template_id ?? '', f.matched_at ?? '', ...f.cve].some((v) =>
          v.toLowerCase().includes(q),
        )),
  );
}

const DETAIL_KEYS = [
  'description',
  'remediation',
  'request',
  'response',
  'in_scope',
  'scope_rule',
] as const;

/** A list row carries no detail keys: those come from `GET /findings/{finding_id}` only. */
function listRow(f: FindingDetail): Partial<FindingDetail> {
  const row: Partial<FindingDetail> = { ...f };
  for (const key of DETAIL_KEYS) delete row[key];
  return row;
}

export const stitchFRoutes: readonly MockRoute[] = [
  route('GET /tool-modules/stats', () =>
    HttpResponse.json({ jobs: 1420, jobs_prev: 1243, stalled: 0 }),
  ),
  route('GET /tool-modules', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const q = query.get('q')?.toLowerCase() ?? '';
    const group = query.get('group');
    const runsOn = query.get('runs_on');
    const enabled = query.get('is_enabled');
    const items = toolModuleRows.filter(
      (m) =>
        (q === '' || [m.name, m.title, m.description].some((v) => v.toLowerCase().includes(q))) &&
        (group === null || m.group === group) &&
        (runsOn === null || m.runs_on === runsOn) &&
        (enabled === null || String(m.is_enabled) === enabled),
    );
    const groupCounts = zero<ToolGroup>(TOOL_GROUPS);
    for (const m of toolModuleRows) groupCounts[m.group] += 1;
    const disabled = toolModuleRows.filter((m) => !m.is_enabled);
    return HttpResponse.json({
      ...page(items),
      enabled_count: toolModuleRows.length - disabled.length,
      disabled_count: disabled.length,
      disabled_names: disabled.map((m) => m.name),
      group_counts: groupCounts,
      engines_bound: 2,
      installed_count: toolModuleRows.filter((m) => m.is_enabled).length,
    });
  }),
  route('PATCH /tool-modules/:tool_module_id', async ({ params, request }) => {
    const found = toolModuleRows.find((m) => m.id === params.tool_module_id);
    if (found === undefined) return notFound();
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(found, body, { updated_at: new Date().toISOString() });
    if (typeof body.is_enabled === 'boolean') {
      Object.assign(found, { disabled_reason: body.is_enabled ? null : 'off' });
    }
    return HttpResponse.json(found);
  }),
  route('GET /findings/summary', ({ request }) => {
    const rows = filterFindings(new URL(request.url).searchParams);
    const bySeverity = zero<Severity>(SEVERITIES);
    const newBySeverity = zero<Severity>(SEVERITIES);
    const byStatus = zero<TriageStatus>(TRIAGE_STATUSES);
    const byProgram = new Map<string, number>();
    for (const f of rows) {
      bySeverity[f.severity] += 1;
      byStatus[f.triage_status] += 1;
      if (Date.now() - new Date(f.first_seen_at).getTime() < DAY_MS) newBySeverity[f.severity] += 1;
      byProgram.set(f.program_id, (byProgram.get(f.program_id) ?? 0) + 1);
    }
    return HttpResponse.json({
      total: rows.length,
      by_severity: bySeverity,
      by_triage_status: byStatus,
      by_program: [...byProgram].map(([programId, count]) => ({
        program_id: programId,
        name: programs.find((p) => p.id === programId)?.name ?? programId,
        count,
      })),
      new_24h_by_severity: newBySeverity,
    });
  }),
  route('GET /findings/export', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const rows = filterFindings(query);
    if (query.get('format') === 'md') {
      const text = rows
        .map(
          (f) =>
            `## ${f.name}\n\n- Severity: ${f.severity}\n- Template: ${f.template_id ?? '-'}\n- Matched at: ${f.matched_at ?? '-'}\n\n${f.description ?? ''}\n`,
        )
        .join('\n');
      return HttpResponse.text(text, {
        headers: { 'content-disposition': 'attachment; filename="findings.md"' },
      });
    }
    return HttpResponse.text(rows.map((f) => JSON.stringify(listRow(f))).join('\n'), {
      headers: { 'content-disposition': 'attachment; filename="findings.jsonl"' },
    });
  }),
  route('GET /findings', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const limit = Number(query.get('limit') ?? '50');
    const all = filterFindings(query).map(listRow);
    return HttpResponse.json({ ...page(all.slice(0, limit)), total: all.length });
  }),
  route('GET /findings/:finding_id', ({ params }) => {
    const found = findingRows.find((f) => f.id === params.finding_id);
    return found === undefined ? notFound() : HttpResponse.json(found);
  }),
  route('PATCH /findings/:finding_id', async ({ params, request }) => {
    const found = findingRows.find((f) => f.id === params.finding_id);
    if (found === undefined) return notFound();
    const body = (await request.json()) as {
      triage_status: TriageStatus;
      duplicate_of_id?: string | null;
    };
    Object.assign(found, body, { triaged_at: new Date().toISOString() });
    return HttpResponse.json(found);
  }),
  route('POST /findings/bulk-triage', async ({ request }) => {
    const body = (await request.json()) as { ids: string[]; triage_status: TriageStatus };
    for (const f of findingRows) {
      if (body.ids.includes(f.id)) Object.assign(f, { triage_status: body.triage_status });
    }
    return new HttpResponse(null, { status: 204 });
  }),
];

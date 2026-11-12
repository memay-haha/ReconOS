import { HttpResponse } from 'msw';

import { engines } from '../data/part-e';
import { programs, schedules } from '../data/stitch-d';
import { toolModuleRows } from '../data/stitch-f';
import { users } from '../data/users';
import { type MockRoute, page, route } from './helpers';

/** Mock routes added by the Stitch fidelity pass (docs/superpowers/specs/2026-11-11-stitch-fidelity-decisions.md).
 * One file per implementer so parallel edits never collide. Agent E: S12, S14, S15, S16, S17. */

const noContent = () => new HttpResponse(null, { status: 204 });

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// ---- S12 Users & Access Control ---------------------------------------------------------

const userRows = users.map((user, i) => ({
  ...user,
  active_user_session_count: [2, 1, 0][i] ?? 0,
  last_session_ip: ['192.0.2.45', '198.51.100.82', null][i] ?? null,
  last_seen_at: [minutesAgo(3), minutesAgo(45), null][i] ?? null,
}));

function roleCounts() {
  return {
    superadmin: userRows.filter((u) => u.role === 'superadmin').length,
    admin: userRows.filter((u) => u.role === 'admin').length,
    user: userRows.filter((u) => u.role === 'user').length,
  };
}

const sessionRows = [
  {
    id: '0b1f6c1e-5d0a-4e0b-9a52-000000000001',
    user_id: users[0]?.id ?? '',
    username: users[0]?.username,
    display_name: users[0]?.display_name,
    ip_address: '192.0.2.45',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0',
    created_at: minutesAgo(240),
    last_seen_at: minutesAgo(3),
    expires_at: minutesAgo(-480),
  },
  {
    id: '0b1f6c1e-5d0a-4e0b-9a52-000000000002',
    user_id: users[0]?.id ?? '',
    username: users[0]?.username,
    display_name: users[0]?.display_name,
    ip_address: '203.0.113.19',
    user_agent: 'Mozilla/5.0 (Macintosh) Safari/17.4',
    created_at: minutesAgo(120),
    last_seen_at: minutesAgo(18),
    expires_at: minutesAgo(-600),
  },
  {
    id: '0b1f6c1e-5d0a-4e0b-9a52-000000000003',
    user_id: users[1]?.id ?? '',
    username: users[1]?.username,
    display_name: users[1]?.display_name,
    ip_address: '198.51.100.82',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
    created_at: minutesAgo(300),
    last_seen_at: minutesAgo(45),
    expires_at: minutesAgo(-420),
  },
];

const permissions = [
  ['Manage accounts and roles', 'allow', 'deny', 'deny', null],
  ['Manage programs and scope', 'allow', 'allow', 'deny', null],
  ['Create recon jobs', 'allow', 'allow', 'limited', 'Assigned programs only'],
  ['Approve exploitation jobs', 'allow', 'allow', 'deny', 'Never the job creator'],
  ['Triage findings', 'allow', 'allow', 'limited', 'Assigned programs only'],
  ['Configure engines and tool modules', 'allow', 'deny', 'deny', null],
  ['Read system health', 'allow', 'allow', 'deny', null],
  ['Read audit log', 'allow', 'deny', 'deny', null],
].map(([action, superadmin, admin, user, note]) => ({ action, superadmin, admin, user, note }));

const s12Routes: MockRoute[] = [
  route('GET /users', ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const role = url.searchParams.get('role');
    const items = userRows.filter(
      (u) =>
        (role === null || u.role === role) &&
        (q === '' || `${u.username} ${u.display_name}`.toLowerCase().includes(q)),
    );
    return HttpResponse.json({
      ...page(items),
      role_counts: roleCounts(),
      locked_count: userRows.filter((u) => u.is_locked).length,
    });
  }),
  route('GET /user-sessions', () =>
    HttpResponse.json({
      ...page(sessionRows),
      account_count: new Set(sessionRows.map((s) => s.user_id)).size,
    }),
  ),
  route('DELETE /users/:user_id', noContent),
  route('POST /users/:user_id/revoke-sessions', noContent),
  route('POST /users/bulk-revoke-sessions', noContent),
  route('GET /users/export', () => {
    const head = 'id,username,display_name,role,is_locked,created_at,last_login_at';
    const lines = userRows.map((u) =>
      [
        u.id,
        u.username,
        u.display_name,
        u.role,
        u.is_locked,
        u.created_at,
        u.last_login_at ?? '',
      ].join(','),
    );
    return new HttpResponse([head, ...lines].join('\n'), {
      headers: {
        'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="accounts.csv"',
      },
    });
  }),
  route('GET /roles/permissions', () => HttpResponse.json({ items: permissions })),
];

// ---- S16 Osmedeus, S17 Vigolium ----------------------------------------------------------

const moduleRows = [
  ['cve-2024-deep-check', 'active', true],
  ['graphql-introspection', 'active', true],
  ['header-audit', 'passive', true],
  ['open-redirect', 'active', false],
  ['sqli-error-based', 'active', true],
  ['ssrf-detector', 'active', true],
  ['tls-weak-cipher', 'passive', true],
  ['xss-scanner', 'active', true],
].map(([name, kind, is_enabled]) => ({ name, kind, is_enabled, description: null }));

const s16Routes: MockRoute[] = [
  // P4: schedules whose tool module runs on the engine, with both names joined.
  route('GET /schedules', ({ request }) => {
    const engineId = new URL(request.url).searchParams.get('engine_id');
    const engineName = engines.find((e) => e.id === engineId)?.name;
    const rows = schedules
      .map((s) => ({
        ...s,
        module: toolModuleRows.find((m) => m.id === s.tool_module_id),
        program_name: programs.find((p) => p.id === s.program_id)?.name ?? '',
      }))
      .filter((s) => engineId === null || s.module?.runs_on === engineName)
      .map(({ module, ...s }) => ({ ...s, tool_module_name: module?.name ?? '' }));
    return HttpResponse.json(page(rows));
  }),
  route('GET /engines/:engine_id/modules', () => HttpResponse.json(page(moduleRows))),
  route('PATCH /engines/:engine_id/modules', async ({ request }) => {
    const body = (await request.json()) as { modules: { name: string; is_enabled: boolean }[] };
    for (const change of body.modules) {
      const row = moduleRows.find((m) => m.name === change.name);
      if (row !== undefined) row.is_enabled = change.is_enabled;
    }
    return HttpResponse.json(page(moduleRows));
  }),
  route('POST /engines/:engine_id/validate', () =>
    HttpResponse.json({
      ok: true,
      issues: [{ level: 'advisory', message: 'Health check latency 420 ms is above 300 ms.' }],
    }),
  ),
  route('POST /engines/:engine_id/verify-model', () => HttpResponse.json({ ok: true, issues: [] })),
];

export const stitchERoutes: readonly MockRoute[] = [...s12Routes, ...s16Routes];

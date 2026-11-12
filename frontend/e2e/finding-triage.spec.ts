import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  request,
  test,
} from '@playwright/test';

/**
 * Triage a finding (.claude/rules/testing.md). The finding goes the real way: a nuclei job is
 * created, the dispatcher marks it dispatched, this spec plays the worker over the worker API
 * and uploads a nuclei.jsonl raw output, the parse task turns it into a finding. No tool runs
 * and nothing reaches a target. Needs Backend API, frontend, dispatcher and the background
 * process (`celery ... -Q parse,schedule`): frontend/CLAUDE.md, backend/CLAUDE.md.
 */

const username = process.env.RECONOS_E2E_USERNAME ?? '';
const password = process.env.RECONOS_E2E_PASSWORD ?? '';
const baseURL = process.env.RECONOS_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
// The CSRF check wants the Origin a browser would send: docs/api/architecture.md.
const ORIGIN = { origin: new URL(baseURL).origin };

const RUN = Date.now().toString(36);
const HOST = `triage-${RUN}.example.com`;
const FINDING = `E2E Exposed Panel ${RUN}`;

test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (username === '' || password === '') {
    throw new Error(
      'Set RECONOS_E2E_USERNAME and RECONOS_E2E_PASSWORD to the account make bootstrap created.',
    );
  }
});

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const r = await response;
  if (!r.ok()) throw new Error(`${r.url()} answered ${r.status()}`);
  return (r.status() === 204 ? null : await r.json()) as T;
}

interface Seeded {
  readonly programId: string;
  readonly tokenId: string;
}

/** One nuclei result in the shape `nuclei -jsonl` writes, on a documentation domain. */
function nucleiLine(): string {
  return JSON.stringify({
    'template-id': `e2e-exposed-panel-${RUN}`,
    info: {
      name: FINDING,
      severity: 'high',
      description: 'The admin panel answers without authentication.',
      remediation: 'Put the panel behind authentication.',
      tags: ['panel'],
    },
    type: 'http',
    host: `https://${HOST}`,
    'matched-at': `https://${HOST}/admin`,
    'matcher-name': 'status-200',
    request: `GET /admin HTTP/1.1\r\nHost: ${HOST}\r\n\r\n`,
    response: 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<title>Admin</title>',
    timestamp: new Date().toISOString(),
  });
}

/** Program, scope rule, nuclei job, then the worker side, until the finding is listed. */
async function seedFinding(api: APIRequestContext): Promise<Seeded> {
  const program = await ok<{ id: string }>(
    api.post('/api/v1/programs', { headers: ORIGIN, data: { name: `e2e-triage-${RUN}` } }),
  );
  await ok(
    api.post(`/api/v1/programs/${program.id}/scope-rules`, {
      headers: ORIGIN,
      data: { scope_type: 'in_scope', rule_type: 'domain', value: HOST },
    }),
  );
  const modules = await ok<{ items: { id: string; name: string; is_enabled: boolean }[] }>(
    api.get('/api/v1/tool-modules?limit=200'),
  );
  const nuclei = modules.items.find((m) => m.name === 'nuclei');
  if (nuclei === undefined) throw new Error('tool module nuclei is not registered');
  if (!nuclei.is_enabled) {
    await ok(
      api.patch(`/api/v1/tool-modules/${nuclei.id}`, {
        headers: ORIGIN,
        data: { is_enabled: true },
      }),
    );
  }

  const worker = await ok<{ id: string }>(
    api.post('/api/v1/workers', { headers: ORIGIN, data: { name: `e2e-triage-${RUN}` } }),
  );
  const token = await ok<{ id: string; token: string }>(
    api.post(`/api/v1/workers/${worker.id}/tokens`, { headers: ORIGIN }),
  );
  const job = await ok<{ id: string }>(
    api.post('/api/v1/jobs', {
      headers: ORIGIN,
      data: { program_id: program.id, tool_module_id: nuclei.id, target: [HOST] },
    }),
  );

  // The dispatcher picks the job up on NOTIFY; poll until it is ready for a worker.
  await expect
    .poll(async () => (await ok<{ status: string }>(api.get(`/api/v1/jobs/${job.id}`))).status, {
      timeout: 30_000,
    })
    .toBe('dispatched');

  // The worker side carries a bearer token and no cookie, as workers/ does.
  const asWorker = await request.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${token.token}` },
  });
  try {
    await ok(
      asWorker.post('/api/v1/worker/heartbeat', {
        data: { tool_modules: ['nuclei'], tools: [{ name: 'nuclei', version: null }] },
      }),
    );
    await ok(asWorker.post(`/api/v1/worker/jobs/${job.id}/claim`));
    await ok(
      asWorker.put(`/api/v1/worker/jobs/${job.id}/raw-outputs/nuclei.jsonl`, {
        headers: { 'content-type': 'application/octet-stream' },
        data: Buffer.from(`${nucleiLine()}\n`),
      }),
    );
    await ok(
      asWorker.post(`/api/v1/worker/jobs/${job.id}/finish`, {
        data: { status: 'completed', status_reason: null, tool_version: null },
      }),
    );
  } finally {
    await asWorker.dispose();
  }

  // The parse task runs in the background process.
  await expect
    .poll(
      async () =>
        (
          await ok<{ items: unknown[] }>(
            api.get(`/api/v1/findings?program_id=${program.id}&limit=10`),
          )
        ).items.length,
      { timeout: 60_000 },
    )
    .toBe(1);
  return { programId: program.id, tokenId: token.id };
}

async function signIn(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/users$/);
  }).toPass({ timeout: 20_000 });
}

let seeded: Seeded | null = null;

test.afterAll(async ({ browser }) => {
  if (seeded === null) return;
  // Leave no live worker token behind; the archived program keeps the audit trail.
  const page = await browser.newPage();
  await signIn(page);
  await page.request.post(`/api/v1/worker-tokens/${seeded.tokenId}/revoke`, { headers: ORIGIN });
  await page.request.post(`/api/v1/programs/${seeded.programId}/archive`, { headers: ORIGIN });
  await page.close();
});

test('triages a parsed nuclei finding on S20', async ({ page }) => {
  await signIn(page);
  seeded = await seedFinding(page.request);

  await page.goto(`/findings?program_id=${seeded.programId}`);
  const row = page.getByRole('row').filter({ hasText: FINDING });
  await expect(row).toBeVisible();
  await expect(row.getByText('New', { exact: true })).toBeVisible();

  // Detail: the D2 keys from the parser, as text, and the raw output it came from.
  await row.getByRole('button', { name: `Open ${FINDING}` }).click();
  const dialog = page.getByRole('dialog', { name: FINDING });
  await expect(dialog.getByText('The admin panel answers without authentication.')).toBeVisible();
  await expect(dialog.getByText(`https://${HOST}/admin`)).toBeVisible();
  const raw = dialog.getByRole('link', { name: 'Download raw output' });
  await expect(raw).toHaveAttribute('href', /\/api\/v1\/raw-outputs\/[0-9a-f-]+\/content$/);
  const evidence = await page.request.get((await raw.getAttribute('href')) ?? '');
  expect(evidence.ok()).toBe(true);
  expect(await evidence.text()).toContain(`e2e-exposed-panel-${RUN}`);

  // Confirm from the dialog.
  await dialog.getByRole('button', { name: 'Confirmed' }).click();
  await dialog.getByRole('button', { name: 'Save Triage Status' }).click();
  await expect(dialog.getByText('Triage saved.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmed (current)' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(row.getByText('Confirmed', { exact: true })).toBeVisible();

  // The row menu walks the lifecycle on: Reported, then Resolved.
  const menu = row.getByRole('button', { name: `Change status of ${FINDING}` });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Reported' }).click();
  await expect(row.getByText('Reported', { exact: true })).toBeVisible();
  await menu.click();
  await page.getByRole('menuitem', { name: 'Resolved' }).click();
  await expect(row.getByText('Resolved', { exact: true })).toBeVisible();

  // Resolved cannot go to False positive: the backend refuses and the row stays.
  await menu.click();
  await page.getByRole('menuitem', { name: 'False positive' }).click();
  await expect(
    page.getByText('The finding cannot move to this triage status from its current one.'),
  ).toBeVisible();
  await expect(row.getByText('Resolved', { exact: true })).toBeVisible();

  // The bulk bar reopens it as Confirmed.
  await row.getByRole('checkbox', { name: `Select ${FINDING}` }).check();
  await page.getByRole('button', { name: 'Mark confirmed' }).click();
  await expect(page.getByText('Marked 1 finding confirmed.')).toBeVisible();
  await expect(row.getByText('Confirmed', { exact: true })).toBeVisible();

  // The server kept it, and the audit log has one entry per move.
  const after = await ok<{ items: { id: string; triage_status: string }[] }>(
    page.request.get(`/api/v1/findings?program_id=${seeded.programId}`),
  );
  expect(after.items.map((f) => f.triage_status)).toEqual(['confirmed']);
  const findingId = after.items[0]?.id;
  const audit = await ok<{ items: { resource_id: string | null; detail: { to: string } }[] }>(
    page.request.get('/api/v1/audit-logs?action=finding_triaged&limit=100'),
  );
  expect(
    audit.items
      .filter((e) => e.resource_id === findingId)
      .map((e) => e.detail.to)
      .reverse(),
  ).toEqual(['confirmed', 'reported', 'resolved', 'confirmed']);
});

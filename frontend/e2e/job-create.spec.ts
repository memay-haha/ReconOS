import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  test,
} from '@playwright/test';

/**
 * Create a job from the UI (.claude/rules/testing.md). The bootstrap Superadmin opens Run Scan
 * on S11 for a program with one In-Scope rule. A target outside the scope is refused by the
 * backend and no job is made (G5); the in-scope target becomes a nuclei job that S10 lists.
 * No worker claims it, so no tool runs and nothing reaches a target; the program is archived
 * after. Needs Backend API, frontend and the dispatcher that `make backend` starts.
 */

const username = process.env.RECONOS_E2E_USERNAME ?? '';
const password = process.env.RECONOS_E2E_PASSWORD ?? '';
const baseURL = process.env.RECONOS_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
// The CSRF check wants the Origin a browser would send: docs/api/architecture.md.
const ORIGIN = { origin: new URL(baseURL).origin };

const RUN = Date.now().toString(36);
const PROGRAM = `e2e-job-${RUN}`;
const HOST = `job-${RUN}.example.com`;
const OUTSIDE = `outside-${RUN}.example.org`;

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

async function signIn(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }).toPass({ timeout: 20_000 });
}

interface JobRow {
  readonly id: string;
  readonly status: string;
  readonly target: readonly string[];
}

async function jobsOf(api: APIRequestContext, programId: string): Promise<readonly JobRow[]> {
  return (await ok<{ items: JobRow[] }>(api.get(`/api/v1/jobs?program_id=${programId}&limit=10`)))
    .items;
}

/** Program with one In-Scope rule, and nuclei enabled. */
async function seed(api: APIRequestContext): Promise<string> {
  const program = await ok<{ id: string }>(
    api.post('/api/v1/programs', { headers: ORIGIN, data: { name: PROGRAM } }),
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
  return program.id;
}

let programId: string | null = null;

test.afterAll(async ({ browser }) => {
  if (programId === null) return;
  // Archiving cancels the job at the next dispatcher round if it is still queued.
  const page = await browser.newPage();
  await signIn(page);
  await page.request.post(`/api/v1/programs/${programId}/archive`, { headers: ORIGIN });
  await page.close();
});

test('creates a scan job from Run Scan on S11, and the backend refuses an out-of-scope target', async ({
  page,
}) => {
  await signIn(page);
  programId = await seed(page.request);

  await page.goto('/manage');
  await page.getByLabel('Filter programs').fill(PROGRAM);
  await page.getByRole('button', { name: `Run Scan on ${PROGRAM}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Run Scan' });
  await dialog.getByLabel('Tool module').selectOption({ label: 'nuclei' });
  const targets = dialog.getByLabel('Targets, one per line');

  // Outside the scope: the backend says no, the dialog stays and nothing is created.
  await targets.fill(OUTSIDE);
  await dialog.getByRole('button', { name: 'Create job' }).click();
  await expect(
    dialog.getByText('A target is outside the program scope, or matches an Out-of-Scope rule.'),
  ).toBeVisible();
  expect(await jobsOf(page.request, programId)).toHaveLength(0);

  // In scope: the job is made and the dialog closes.
  await targets.fill(HOST);
  await dialog.getByRole('button', { name: 'Create job' }).click();
  await expect(dialog).toHaveCount(0);

  const jobs = await jobsOf(page.request, programId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.target).toEqual([HOST]);
  // Queued, or already handed out by the dispatcher `make backend` runs.
  expect(['queued', 'dispatched']).toContain(jobs[0]?.status);

  // S10 lists it.
  await page.goto('/queue');
  await expect(page.getByRole('row').filter({ hasText: HOST })).toBeVisible();
});

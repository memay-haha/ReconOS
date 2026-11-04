import { expect, type Page, test } from '@playwright/test';

const username = process.env.RECONOS_E2E_USERNAME ?? '';
const password = process.env.RECONOS_E2E_PASSWORD ?? '';

// Fail loudly: a silently skipped end-to-end test is worse than none.
test.beforeAll(() => {
  if (username === '' || password === '') {
    throw new Error(
      'Set RECONOS_E2E_USERNAME and RECONOS_E2E_PASSWORD to the account make bootstrap created.',
    );
  }
});

// The click can land before React hydrates; the form then posts natively and the
// settled check fails. toPass retries the whole attempt instead of hoping.
async function signIn(page: Page, secret: string, settled: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu').fill(secret);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await settled();
  }).toPass({ timeout: 20_000 });
}

// A trace would record the typed password in test-results/, a credential on disk.
test.use({ trace: 'off' });

// Tests run in file order on one worker. The wrong-password case is LAST so its
// failed attempt cannot lock the account out of the sign-ins before it, and a
// successful sign-in resets the per-account failure counter for the next run.
test.describe.configure({ mode: 'serial' });

test('sends an anonymous visitor from the users screen to the sign in screen', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});

test('signs in, lands on the users screen and signs out again', async ({ page }) => {
  await signIn(page, password, () => expect(page).toHaveURL(/\/users$/));
  await expect(page.getByRole('heading', { name: 'Tài khoản và phân quyền' })).toBeVisible();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The cookie is gone, so the guarded screen refuses again.
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});

const WRONG_PASSWORD = 'this password is wrong';

test('the sign in form posts, and an unhydrated submit leaves the credentials out of the URL', async ({
  browser,
}) => {
  // Without JavaScript React never takes over, so the submit is the browser's own:
  // the exact failure that once put the credentials in the query string.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/login');
  await expect(page.locator('form')).toHaveAttribute('method', 'post');
  await page.getByLabel('Tên đăng nhập').fill('e2e-unhydrated-user');
  await page.getByLabel('Mật khẩu').fill(WRONG_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForLoadState('load');
  expect(page.url()).not.toContain('username=');
  expect(page.url()).not.toContain('password=');
  await context.close();
});

test('rejects a wrong password with the shared message', async ({ page }) => {
  // Next adds its own route announcer with role=alert, so match on the sentence.
  await signIn(page, WRONG_PASSWORD, () =>
    expect(
      page.getByRole('alert').filter({ hasText: 'Tên đăng nhập hoặc mật khẩu không đúng' }),
    ).toBeVisible(),
  );
  await expect(page).toHaveURL(/\/login$/);
});

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

async function signIn(page: Page, secret: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill(secret);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

// Tests run in file order on one worker. The wrong-password case is LAST so its
// failed attempt cannot lock the account out of the sign-ins before it, and a
// successful sign-in resets the per-account failure counter for the next run.
test.describe.configure({ mode: 'serial' });

test('sends an anonymous visitor from the users screen to the sign in screen', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});

test('signs in, lands on the users screen and signs out again', async ({ page }) => {
  await signIn(page, password);
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'Tài khoản và phân quyền' })).toBeVisible();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The cookie is gone, so the guarded screen refuses again.
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login$/);
});

test('rejects a wrong password with the shared message', async ({ page }) => {
  await signIn(page, 'this password is wrong');
  // Next adds its own route announcer with role=alert, so match on the sentence.
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tên đăng nhập hoặc mật khẩu không đúng' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

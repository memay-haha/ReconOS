import { expect, test } from '@playwright/test';

test('the backend healthcheck answers without a session', async ({ request }) => {
  const response = await request.get('/api/v1/health');

  expect(response.status()).toBe(204);
});

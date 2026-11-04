import { describe, expect, it } from 'vitest';

import { ApiError } from './api-client';
import { shouldRetryQuery } from './query-provider';

function apiError(status: number): ApiError {
  return new ApiError(status, { code: 'x', title: 'x' }, null);
}

describe('shouldRetryQuery', () => {
  it('does not retry a 401', () => {
    expect(shouldRetryQuery(0, apiError(401))).toBe(false);
  });
  it('retries a 500 up to two times', () => {
    expect(shouldRetryQuery(0, apiError(500))).toBe(true);
    expect(shouldRetryQuery(2, apiError(500))).toBe(false);
  });
  it('retries a network failure without throwing', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});

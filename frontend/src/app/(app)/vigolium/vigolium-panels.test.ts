import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { moduleErrorText } from './vigolium-panels';

describe('moduleErrorText', () => {
  it('explains the last module of a kind cannot be switched off', () => {
    const error = new ApiError(
      422,
      { code: 'validation_error', errors: [{ field: 'modules', code: 'module_required' }] },
      null,
    );
    expect(moduleErrorText(error)).toBe('Keep at least one active and one passive module enabled.');
  });

  it('falls back to a retry hint for any other failure', () => {
    expect(moduleErrorText(new ApiError(502, { code: 'engine_unavailable' }, null))).toBe(
      'Could not change the module. Try again later.',
    );
    expect(moduleErrorText(new Error('network'))).toBe(
      'Could not change the module. Try again later.',
    );
  });
});

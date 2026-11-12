// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { fieldErrorText } from './field-error-text';

describe('fieldErrorText', () => {
  it('words a wrong current password', () => {
    expect(fieldErrorText('current_password_incorrect')).toBe('Current password is incorrect.');
  });

  it('writes the password rules in English', () => {
    expect(fieldErrorText('password_too_weak')).toMatch(/easy to guess/);
    expect(fieldErrorText('password_too_short')).toBe('Password is too short.');
    expect(fieldErrorText('password_too_long')).toBe('Password is too long.');
  });

  it('writes the Pydantic failure types in English', () => {
    expect(fieldErrorText('missing')).toBe('This field is required.');
    expect(fieldErrorText('string_too_short')).toBe('Value is too short.');
    expect(fieldErrorText('string_too_long')).toBe('Value is too long.');
    expect(fieldErrorText('enum')).toMatch(/allowed list/);
  });

  it('words every scope value code the backend raises', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../backend/app/scope/matching.py', import.meta.url)),
      'utf8',
    );
    const codes = [...source.matchAll(/InvalidScopeValueError\("(\w+)"\)/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) expect(fieldErrorText(code ?? ''), code).not.toBe('Invalid value.');
  });

  it('falls back instead of showing the raw code to the reader', () => {
    expect(fieldErrorText('a_code_added_next_year')).toBe('Invalid value.');
  });

  it('does not read inherited object keys as codes', () => {
    expect(fieldErrorText('toString')).toBe('Invalid value.');
    expect(fieldErrorText('__proto__')).toBe('Invalid value.');
    expect(fieldErrorText('constructor')).toBe('Invalid value.');
  });
});

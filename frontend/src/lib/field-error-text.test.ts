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

  it('falls back instead of showing the raw code to the reader', () => {
    expect(fieldErrorText('a_code_added_next_year')).toBe('Invalid value.');
  });

  it('does not read inherited object keys as codes', () => {
    expect(fieldErrorText('toString')).toBe('Invalid value.');
    expect(fieldErrorText('__proto__')).toBe('Invalid value.');
    expect(fieldErrorText('constructor')).toBe('Invalid value.');
  });
});

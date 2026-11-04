import { describe, expect, it } from 'vitest';

import { fieldErrorText } from './field-error-text';

describe('fieldErrorText', () => {
  it('writes the password rules in Vietnamese', () => {
    expect(fieldErrorText('password_too_weak')).toMatch(/dễ đoán/);
    expect(fieldErrorText('password_too_short')).toBe('Mật khẩu quá ngắn.');
    expect(fieldErrorText('password_too_long')).toBe('Mật khẩu quá dài.');
  });

  it('writes the Pydantic failure types in Vietnamese', () => {
    expect(fieldErrorText('missing')).toBe('Chưa nhập trường này.');
    expect(fieldErrorText('string_too_short')).toBe('Giá trị quá ngắn.');
    expect(fieldErrorText('string_too_long')).toBe('Giá trị quá dài.');
    expect(fieldErrorText('enum')).toMatch(/danh sách/);
  });

  it('falls back instead of showing the raw code to the reader', () => {
    expect(fieldErrorText('a_code_added_next_year')).toBe('Giá trị không hợp lệ.');
  });

  it('does not read inherited object keys as codes', () => {
    expect(fieldErrorText('toString')).toBe('Giá trị không hợp lệ.');
    expect(fieldErrorText('__proto__')).toBe('Giá trị không hợp lệ.');
    expect(fieldErrorText('constructor')).toBe('Giá trị không hợp lệ.');
  });
});

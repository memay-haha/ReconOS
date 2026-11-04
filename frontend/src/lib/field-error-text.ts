/** The backend reports which field failed and why, as a machine code:
 * docs/api/architecture.md. The Vietnamese wording lives here, in one place,
 * so every form says the same thing about the same failure. */
const TEXT: ReadonlyMap<string, string> = new Map([
  // Raised by backend/app/core/security.py
  ['password_too_short', 'Mật khẩu quá ngắn.'],
  ['password_too_long', 'Mật khẩu quá dài.'],
  ['password_too_weak', 'Mật khẩu dễ đoán. Dùng mật khẩu dài hơn và ít quy luật hơn.'],
  // Pydantic reports these as the failure type
  ['missing', 'Chưa nhập trường này.'],
  ['string_too_short', 'Giá trị quá ngắn.'],
  ['string_too_long', 'Giá trị quá dài.'],
  ['enum', 'Giá trị không nằm trong danh sách cho phép.'],
]);

// The backend will add codes this frontend has not seen. A raw code is never shown.
const FALLBACK = 'Giá trị không hợp lệ.';

export function fieldErrorText(code: string): string {
  return TEXT.get(code) ?? FALLBACK;
}

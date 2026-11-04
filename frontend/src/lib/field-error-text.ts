/** The backend reports which field failed and why, as a machine code:
 * docs/api/architecture.md. The English wording lives here, in one place,
 * so every form says the same thing about the same failure. */
const TEXT: ReadonlyMap<string, string> = new Map([
  // Raised by backend/app/core/security.py
  ['password_too_short', 'Password is too short.'],
  ['password_too_long', 'Password is too long.'],
  ['password_too_weak', 'Password is easy to guess. Use something longer and less predictable.'],
  // Pydantic reports these as the failure type
  ['missing', 'This field is required.'],
  ['string_too_short', 'Value is too short.'],
  ['string_too_long', 'Value is too long.'],
  ['enum', 'Value is not in the allowed list.'],
]);

// The backend will add codes this frontend has not seen. A raw code is never shown.
const FALLBACK = 'Invalid value.';

export function fieldErrorText(code: string): string {
  return TEXT.get(code) ?? FALLBACK;
}

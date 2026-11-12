/** The backend reports which field failed and why, as a machine code:
 * docs/api/architecture.md. The English wording lives here, in one place,
 * so every form says the same thing about the same failure. */
const TEXT: ReadonlyMap<string, string> = new Map([
  // Raised by backend/app/core/security.py
  ['password_too_short', 'Password is too short.'],
  ['password_too_long', 'Password is too long.'],
  ['password_too_weak', 'Password is easy to guess. Use something longer and less predictable.'],
  // Raised by backend/app/user/service.py
  ['current_password_incorrect', 'Current password is incorrect.'],
  // Raised by backend/app/scope/matching.py for a scope rule value or a target
  ['invalid_length', 'Value is empty or too long.'],
  ['not_ascii', 'Use ASCII only. Enter an internationalised domain in its xn-- form.'],
  ['control_character', 'Value contains spaces or control characters.'],
  ['invalid_domain', 'Not a valid domain.'],
  ['invalid_ip', 'Not a valid IP or CIDR. A CIDR must have no host bits set.'],
  ['invalid_url', 'Not a valid URL.'],
  ['invalid_path', 'URL path is not valid.'],
  ['encoded_slash', 'URL path must not contain an encoded slash or backslash.'],
  ['unsupported_scheme', 'URL must start with http:// or https://.'],
  ['credentials_in_url', 'URL must not contain a user name or password.'],
  ['invalid_port', 'URL port is not valid.'],
  ['wildcard_target', 'A target cannot be a wildcard.'],
  ['wrong_rule_form', 'Value does not match the selected rule type.'],
  ['query_in_rule', 'A URL rule cannot contain a query or fragment.'],
  // Raised by backend/app/program/schemas.py and service.py
  ['url_invalid', 'Enter a URL starting with http:// or https://.'],
  [
    'proxy_url_invalid',
    'Enter a proxy URL like socks5://host:1080 or http://user:pass@host:3128, with no path.',
  ],
  ['null_not_allowed', 'This field cannot be empty.'],
  ['role_not_assignable', 'Only accounts with the User role are assigned to programs.'],
  ['not_found', 'The selected item no longer exists.'],
  // Raised by backend/app/finding/service.py: the move is not in the triage lifecycle
  ['invalid_transition', 'The finding cannot move to this triage status from its current one.'],
  ['reported_by_report', 'A finding becomes reported only when a report holding it is submitted.'],
  // Raised by backend/app/report/service.py
  ['not_confirmed', 'Only confirmed findings can go into a report.'],
  ['report_submitted', 'A submitted report keeps only its platform report ID editable.'],
  // Raised by backend/app/core/system_setting.py for a threshold
  ['out_of_range', 'Value is outside the allowed range.'],
  ['setting_conflict', 'Value conflicts with a related threshold.'],
  ['int_type', 'Enter a whole number.'],
  // 409 conflict names the field that clashes with an existing row
  ['already_exists', 'This value already exists.'],
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

import type { TokenRow } from './token-table.generated';

const TEXT_BASE = /^text-[a-z]+(-[a-z]+)*$/;

/**
 * A type role is a named voice a screen writes in: the Token Table gives it a font family
 * (`font-<role>`) next to its size (`text-<role>`). A `text-*` row with no font row is a
 * bare size, such as the icon size, and is not a role.
 */
export function typeRoles(rows: readonly TokenRow[]): string[] {
  const names = new Set(rows.map((row) => row.name));
  return rows
    .filter((row) => TEXT_BASE.test(row.name) && names.has(row.name.replace(/^text-/, 'font-')))
    .map((row) => row.name.replace(/^text-/, ''));
}

/**
 * The `text-*` rows that are deliberately bare sizes. A new size is added here on purpose; a
 * role whose `font-*` row is missing is then caught by a test instead of silently dropping out.
 */
export const KNOWN_SIZES: readonly string[] = ['icon'];

/** `text-*` sizes that are not roles. */
export function typeSizes(rows: readonly TokenRow[]): string[] {
  const roles = new Set(typeRoles(rows));
  return rows
    .filter((row) => TEXT_BASE.test(row.name) && !roles.has(row.name.replace(/^text-/, '')))
    .map((row) => row.name.replace(/^text-/, ''));
}

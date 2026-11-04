/** One page of a list endpoint, shaped like Page[ItemT] in backend/app/core/pagination.py. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export type QueryValue = string | number | boolean | null | undefined | readonly string[];

/** Builds `path?a=1&b=2`. An absent filter is absent from the URL, never an empty value,
 * and a list repeats the parameter: docs/api/architecture.md. */
export function withQuery(path: string, params: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value as readonly string[]) search.append(key, item);
    } else {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}

'use client';

import { type ReadonlyURLSearchParams, useSearchParams } from 'next/navigation';

/** One query parameter of the page URL, or null. Lists read their initial filter from it, so
 * a link such as `/domains?program_id=…` from S09 opens the list already narrowed. Outside
 * the App Router (unit tests) there are no search params, hence the null check. */
export function useQueryParam(name: string): string | null {
  const params = useSearchParams() as ReadonlyURLSearchParams | null;
  const value = params?.get(name) ?? null;
  return value === '' ? null : value;
}

'use client';

import { useCallback, useMemo } from 'react';

import { type ProgramRow, usePrograms } from '@/lib/programs';

/** Programs for the filter select and for naming the program of each row. One page of 200
 * covers every program an operator handles; the API caps a page there. */
export function useProgramOptions(): {
  programs: readonly ProgramRow[];
  nameOf: (programId: string) => string;
} {
  const query = usePrograms({ sort: 'name', limit: 200 });
  const programs = useMemo(() => query.data?.items ?? [], [query.data]);
  const names = useMemo(() => new Map(programs.map((p) => [p.id, p.name])), [programs]);
  // Before the list arrives, or for a program the account cannot see, show a short id.
  const nameOf = useCallback(
    (programId: string) => names.get(programId) ?? programId.slice(0, 8),
    [names],
  );
  return { programs, nameOf };
}

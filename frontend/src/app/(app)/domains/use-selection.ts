'use client';

import { useCallback, useMemo, useState } from 'react';

import type { ScanAsset } from './run-scan-button';

/** Rows picked for a bulk action, keyed by asset id. A screen clears it whenever the rows on
 * screen change: a selection the reader can no longer see must not reach a job. */
export function useSelection() {
  const [picked, setPicked] = useState<ReadonlyMap<string, ScanAsset>>(new Map());

  const toggle = useCallback((id: string, asset: ScanAsset) => {
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, asset);
      return next;
    });
  }, []);

  const setMany = useCallback(
    (entries: ReadonlyArray<readonly [string, ScanAsset]>, select: boolean) => {
      setPicked((current) => {
        const next = new Map(current);
        for (const [id, asset] of entries) {
          if (select) next.set(id, asset);
          else next.delete(id);
        }
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => setPicked(new Map()), []);
  const ids = useMemo(() => new Set(picked.keys()), [picked]);
  const assets = useMemo(() => Array.from(picked.values()), [picked]);

  return { ids, assets, toggle, setMany, clear };
}

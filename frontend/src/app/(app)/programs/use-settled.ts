'use client';

import { useEffect, useState } from 'react';

/** Waits for the reader to stop typing before a list query changes (S08, S10, S11 search). */
export function useSettled(value: string, delayMs = 250): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

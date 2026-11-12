/** A link taken from stored data is followed only when it is plain http or https, so a
 * `javascript:` URL saved in a program can never run: docs/superpowers/specs decision log. */
export function safeHref(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Last eight characters of a uuid, for a column that only needs to tell rows apart. The
 * first eight of a UUIDv7 are a timestamp prefix, so rows created close together share them. */
export function shortId(id: string): string {
  return id.slice(-8);
}

/** Who created a job: a schedule (`created_by` null), the reader, or another account. */
export function creatorLabel(createdBy: string | null, meId: string | null): string {
  if (createdBy === null) return 'Schedule';
  if (createdBy === meId) return 'You';
  return shortId(createdBy);
}

/** How long a job ran, from `started_at` to `finished_at`. A dash until both exist. */
export function durationOf(startedAt: string | null, finishedAt: string | null): string {
  if (startedAt === null || finishedAt === null) return '-';
  const seconds = Math.max(
    0,
    Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${seconds}s`;
}

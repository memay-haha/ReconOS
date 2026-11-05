/** "12s ago", "4m ago", "3h ago", "2d ago", as the S02 feed writes time. The exact
 * dd/mm/yyyy moment goes in the element's title beside it. */
export function formatAgo(value: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

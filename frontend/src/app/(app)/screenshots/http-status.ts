/** HTTP status display shared by the gallery card (S06) and the detail page (S07). */

export type StatusClass = 'none' | 'ok' | 'other' | 'client' | 'server';

/** Chip tone by HTTP status class, as the mockup colours 2xx, 4xx and 5xx. */
export const STATUS_TONE: Readonly<Record<StatusClass, string>> = {
  none: 'border-border-strong bg-surface-3 text-fg-muted',
  ok: 'border-good-bd bg-good-soft text-good',
  other: 'border-info-bd bg-info-soft text-info',
  client: 'border-warn-bd bg-warn-soft text-warn',
  server: 'border-crit-bd bg-crit-soft text-crit',
};

export const STATUS_DOT: Readonly<Record<StatusClass, string>> = {
  none: 'bg-fg-muted',
  ok: 'bg-good',
  other: 'bg-info',
  client: 'bg-warn',
  server: 'bg-crit',
};

/** The mockup prints the reason phrase next to the code ("200 OK"). The API only stores
 * the code, so the phrase comes from the standard table; unknown codes show alone. */
const REASON: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export function statusClass(code: number | null): StatusClass {
  if (code === null) return 'none';
  if (code >= 500) return 'server';
  if (code >= 400) return 'client';
  return code >= 200 && code < 300 ? 'ok' : 'other';
}

export function statusText(code: number | null): string {
  if (code === null) return 'No status';
  const reason = REASON[code];
  return reason === undefined ? String(code) : `${code} ${reason}`;
}

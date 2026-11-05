import { ApiError } from '@/lib/api-client';

/** One sentence per failure the backend can report on a part B screen. The backend `title`
 * is never shown: frontend/CLAUDE.md. `fallback` names what failed, in the screen's words. */
export function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError
      ? 'Cannot reach the server. Check your connection and try again.'
      : fallback;
  }
  switch (error.code) {
    case 'self_approval_forbidden':
      return 'You created this job, so another account must approve or reject it.';
    case 'forbidden':
      return 'Your role does not allow this action.';
    case 'not_found':
      return 'This item does not exist, or you have no access to it.';
    case 'conflict':
      return 'This change conflicts with the current state. Reload and try again.';
    case 'rate_limited':
      return 'Too many requests. Wait a moment and try again.';
    default:
      return fallback;
  }
}

/** A 404 from a detail endpoint: the item is missing or outside the reader's programs. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

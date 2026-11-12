import type { ReportStatus } from '@/lib/reports';

export const REPORT_STATUS_TONE: Readonly<Record<ReportStatus, string>> = {
  draft: 'bg-neutral-soft text-fg-muted border-neutral-bd',
  submitted: 'bg-info-soft text-info border-info-bd',
};

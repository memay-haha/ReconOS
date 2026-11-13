import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Alert } from '@/lib/alerts';

import { AlertBell } from './alert-bell';

const ALERT: Alert = {
  id: 'a1',
  alert_type: 'cert_expiring',
  message: 'TLS certificate of https://auth.example.com expires in 6 days',
  program_id: 'p1',
  finding_id: null,
  job_id: null,
  schedule_id: null,
  created_at: '2026-11-04T02:30:00Z',
  is_read: false,
};

function wrap(props: Partial<Parameters<typeof AlertBell>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onMarkRead: vi.fn(),
    onMarkAllRead: vi.fn(),
  };
  render(
    <AlertBell
      unread={1}
      alerts={[ALERT]}
      loading={false}
      failed={false}
      markFailed={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('AlertBell', () => {
  it('names the unread count on the bell', () => {
    wrap({ unread: 3 });
    expect(screen.getByRole('button', { name: 'Alerts, 3 unread' })).toBeInTheDocument();
  });

  it('opens a panel of alerts, the message as text, the time as dd/mm/yyyy HH:mm', async () => {
    const { onOpen } = wrap();
    await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }));
    expect(onOpen).toHaveBeenCalled();
    const panel = screen.getByRole('dialog', { name: 'Alerts' });
    expect(panel).toHaveTextContent('TLS certificate expiring');
    expect(panel).toHaveTextContent(ALERT.message);
    expect(panel).toHaveTextContent('04/11/2026 09:30');
    expect(screen.getByRole('link', { name: /TLS certificate/ })).toHaveAttribute(
      'href',
      '/programs/p1',
    );
  });

  it('labels a failed schedule run and links to the Scope tab that lists schedules', async () => {
    wrap({
      alerts: [
        {
          ...ALERT,
          alert_type: 'schedule_run_failed',
          message: 'Scheduled nuclei on a.example.com did not run: target_out_of_scope',
          schedule_id: 's1',
        },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }));
    expect(screen.getByRole('link', { name: /Scheduled scan failed/ })).toHaveAttribute(
      'href',
      '/programs/p1?tab=scope',
    );
  });

  it('marks one alert and all alerts read', async () => {
    const { onMarkRead, onMarkAllRead } = wrap();
    await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Mark read/ }));
    expect(onMarkRead).toHaveBeenCalledWith('a1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it('disables Mark all read with nothing unread, and says when the list is empty', async () => {
    wrap({ unread: 0, alerts: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    expect(screen.getByText('No alerts.')).toBeInTheDocument();
  });
});

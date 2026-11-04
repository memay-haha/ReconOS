import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuditLogRow } from '@/lib/audit-logs';

import { AuditTable } from './audit-table';

const ROW: AuditLogRow = {
  id: 'a1',
  user_id: 'u-1',
  worker_id: null,
  action: 'user_created',
  resource_type: 'user',
  resource_id: '2',
  detail: null,
  ip_address: '203.0.113.9',
  created_at: '2026-11-04T01:05:00Z',
};

function bodyRow(index: number): HTMLElement {
  return screen.getAllByRole('row')[index + 1] as HTMLElement;
}

describe('AuditTable', () => {
  it('renders one row per entry with its columns', () => {
    render(<AuditTable rows={[ROW, { ...ROW, id: 'a2', action: 'login_failed' }]} />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    const first = within(bodyRow(0));
    expect(first.getByText('04/11/2026 08:05')).toBeInTheDocument();
    expect(first.getByText('u-1')).toBeInTheDocument();
    expect(first.getByText('user 2')).toBeInTheDocument();
    expect(first.getByText('203.0.113.9')).toBeInTheDocument();
  });

  it('reads a row with neither user nor worker as a system action', () => {
    render(<AuditTable rows={[{ ...ROW, user_id: null, worker_id: null }]} />);
    expect(within(bodyRow(0)).getByText('System')).toBeInTheDocument();
  });

  it('names a worker actor as a worker, not as the system', () => {
    render(<AuditTable rows={[{ ...ROW, user_id: null, worker_id: 'w-7' }]} />);
    const row = within(bodyRow(0));
    expect(row.getByText('w-7')).toBeInTheDocument();
    expect(row.queryByText('System')).toBeNull();
  });

  it('fills missing resource and address instead of leaving blank cells', () => {
    render(
      <AuditTable rows={[{ ...ROW, resource_type: null, resource_id: null, ip_address: null }]} />,
    );
    const row = within(bodyRow(0));
    expect(row.getByText('No resource attached')).toBeInTheDocument();
    expect(row.getByText('Address unknown')).toBeInTheDocument();
  });

  it('says there are no entries when given none', () => {
    render(<AuditTable rows={[]} />);
    expect(screen.getByText(/no audit entries/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

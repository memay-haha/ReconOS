/** Shaped like UserResponse in backend/app/user/schemas.py. */
export interface MockUser {
  id: string;
  username: string;
  display_name: string;
  role: 'superadmin' | 'admin' | 'user';
  is_locked: boolean;
  last_login_at: string | null;
  created_at: string;
}

export const users: readonly MockUser[] = [
  {
    id: '0b1f6c1e-5d0a-4e0b-9a51-000000000001',
    username: 'rootadmin',
    display_name: 'Root Admin',
    role: 'superadmin',
    is_locked: false,
    last_login_at: '2026-11-03T08:12:45Z',
    created_at: '2026-10-01T02:00:00Z',
  },
  {
    id: '0b1f6c1e-5d0a-4e0b-9a51-000000000002',
    username: 'analyst',
    display_name: 'Example Analyst',
    role: 'admin',
    is_locked: false,
    last_login_at: '2026-11-04T01:30:10Z',
    created_at: '2026-10-05T03:15:00Z',
  },
  {
    id: '0b1f6c1e-5d0a-4e0b-9a51-000000000003',
    username: 'scanner_svc',
    display_name: 'Scanner Service',
    role: 'user',
    is_locked: true,
    last_login_at: null,
    created_at: '2026-10-12T09:45:00Z',
  },
];

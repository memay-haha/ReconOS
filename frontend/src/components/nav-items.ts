export interface NavItem {
  readonly label: string;
  /** null until the part named in `part` builds the screen. */
  readonly href: string | null;
  /** Material Symbols Outlined ligature, as the mockups use. */
  readonly icon: string;
  readonly part: string;
  /** Path and query whose `total` feeds the count beside the label. The query says what is
   * counted: the mockup shows unreviewed findings and queued jobs, not every row. */
  readonly badge?: string;
}

export interface NavGroup {
  readonly heading: string | null;
  /** Small tag beside the heading, as the mockup draws ROOT beside System. */
  readonly tag?: string;
  readonly items: readonly NavItem[];
}

// Groups, headings and order follow the sidebar in docs/design/screens/s12-users-access-control.html.
// S05, S07 (Screenshot Detail) and S09 are detail screens opened from their list screens, so they are not here.
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    heading: 'Recon',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'grid_view', part: 'Part D' },
      { label: 'Monitor', href: '/monitor', icon: 'show_chart', part: 'Part C' },
      { label: 'Domains', href: '/domains', icon: 'language', part: 'Part C', badge: '/domains' },
      { label: 'Screenshots', href: '/screenshots', icon: 'photo_camera', part: 'Part D' },
      { label: 'Programs', href: '/programs', icon: 'folder', part: 'Part B' },
      {
        label: 'Findings',
        href: '/findings',
        icon: 'pest_control',
        part: 'Part E',
        badge: '/findings?triage_status=new',
      },
    ],
  },
  {
    heading: 'Operations',
    items: [
      {
        // The mockup says Staging Queue; the glossary says queue (decision log, part B).
        label: 'Queue',
        href: '/queue',
        icon: 'dns',
        part: 'Part B',
        badge: '/jobs?status=queued',
      },
      { label: 'Manage', href: '/manage', icon: 'tune', part: 'Part B' },
      { label: 'Raw Outputs', href: null, icon: 'description', part: 'Part B' },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { label: 'Users', href: '/users', icon: 'group', part: 'Part A' },
      { label: 'Audit Log', href: '/audit-log', icon: 'history', part: 'Part A' },
    ],
  },
  {
    heading: 'System',
    tag: 'ROOT',
    items: [
      { label: 'Health & Tools', href: '/system', icon: 'show_chart', part: 'Part E' },
      { label: 'Osmedeus', href: '/osmedeus', icon: 'target', part: 'Part E' },
      { label: 'Vigolium', href: '/vigolium', icon: 'security', part: 'Part E' },
      { label: 'Modules', href: '/modules', icon: 'extension', part: 'Part E' },
    ],
  },
];

/** Segment-aware: /users and /users/42 match /users, /usersfoo does not. */
export function isCurrent(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

/** The built screen the path belongs to, with its group: a detail path such as /domains/42
 * belongs to its list screen. Null when the path is no sidebar screen. */
export function currentScreen(
  pathname: string | null,
): { readonly group: NavGroup; readonly item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href !== null && isCurrent(pathname, item.href)) return { group, item };
    }
  }
  return null;
}

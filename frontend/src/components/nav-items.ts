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
// S05, S07 and S09 are detail screens opened from their list screens, so they are not here.
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    heading: 'Recon',
    items: [
      { label: 'Dashboard', href: null, icon: 'grid_view', part: 'Part D' },
      { label: 'Monitor', href: null, icon: 'show_chart', part: 'Part C' },
      { label: 'Domains', href: null, icon: 'language', part: 'Part C', badge: '/domains' },
      { label: 'Screenshots', href: null, icon: 'photo_camera', part: 'Part D' },
      { label: 'Programs', href: null, icon: 'folder', part: 'Part B' },
      {
        label: 'Findings',
        href: null,
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
        label: 'Staging Queue',
        href: null,
        icon: 'dns',
        part: 'Part B',
        badge: '/jobs?status=queued',
      },
      { label: 'Manage', href: null, icon: 'tune', part: 'Part B' },
      { label: 'Raw Outputs', href: null, icon: 'description', part: 'Part B' },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { label: 'Users', href: '/users', icon: 'group', part: 'Part A' },
      { label: 'Audit Log', href: '/audit-log', icon: 'history', part: 'Part A' },
      { label: 'Component Library', href: '/components', icon: 'widgets', part: 'Part A' },
    ],
  },
  {
    heading: 'System',
    tag: 'ROOT',
    items: [
      { label: 'Health & Tools', href: null, icon: 'show_chart', part: 'Part E' },
      { label: 'Osmedeus', href: null, icon: 'target', part: 'Part E' },
      { label: 'Vigolium', href: null, icon: 'security', part: 'Part E' },
      { label: 'Modules', href: null, icon: 'extension', part: 'Part E' },
    ],
  },
];

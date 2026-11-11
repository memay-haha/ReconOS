import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolve } from 'node:path';

import type { ComponentStatus } from '@/lib/system';
import { shapeOf, shapeOfMockup } from '@/test/dom-shape';

import { Topbar } from './topbar';

let mockPath = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
}));

const MOCKUP = resolve(import.meta.dirname, '../../../docs/design/screens/s02-dashboard.html');

function wrap(
  props: {
    dispatcher?: ComponentStatus | null;
    displayName?: string | null;
    navToggled?: boolean;
    navExpanded?: boolean;
    onToggleNav?: () => void;
  } = {},
) {
  return render(
    <Topbar
      displayName={props.displayName === undefined ? 'Root Admin' : props.displayName}
      dispatcher={props.dispatcher === undefined ? 'ok' : props.dispatcher}
      navToggled={props.navToggled ?? false}
      navExpanded={props.navExpanded ?? true}
      onToggleNav={props.onToggleNav ?? (() => undefined)}
    />,
  );
}

afterEach(() => {
  mockPath = '/dashboard';
});

describe('Topbar against the mockup', () => {
  it('is a header, as the mockup is', () => {
    wrap();
    const header = document.querySelector('header') as Element;
    expect(shapeOf(header, 0, { landmarks: true })[0]).toBe('header');
    expect(shapeOfMockup(MOCKUP, 'header', 0, { landmarks: true })[0]).toBe('header');
  });

  it('is fixed to the top, starts at the right edge of the sidebar and is 14 tall', () => {
    wrap();
    const header = screen.getByRole('banner');
    for (const cls of ['fixed', 'top-0', 'md:left-sidebar', 'right-0', 'h-14', 'border-b']) {
      expect(header).toHaveClass(cls);
    }
  });

  it('spans the full width once the sidebar is hidden', () => {
    wrap({ navToggled: true });
    expect(screen.getByRole('banner')).toHaveClass('md:left-0');
  });

  it('offers the theme toggle', () => {
    wrap();
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });
});

describe('Topbar breadcrumb', () => {
  it('names the product, the sidebar group and the current screen', () => {
    wrap();
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumb).toHaveTextContent(/ReconOS.*Recon.*Dashboard/);
    expect(screen.getByText('Dashboard')).toHaveAttribute('aria-current', 'page');
  });

  it('names the list screen on its detail path', () => {
    mockPath = '/domains/42';
    wrap();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      /Recon.*Domains/,
    );
  });

  it('keeps only the product name off the sidebar screens', () => {
    mockPath = '/nowhere';
    wrap();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(/^ReconOS$/);
  });
});

describe('Topbar dispatcher pill', () => {
  it.each([
    ['ok', 'Dispatcher online'],
    ['degraded', 'Dispatcher degraded'],
    ['down', 'Dispatcher down'],
  ] as const)('shows %s as "%s" and links to Health & Tools', (status, label) => {
    wrap({ dispatcher: status });
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', '/system');
  });

  it('shows no pill while the status is unknown or not readable', () => {
    wrap({ dispatcher: null });
    expect(screen.queryByText(/dispatcher/i)).toBeNull();
  });
});

describe('Topbar menu button', () => {
  it('controls the sidebar and reports whether it is on screen', async () => {
    const onToggleNav = vi.fn();
    wrap({ navExpanded: false, onToggleNav });
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-controls', 'sidebar');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(onToggleNav).toHaveBeenCalledOnce();
  });
});

describe('Topbar slots', () => {
  it('draws the search box and the bell it is given, as the mockup header does', () => {
    render(
      <Topbar
        displayName="Root Admin"
        dispatcher="ok"
        navToggled={false}
        navExpanded
        onToggleNav={() => undefined}
        search={<input aria-label="Search" />}
        bell={<button type="button">Alerts</button>}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('draws the pill without a link for a reader who cannot open S15', () => {
    render(
      <Topbar
        displayName="Root Admin"
        dispatcher="ok"
        navToggled={false}
        navExpanded
        onToggleNav={() => undefined}
        dispatcherHref={null}
      />,
    );
    expect(screen.getByText('Dispatcher online').closest('a')).toBeNull();
  });
});

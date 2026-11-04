import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resolve } from 'node:path';

import { shapeOf, shapeOfMockup } from '@/test/dom-shape';

import { Topbar } from './topbar';

const MOCKUP = resolve(
  import.meta.dirname,
  '../../../docs/design/screens/s12-users-access-control.html',
);

describe('Topbar against the mockup', () => {
  it('is a header, as the mockup is', () => {
    render(<Topbar />);
    const header = document.querySelector('header') as Element;
    expect(shapeOf(header, 0, { landmarks: true })[0]).toBe('header');
    expect(shapeOfMockup(MOCKUP, 'header', 0, { landmarks: true })[0]).toBe('header');
  });

  it('is fixed to the top, starts at the right edge of the sidebar and is 14 tall', () => {
    render(<Topbar />);
    const header = screen.getByRole('banner');
    for (const cls of ['fixed', 'top-0', 'left-sidebar', 'right-0', 'h-14', 'border-b']) {
      expect(header).toHaveClass(cls);
    }
  });

  it('offers the theme toggle', () => {
    render(<Topbar />);
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });
});

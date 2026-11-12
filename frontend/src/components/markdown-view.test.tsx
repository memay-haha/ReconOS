import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownView } from './markdown-view';

describe('MarkdownView', () => {
  it('never turns the source into HTML', () => {
    const { container } = render(
      <MarkdownView
        source={
          '## Impact\n\n<img src=x onerror=alert(1)> [x](javascript:alert(1))\n\n```\n<script>alert(1)</script>\n```'
        }
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Impact' })).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('links an https target, opened without the referrer', () => {
    render(<MarkdownView source="See [the docs](https://example.com/x)." />);
    const link = screen.getByRole('link', { name: 'the docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });
});

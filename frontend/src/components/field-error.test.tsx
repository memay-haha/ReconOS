import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldError } from './field-error';

describe('FieldError', () => {
  it('renders nothing when the field is clean', () => {
    const { container } = render(<FieldError errors={{}} field="username" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the message for its own field', () => {
    render(<FieldError errors={{ username: 'missing' }} field="username" />);
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
  });

  it('ignores a code belonging to another field', () => {
    const { container } = render(
      <FieldError errors={{ password: 'password_too_weak' }} field="username" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does not read an inherited key as a field error', () => {
    const { container } = render(<FieldError errors={{}} field="toString" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still says something for a code it does not know', () => {
    render(<FieldError errors={{ username: 'some_future_code' }} field="username" />);
    expect(screen.getByText('Invalid value.')).toBeInTheDocument();
    expect(screen.queryByText(/some_future_code/)).not.toBeInTheDocument();
  });
});

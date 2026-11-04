import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, useCursorStack } from './pagination';

const noop = () => undefined;

describe('Pagination', () => {
  it('disables Trước on the first page', () => {
    render(
      <Pagination
        page={{ total: 42, totalIsEstimate: false, nextCursor: 'c1' }}
        canGoBack={false}
        onBack={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeEnabled();
  });

  it('disables Sau on the last page', () => {
    render(
      <Pagination
        page={{ total: 42, totalIsEstimate: false, nextCursor: null }}
        canGoBack
        onBack={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeEnabled();
  });

  it('says the total is an estimate when the backend says so', () => {
    render(
      <Pagination
        page={{ total: 1000, totalIsEstimate: true, nextCursor: null }}
        canGoBack={false}
        onBack={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByText(/khoảng 1\.000/i)).toBeInTheDocument();
  });

  it('writes an exact total in the Vietnamese thousands format', () => {
    render(
      <Pagination
        page={{ total: 1234, totalIsEstimate: false, nextCursor: null }}
        canGoBack={false}
        onBack={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByText(/1\.234/)).toBeInTheDocument();
    expect(screen.queryByText(/khoảng/i)).not.toBeInTheDocument();
  });

  it('reports a click on each button', async () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    render(
      <Pagination
        page={{ total: 42, totalIsEstimate: false, nextCursor: 'c1' }}
        canGoBack
        onBack={onBack}
        onNext={onNext}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trước' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('useCursorStack', () => {
  it('walks forward and back through the cursors it was given', () => {
    const { result } = renderHook(() => useCursorStack());
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);

    act(() => result.current.goNext('c1'));
    expect(result.current.cursor).toBe('c1');
    expect(result.current.canGoBack).toBe(true);

    act(() => result.current.goNext('c2'));
    expect(result.current.cursor).toBe('c2');

    act(() => result.current.goBack());
    expect(result.current.cursor).toBe('c1');

    act(() => result.current.goBack());
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it('ignores a null next cursor', () => {
    const { result } = renderHook(() => useCursorStack());
    act(() => result.current.goNext(null));
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it('stays on the first page when going back from it', () => {
    const { result } = renderHook(() => useCursorStack());
    act(() => result.current.goBack());
    expect(result.current.cursor).toBeNull();
  });

  it('returns to the first page when the filter changes', () => {
    const { result } = renderHook(() => useCursorStack());
    act(() => result.current.goNext('c1'));
    act(() => result.current.reset());
    expect(result.current.cursor).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });
});

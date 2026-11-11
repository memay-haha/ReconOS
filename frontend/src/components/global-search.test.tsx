import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '@/lib/search';

import { GlobalSearch } from './global-search';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const RESULTS: SearchResult[] = [
  { type: 'program', id: 'p1', label: 'Example Corp', program_id: 'p1' },
  { type: 'domain', id: 'd1', label: 'api.example.com', program_id: 'p1' },
];

function Harness({ results }: { results: SearchResult[] | null }) {
  const [query, setQuery] = useState('');
  return (
    <GlobalSearch
      query={query}
      onQueryChange={setQuery}
      results={results}
      loading={false}
      failed={false}
    />
  );
}

describe('GlobalSearch', () => {
  it('focuses on Ctrl+K, as the ⌘K hint says', async () => {
    render(<Harness results={null} />);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('lists results with their type and opens one on Enter', async () => {
    render(<Harness results={RESULTS} />);
    await userEvent.type(screen.getByRole('combobox'), 'example');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[1]).toHaveTextContent('api.example.com');
    expect(options[1]).toHaveTextContent('Domain');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(push).toHaveBeenCalledWith('/domains/d1');
  });

  it('says when nothing matches', async () => {
    render(<Harness results={[]} />);
    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });
});

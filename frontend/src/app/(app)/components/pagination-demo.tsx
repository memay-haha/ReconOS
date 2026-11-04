'use client';

import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';

/** Client wrapper: the page itself is a server component and cannot pass handlers. */
export function PaginationDemo(): ReactElement {
  const { canGoBack, goNext, goBack } = useCursorStack();
  return (
    <Pagination
      label="Sample list"
      page={{ total: 1234, totalIsEstimate: false, nextCursor: 'next' }}
      canGoBack={canGoBack}
      onBack={goBack}
      onNext={() => goNext('next')}
    />
  );
}

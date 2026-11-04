import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { shapeOf, shapeOfMockup } from '@/test/dom-shape';

import { LoginForm } from './login-form';
import LoginPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ readSessionForSignInScreen: async () => null }));

const mockup = resolve(
  import.meta.dirname,
  '../../../../docs/design/screens/s01-login.html',
);
const landmarks = { landmarks: true };

async function renderPage() {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{await LoginPage()}</QueryClientProvider>);
}

describe('S01 against its mockup', () => {
  it('lays the form out like the mockup form', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <LoginForm />
      </QueryClientProvider>,
    );
    const form = container.querySelector('form') as Element;
    expect(shapeOf(form, 0, landmarks)).toEqual(shapeOfMockup(mockup, 'form', 0, landmarks));
  });

  it('lays the page content out like the mockup main', async () => {
    const { container } = await renderPage();
    const main = container.querySelector('main') as Element;
    expect(shapeOf(main, 0, landmarks)).toEqual(shapeOfMockup(mockup, 'main', 0, landmarks));
  });

  it('has the mockup header and footer around the content', async () => {
    const { container } = await renderPage();
    const tags = Array.from(container.children).map((c) => c.tagName.toLowerCase());
    expect(tags).toEqual(['header', 'main', 'footer']);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { shapeOf, shapeOfMockup } from '@/test/dom-shape';

import { LoginForm } from './login-form';
import LoginPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ readSessionForSignInScreen: async () => null }));

const mockup = resolve(import.meta.dirname, '../../../../docs/design/screens/s01-login.html');
const landmarks = { landmarks: true };

/** What the mockup draws that the screen deliberately does not: demo telemetry the
 * screen cannot know (version, dispatcher state, node name, encryption claim), the
 * theme button (see the theme decision in the task report), and decorative halos. */
const OMITTED_FROM_HEADER = [
  'span.font-body-code',
  'div.hidden',
  'div.bg-surface',
  'button[aria-label]',
];

function mockupDocument(): Document {
  return new DOMParser().parseFromString(readFileSync(mockup, 'utf8'), 'text/html');
}

/** Visible words in document order, icons by ligature name. Layout-free, so it still
 * catches a changed or missing label that a tag-only shape cannot. */
function wordsOf(node: Element): string[] {
  return (node.textContent ?? '').split(/\s+/).filter((w) => w !== '');
}

function dropMatching(root: Element, selectors: string[]): void {
  for (const s of selectors) root.querySelectorAll(s).forEach((e) => e.remove());
}

async function renderPage() {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{await LoginPage()}</QueryClientProvider>);
}

describe('S01 against its mockup', () => {
  it('groups the form fields exactly like the mockup form', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <LoginForm />
      </QueryClientProvider>,
    );
    // No landmark flattening: the wrapper divs are what say which label, input and
    // reveal button belong to which field group.
    const form = container.querySelector('form') as Element;
    expect(shapeOf(form, 0)).toEqual(shapeOfMockup(mockup, 'form', 0));
  });

  it('keeps the reveal button inside the password group, after its input', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <LoginForm />
      </QueryClientProvider>,
    );
    const password = container.querySelector('input[type=password]') as Element;
    const group = password.parentElement?.parentElement as Element;
    expect(group.querySelector('label')?.getAttribute('for')).toBe(password.id);
    expect(password.nextElementSibling?.tagName).toBe('BUTTON');
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

  it('shows the mockup header words except the omitted telemetry and theme button', async () => {
    const { container } = await renderPage();
    const mockHeader = mockupDocument().querySelector('header') as Element;
    dropMatching(mockHeader, OMITTED_FROM_HEADER);
    const mockWords = wordsOf(mockHeader);
    expect(wordsOf(container.querySelector('header') as Element)).toEqual(mockWords);
  });

  it('shows no claim in the footer that the screen cannot back', async () => {
    const { container } = await renderPage();
    const footer = container.querySelector('footer') as Element;
    expect(wordsOf(footer).join(' ')).toBe('© ReconOS Security Systems');
  });
});

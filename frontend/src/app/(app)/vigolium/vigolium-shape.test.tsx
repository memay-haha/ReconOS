import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGINE, VIGOLIUM } from '../system/fixtures';
import {
  dropSection,
  mockupMain,
  type OutlineEntry,
  outline,
  rename,
} from '../system/shape-outline';
import { json, page, renderScreen, stubApi } from '../system/test-api';
import VigoliumPage from './page';

/** S17 under D3-B: connection, LLM model and native modules; ingest proxy and hardening out. */
function expected(): OutlineEntry[] {
  let e = outline(mockupMain('s17-vigolium-settings.html'));
  e = rename(e, 'h2', 'Server & Ingest Proxy', 'Engine Connection', 'D3-B: no ingest proxy');
  e = rename(e, 'h2', 'Agentic Olium Engine', 'LLM Verification Model', 'M2: no "Olium" term');
  e = dropSection(e, 'h2', 'Security Hardening & Sandboxing Flags', 'D3-B: hardening flags out');
  return e;
}

function render() {
  stubApi('superadmin', (call) =>
    call.path === '/engines?limit=200' ? json(page([ENGINE, VIGOLIUM])) : undefined,
  );
  return renderScreen(<VigoliumPage />);
}

afterEach(() => vi.unstubAllGlobals());

describe('S17 against its mockup', () => {
  it('has the headings of the mockup, minus the dropped parts', async () => {
    const { container } = render();
    await screen.findByLabelText('REST API Base URL');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByLabelText('REST API Base URL');
    const words = container.textContent ?? '';
    for (const banned of [
      'Master Secret',
      'Olium',
      'Ingest',
      'MITM',
      'Hardening',
      'Projects',
      'Scope Defaults',
      'Fingerprint',
      'Bridge',
      'Reveal',
      'Rotate',
    ]) {
      expect(words).not.toContain(banned);
    }
    // Base URL, API key; LLM model, base URL and key (the provider is a select).
    expect(container.querySelectorAll('input')).toHaveLength(5);
  });
});

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

/** S17 keeps the connection only (decision Q7, tech-debt item 8). */
function expected(): OutlineEntry[] {
  let e = outline(mockupMain('s17-vigolium-settings.html'));
  e = rename(e, 'h2', 'Server & Ingest Proxy', 'Engine Connection', 'M1 debt 8: no ingest proxy');
  e = dropSection(e, 'h2', 'Agentic Olium Engine', 'M1 debt 8');
  e = dropSection(e, 'h2', 'Native Modules Suite', 'M1 debt 8');
  e = dropSection(e, 'h2', 'Security Hardening & Sandboxing Flags', 'M1 debt 8');
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
    await screen.findByLabelText('Base URL');
    expect(outline(container.firstElementChild as Element)).toEqual(expected());
  });

  it('builds nothing from the dropped parts', async () => {
    const { container } = render();
    await screen.findByLabelText('Base URL');
    const words = container.textContent ?? '';
    for (const banned of [
      'Master Secret',
      'Olium',
      'Ingestion',
      'MITM',
      'Native Modules',
      'Hardening',
      'Projects',
      'Scope Defaults',
      'Validate Config',
    ]) {
      expect(words).not.toContain(banned);
    }
    expect(container.querySelectorAll('input')).toHaveLength(2);
  });
});

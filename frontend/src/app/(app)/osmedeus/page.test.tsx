import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGINE, VARIABLE, VIGOLIUM } from '../system/fixtures';
import {
  type Call,
  json,
  noContent,
  page,
  paths,
  problem,
  renderScreen,
  type Role,
  stubApi,
} from '../system/test-api';
import VigoliumPage from '../vigolium/page';
import OsmedeusPage from './page';

function standard(call: Call): Response | undefined {
  if (call.method === 'GET' && call.path === '/engines?limit=200')
    return json(page([ENGINE, VIGOLIUM]));
  if (call.method === 'GET' && call.path === '/engines/e1/variables') return json(page([VARIABLE]));
  return undefined;
}

function open(
  role: Role,
  answer: (call: Call) => Response | undefined = standard,
  screenUnderTest = <OsmedeusPage />,
) {
  const calls = stubApi(role, answer);
  renderScreen(screenUnderTest);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('S16 Osmedeus settings', () => {
  it('shows the base URL and an empty, write-only API key field', async () => {
    open('superadmin');
    expect(await screen.findByLabelText('REST API Base URL')).toHaveValue(ENGINE.base_url);
    const key = screen.getByLabelText('API Key');
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveValue('');
    expect(screen.queryByRole('button', { name: /reveal|copy|rotate|show/i })).toBeNull();
  });

  it('keeps the stored key when the field is left empty', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(ENGINE) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/engines/e1',
        body: { base_url: ENGINE.base_url, settings: { scan_preset: 'balanced' } },
      }),
    );
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
  });

  it('sends a new key once and clears the field', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(ENGINE) : standard(call),
    );
    const key = await screen.findByLabelText('API Key');
    await userEvent.type(key, 'not-a-real-key');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        base_url: ENGINE.base_url,
        api_key: 'not-a-real-key',
        settings: { scan_preset: 'balanced' },
      }),
    );
    await vi.waitFor(() => expect(key).toHaveValue(''));
  });

  it('tests the connection and names the version the engine reported', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'POST' ? json({ version: 'v5.0.1' }) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Test Connection' }));
    expect(await screen.findByText('The engine answered: v5.0.1')).toBeInTheDocument();
    expect(paths(calls, 'POST')).toEqual(['/engines/e1/test']);
  });

  it('says the engine did not answer, without the backend title', async () => {
    open('superadmin', (call) =>
      call.method === 'POST' ? problem(502, 'engine_unreachable') : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Test Connection' }));
    expect(await screen.findByText(/did not answer/i)).toBeInTheDocument();
    expect(screen.queryByText('Backend Title')).toBeNull();
  });

  it('lists engine variables with every value masked', async () => {
    open('superadmin');
    const row = (await screen.findByText('GITHUB_TOKEN')).closest('tr') as HTMLElement;
    expect(within(row).getByLabelText('Hidden value')).toHaveTextContent('••••••••');
  });

  it('adds a variable with a write-only value', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PUT' ? noContent() : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add variable' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Key'), 'SHODAN_API_KEY');
    const value = within(dialog).getByLabelText('Value');
    expect(value).toHaveAttribute('type', 'password');
    await userEvent.type(value, 'placeholder-value');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toEqual({
        method: 'PUT',
        path: '/engines/e1/variables/SHODAN_API_KEY',
        body: { value: 'placeholder-value' },
      }),
    );
  });

  it('deletes a variable after a confirmation', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'DELETE' ? noContent() : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Delete GITHUB_TOKEN' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    await vi.waitFor(() =>
      expect(paths(calls, 'DELETE')).toEqual(['/engines/e1/variables/GITHUB_TOKEN']),
    );
  });

  it('tells an Admin the screen is Superadmin only and asks nothing', async () => {
    const calls = open('admin');
    expect(await screen.findByText(/only a superadmin can open/i)).toBeInTheDocument();
    expect(paths(calls)).toEqual(['/auth/me']);
  });

  it('saves the chosen scan preset with Save Changes (D3-B)', async () => {
    const calls = open('superadmin', (call) =>
      call.method === 'PATCH' ? json(ENGINE) : standard(call),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Select Deep' }));
    expect(screen.getByText('Active: Deep')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        base_url: ENGINE.base_url,
        settings: { scan_preset: 'deep' },
      }),
    );
  });

  it('lists the workflows the engine reports and refreshes them on Refresh Index', async () => {
    const calls = open('superadmin', (call) =>
      call.path.startsWith('/engines/e1/workflows')
        ? json(
            page([
              {
                name: 'general',
                kind: 'flow',
                step_count: 14,
                description: 'Full',
                tags: ['recon'],
              },
            ]),
          )
        : standard(call),
    );
    expect(await screen.findByText('general')).toBeInTheDocument();
    expect(screen.getByText('14 steps')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Index' }));
    await vi.waitFor(() =>
      expect(paths(calls).filter((p) => p.startsWith('/engines/e1/workflows'))).toHaveLength(2),
    );
  });

  it('says so when the engine is not configured', async () => {
    open('superadmin', (call) =>
      call.path === '/engines?limit=200' ? json(page([VIGOLIUM])) : standard(call),
    );
    expect(await screen.findByText('The Osmedeus engine does not exist.')).toBeInTheDocument();
  });
});

describe('S17 Vigolium settings', () => {
  it('shows the connection of the Vigolium engine and no variables', async () => {
    const calls = open('superadmin', standard, <VigoliumPage />);
    expect(await screen.findByLabelText('REST API Base URL')).toHaveValue(VIGOLIUM.base_url);
    expect(screen.queryByRole('heading', { name: 'Engine Variables' })).toBeNull();
    expect(paths(calls).some((p) => p.includes('/variables'))).toBe(false);
  });

  it('tests the Vigolium engine, not Osmedeus', async () => {
    const calls = open(
      'superadmin',
      (call) => (call.method === 'POST' ? json({}) : standard(call)),
      <VigoliumPage />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Test Connection' }));
    expect(await screen.findByText('The engine answered.')).toBeInTheDocument();
    expect(paths(calls, 'POST')).toEqual(['/engines/e2/test']);
  });

  it('saves the LLM settings and a write-only LLM key, then clears the key field', async () => {
    const calls = open(
      'superadmin',
      (call) => (call.method === 'PATCH' ? json(VIGOLIUM) : standard(call)),
      <VigoliumPage />,
    );
    await userEvent.type(await screen.findByLabelText('Target Model Identifier'), 'model-x');
    const key = screen.getByLabelText('LLM API Key');
    expect(key).toHaveAttribute('type', 'password');
    await userEvent.type(key, 'not-a-real-llm-key');
    await userEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        base_url: VIGOLIUM.base_url,
        settings: { llm_provider: 'openai-compatible', llm_model: 'model-x', llm_base_url: '' },
        llm_api_key: 'not-a-real-llm-key',
      }),
    );
    await vi.waitFor(() => expect(key).toHaveValue(''));
  });

  it('shows the validation result and toggles a native module', async () => {
    const calls = open(
      'superadmin',
      (call) => {
        if (call.path === '/engines/e2/validate')
          return json({ ok: true, issues: [{ level: 'advisory', message: 'Slow health check' }] });
        if (call.path.startsWith('/engines/e2/modules') && call.method === 'GET')
          return json(
            page([{ name: 'xss-scanner', kind: 'active', is_enabled: true, description: null }]),
          );
        if (call.method === 'PATCH') return json({});
        return standard(call);
      },
      <VigoliumPage />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Validate Config' }));
    expect(await screen.findByText('Config Valid')).toBeInTheDocument();
    expect(screen.getByText('Slow health check')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('switch', { name: 'xss-scanner enabled' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        method: 'PATCH',
        path: '/engines/e2/modules',
        body: { modules: [{ name: 'xss-scanner', is_enabled: false }] },
      }),
    );
  });
});

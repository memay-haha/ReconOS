import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { handlersFor, IMPLEMENTED } from './registry';

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Every `METHOD /path` the contract defines, with `{x}` rewritten to `:x`. */
function contractOperations(): Set<string> {
  const ops = new Set<string>();
  let path = '';
  for (const line of read('../../../docs/api/openapi.yaml').split('\n')) {
    const p = /^ {2}(\/\S*):\s*$/.exec(line);
    if (p?.[1]) path = p[1].replace(/\{(\w+)\}/g, ':$1');
    const m = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (m?.[1] && path) ops.add(`${m[1].toUpperCase()} ${path}`);
  }
  return ops;
}

function builtKeys(implemented: readonly string[]): string[] {
  return handlersFor(implemented).map(
    // header reads `GET /api/v1/users`
    (h) => h.info.header.replace(' /api/v1', ' '),
  );
}

describe('IMPLEMENTED', () => {
  it('lists what batch 2 actually built, so nothing real is intercepted', () => {
    expect(IMPLEMENTED).toContain('GET /auth/me');
    expect(IMPLEMENTED).toContain('POST /auth/login');
    expect(IMPLEMENTED).toContain('GET /users');
    expect(IMPLEMENTED).toContain('GET /user-sessions');
    expect(IMPLEMENTED).toContain('GET /audit-logs');
    expect(IMPLEMENTED).toContain('GET /programs');
    expect(IMPLEMENTED).toContain('POST /programs/:program_id/proxies');
    expect(IMPLEMENTED).toContain('GET /jobs');
    expect(IMPLEMENTED).toContain('GET /findings');
    expect(IMPLEMENTED).toContain('GET /dispatcher/status');
    expect(IMPLEMENTED).toContain('GET /domains');
  });

  it('does not claim an endpoint the backend has not built', () => {
    expect(IMPLEMENTED).not.toContain('GET /saved-filters');
    expect(IMPLEMENTED).not.toContain('GET /jobs/:job_id/logs');
    expect(IMPLEMENTED).not.toContain('POST /jobs/:job_id/approve');
  });

  it('names only operations the contract defines, so a typo cannot hide a mock', () => {
    const ops = contractOperations();
    expect(ops.size).toBeGreaterThan(80);
    for (const entry of IMPLEMENTED) expect(ops, entry).toContain(entry);
  });
});

describe('handlersFor', () => {
  it('builds no handler for any endpoint the backend already serves', () => {
    const built = new Set(builtKeys(IMPLEMENTED));
    for (const entry of IMPLEMENTED) expect(built.has(entry), entry).toBe(false);
  });

  it('builds a handler for an endpoint the backend has not built', () => {
    expect(builtKeys(IMPLEMENTED)).toContain('GET /saved-filters');
  });

  it('filters a route with a path parameter when its IMPLEMENTED entry is present', () => {
    expect(builtKeys([])).toContain('GET /users/:user_id');
    expect(IMPLEMENTED).toContain('GET /users/:user_id');
    expect(builtKeys(IMPLEMENTED)).not.toContain('GET /users/:user_id');
  });

  it('leaves everything mocked when nothing is implemented yet', () => {
    expect(builtKeys([])).toContain('GET /users');
  });

  it('only mocks operations the contract defines', () => {
    const ops = contractOperations();
    for (const key of builtKeys([])) expect(ops, key).toContain(key);
  });
});

describe('the mock layer', () => {
  it('is guarded on NODE_ENV so a production build drops it', () => {
    expect(read('./browser.ts')).toContain("process.env.NODE_ENV !== 'development'");
  });
});

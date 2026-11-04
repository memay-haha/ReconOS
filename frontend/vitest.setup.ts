import '@testing-library/jest-dom/vitest';

// Newer Node versions ship a global localStorage that shadows jsdom's and is unusable
// without --localstorage-file. Point the global back at jsdom's own Storage, whatever
// the Node version.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow !== undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: jsdomWindow.localStorage,
  });
}

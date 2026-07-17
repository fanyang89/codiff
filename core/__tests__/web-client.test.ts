/**
 * @vitest-environment jsdom
 */

import { afterEach, expect, test, vi } from 'vite-plus/test';
import { createDefaultConfig } from '../config/defaults.ts';
import { installWebClient } from '../web-client.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Partial<Window>).codiff;
});

test('web client exposes only read endpoints', async () => {
  const config = createDefaultConfig();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const value =
      path === '/api/session'
        ? {
            config,
            launchOptions: {
              capabilities: {
                commit: false,
                fileSystem: false,
                reviewWrite: false,
                walkthrough: false,
              },
              initialSidebarMode: 'history',
              repositoryPathProvided: true,
              walkthrough: false,
            },
          }
        : path === '/api/repository/history'
          ? { entries: [], root: 'codiff' }
          : null;
    return new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  installWebClient();

  expect(document.documentElement.dataset.codiffPlatform).toBe('web');
  await expect(window.codiff.getLaunchOptions()).resolves.toMatchObject({
    initialSidebarMode: 'history',
  });
  await expect(window.codiff.getRepositoryHistory()).resolves.toEqual({
    entries: [],
    root: 'codiff',
  });
  await expect(window.codiff.openFile('README.md')).rejects.toThrow('read-only web mode');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
    method: 'POST',
  });
});

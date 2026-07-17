import { expect, test, vi } from 'vite-plus/test';
import type { RepositoryState } from '../core/types.ts';
import { startCodiffServer } from './local-server.mjs';

const token = 'test-token-with-enough-entropy';
const initialState = {
  branch: 'main',
  files: [
    {
      fingerprint: 'fingerprint',
      path: 'README.md',
      sections: [],
      status: 'modified',
    },
  ],
  generatedAt: 1,
  launchPath: '/private/repository',
  root: '/private/repository',
  source: { type: 'working-tree' },
} satisfies RepositoryState;

test('server bootstraps an authenticated read-only session', async () => {
  const repository = {
    listRepositoryHistory: vi.fn(async () => ({
      entries: [
        {
          author: 'Codiff',
          committedAt: 1,
          parents: [],
          ref: 'a'.repeat(40),
          subject: 'Initial commit',
        },
      ],
      root: initialState.root,
    })),
    readDiffImageContent: vi.fn(),
    readDiffSectionContent: vi.fn(),
    readRepositoryState: vi.fn(async () => initialState),
  };
  const instance = await startCodiffServer({
    assetStore: {
      get: async (path: string) =>
        path === '/'
          ? { body: Buffer.from('<html>Codiff</html>'), contentType: 'text/html; charset=utf-8' }
          : null,
    },
    bindAddress: '127.0.0.1',
    port: 0,
    repository,
    repositoryPath: initialState.root,
    token,
  });

  try {
    const origin = `http://127.0.0.1:${instance.port}`;
    const unauthorized = await fetch(`${origin}/api/session`);
    expect(unauthorized.status).toBe(401);

    const bootstrap = await fetch(`${origin}/?token=${token}`, { redirect: 'manual' });
    expect(bootstrap.status).toBe(303);
    expect(bootstrap.headers.get('location')).toBe('/');
    const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toContain('codiff_session=');

    const session = await fetch(`${origin}/api/session`, { headers: { cookie: cookie || '' } });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      launchOptions: {
        capabilities: {
          commit: false,
          fileSystem: false,
          reviewWrite: false,
          walkthrough: false,
        },
        initialSidebarMode: 'history',
      },
      repository: { name: 'repository' },
    });

    for (let request = 0; request < 2; request += 1) {
      const state = await fetch(`${origin}/api/repository/state`, {
        body: JSON.stringify({ source: { type: 'working-tree' } }),
        headers: { 'content-type': 'application/json', cookie: cookie || '' },
        method: 'POST',
      });
      expect(state.status).toBe(200);
    }
    expect(repository.readRepositoryState).toHaveBeenCalledTimes(2);

    const history = await fetch(`${origin}/api/repository/history`, {
      body: JSON.stringify({ limit: 20, source: { type: 'working-tree' } }),
      headers: { 'content-type': 'application/json', cookie: cookie || '' },
      method: 'POST',
    });
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({ root: 'repository' });
  } finally {
    await instance.close();
  }
});

test('server rejects sources and paths that were not exposed', async () => {
  const repository = {
    listRepositoryHistory: vi.fn(),
    readDiffImageContent: vi.fn(),
    readDiffSectionContent: vi.fn(),
    readRepositoryState: vi.fn(async () => initialState),
  };
  const instance = await startCodiffServer({
    assetStore: { get: async () => null },
    bindAddress: '127.0.0.1',
    repository,
    repositoryPath: initialState.root,
    token,
  });

  try {
    const origin = `http://127.0.0.1:${instance.port}`;
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    const sourceResponse = await fetch(`${origin}/api/repository/state`, {
      body: JSON.stringify({ source: { ref: '--help', type: 'commit' } }),
      headers,
      method: 'POST',
    });
    expect(sourceResponse.status).toBe(400);

    const pathResponse = await fetch(`${origin}/api/diff/section`, {
      body: JSON.stringify({
        kind: 'unstaged',
        path: '../secret',
        source: { type: 'working-tree' },
      }),
      headers,
      method: 'POST',
    });
    expect(pathResponse.status).toBe(400);
    expect(repository.readDiffSectionContent).not.toHaveBeenCalled();
  } finally {
    await instance.close();
  }
});

import { appendFile, mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { findPiSessionFile, readPiSessionContext, readSessionMessages } =
  require('../pi-session-context.cjs') as {
    findPiSessionFile: (root: string, sessionId: string) => Promise<string | null>;
    readPiSessionContext: (sessionId?: string) => Promise<{
      messages?: ReadonlyArray<{ role: 'assistant' | 'user'; text: string }>;
      risks?: ReadonlyArray<string>;
      source: { threadId?: string; type: string };
      version: 1;
    } | null>;
    readSessionMessages: (
      path: string,
    ) => Promise<ReadonlyArray<{ role: 'assistant' | 'user'; text: string }>>;
  };

const sessionId = '019e5e57-e7d6-7392-9ad1-ad959319d2fb';

test('extracts bounded readable messages from Pi session jsonl', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-pi-session-'));
  const sessionPath = join(directory, `${sessionId}.jsonl`);

  try {
    await writeFile(
      sessionPath,
      [
        JSON.stringify({ type: 'session' }),
        JSON.stringify({
          message: {
            content: [{ text: 'Implement walkthrough session handoff.', type: 'text' }],
            role: 'user',
          },
          type: 'message',
        }),
        JSON.stringify({
          message: {
            content: [
              { thinking: 'planning', type: 'thinking' },
              { text: 'Updated the Pi skill handoff.', type: 'text' },
            ],
            role: 'assistant',
          },
          type: 'message',
        }),
        JSON.stringify({
          message: { content: [{ text: '/codiff', type: 'text' }], role: 'user' },
          type: 'message',
        }),
      ].join('\n'),
    );

    await expect(readSessionMessages(sessionPath)).resolves.toEqual([
      { role: 'user', text: 'Implement walkthrough session handoff.' },
      { role: 'assistant', text: 'Updated the Pi skill handoff.' },
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('finds the active Pi session under PI_HOME', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-pi-home-'));
  const previousPiHome = process.env.PI_HOME;

  try {
    const sessionDirectory = join(directory, 'agent', 'sessions', 'encoded-repo');
    const sessionPath = join(sessionDirectory, `2026-06-10_${sessionId}.jsonl`);
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(
      sessionPath,
      `${JSON.stringify({
        message: {
          content: [
            {
              text: 'Keep Codiff in charge of the ephemeral walkthrough.',
              type: 'text',
            },
          ],
          role: 'user',
        },
        type: 'message',
      })}\n`,
    );
    process.env.PI_HOME = directory;

    await expect(findPiSessionFile(join(directory, 'agent', 'sessions'), sessionId)).resolves.toBe(
      sessionPath,
    );
    await expect(readPiSessionContext(sessionId)).resolves.toMatchObject({
      messages: [
        {
          role: 'user',
          text: 'Keep Codiff in charge of the ephemeral walkthrough.',
        },
      ],
      source: {
        threadId: sessionId,
        type: 'pi-session-excerpt',
      },
      version: 1,
    });
  } finally {
    if (previousPiHome == null) {
      delete process.env.PI_HOME;
    } else {
      process.env.PI_HOME = previousPiHome;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test('ignores invalid Pi session ids', async () => {
  await expect(readPiSessionContext('../../sessions')).resolves.toBeNull();
});

test('reads recent Pi messages from a large session without loading the whole file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-pi-large-session-'));
  const sessionPath = join(directory, `${sessionId}.jsonl`);

  try {
    await writeFile(sessionPath, '');
    await truncate(sessionPath, 17 * 1024 * 1024);
    await appendFile(
      sessionPath,
      `\n${JSON.stringify({
        message: {
          content: [{ text: 'Newest bounded Pi message.', type: 'text' }],
          role: 'user',
        },
        type: 'message',
      })}\n`,
    );

    await expect(readSessionMessages(sessionPath)).resolves.toEqual([
      { role: 'user', text: 'Newest bounded Pi message.' },
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

import { expect, test } from 'vite-plus/test';
import { parseServerArguments } from './command.mjs';

test('server arguments preserve repository paths and parse listener options', () => {
  const parsed = parseServerArguments([
    '--bind',
    '127.0.0.1',
    '--port',
    '7331',
    '--token',
    '0123456789abcdef',
    '.',
  ]);

  expect(parsed).toMatchObject({
    bindAddress: '127.0.0.1',
    port: 7331,
    token: '0123456789abcdef',
  });
  expect(parsed.requestedPath).toBe(process.cwd());
});

test('server arguments reject invalid ports', () => {
  expect(() => parseServerArguments(['--port', '70000'])).toThrow('between 0 and 65535');
});

import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const token = '0123456789abcdef0123456789abcdef';
const child = spawn(
  './out/sea/codiff-linux-x64',
  ['--bind', '127.0.0.1', '--port', '0', '--token', token, '.'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const exit = new Promise((resolve) => child.once('exit', resolve));
let output = '';

try {
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`SEA server did not start:\n${output}`)),
      15_000,
    );
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`SEA server exited with status ${code}:\n${output}`));
    });
  });
  const headers = { authorization: `Bearer ${token}` };
  const [sessionResponse, indexResponse] = await Promise.all([
    globalThis.fetch(`${origin}/api/session`, { headers }),
    globalThis.fetch(`${origin}/`, { headers }),
  ]);
  const session = await sessionResponse.json();
  const index = await indexResponse.text();
  if (
    !sessionResponse.ok ||
    !indexResponse.ok ||
    session.launchOptions?.initialSidebarMode !== 'history' ||
    !index.includes('Codiff')
  ) {
    throw new Error('SEA server smoke test failed.');
  }
  process.stdout.write(`Verified ${origin}\n`);
} finally {
  if (child.exitCode == null) {
    child.kill('SIGTERM');
  }
  await exit;
}

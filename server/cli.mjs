#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import { getReviewSource, parseArguments } from '../bin/arguments.js';
import { createFileAssetStore } from './assets.mjs';
import { startCodiffServer } from './local-server.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const parseServerArguments = (args) => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args,
    options: {
      bind: { type: 'string' },
      help: { short: 'h', type: 'boolean' },
      port: { type: 'string' },
      token: { type: 'string' },
      version: { short: 'v', type: 'boolean' },
    },
    strict: false,
  });
  const serverFlags = new Set(['--bind', '--help', '-h', '--port', '--token', '--version', '-v']);
  const sourceArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (serverFlags.has(argument)) {
      if (argument === '--bind' || argument === '--port' || argument === '--token') {
        index += 1;
      }
      continue;
    }
    sourceArgs.push(argument);
  }
  const parsed = parseArguments(sourceArgs.length > 0 ? sourceArgs : positionals);
  const parsedPort = values.port == null ? 0 : Number(values.port);
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
    throw new Error('Port must be an integer between 0 and 65535.');
  }
  if (values.token != null && values.token.length < 16) {
    throw new Error('Token must contain at least 16 characters.');
  }
  return {
    ...parsed,
    bindAddress: values.bind || '0.0.0.0',
    help: values.help === true,
    port: parsedPort,
    token: values.token,
    version: values.version === true,
  };
};

const helpText = `codiff - A read-only Git review server

Usage: codiff [options] [<ref>] [path]

Options:
  --bind <address>  Bind address (default: 0.0.0.0)
  --port <port>     Listening port; 0 selects an available port (default: 0)
  --token <token>   Set the access token instead of generating one
  --help, -h        Show this help message and exit
  --version, -v     Show version number and exit
`;

export const run = async (args = process.argv.slice(2)) => {
  const parsed = parseServerArguments(args);
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (parsed.help) {
    process.stdout.write(helpText);
    return;
  }
  if (parsed.version) {
    process.stdout.write(`codiff v${packageJson.version}\n`);
    return;
  }
  if (parsed.planFilePath || parsed.share || parsed.walkthrough || parsed.walkthroughFilePath) {
    throw new Error('Plans, sharing, and walkthroughs are unavailable in read-only web mode.');
  }
  if (parsed.pullRequestBranch || parsed.pullRequestNumber != null || parsed.pullRequestUrl) {
    throw new Error('Pull requests and merge requests are unavailable in read-only web mode.');
  }
  const assetRoot = resolve(root, 'dist');
  if (!existsSync(resolve(assetRoot, 'index.html'))) {
    throw new Error('Codiff has not been built yet. Run `pnpm build` first.');
  }
  const source = getReviewSource({
    branchRef: parsed.branchRef,
    commitRef: parsed.commitRef,
    range: parsed.range,
  });
  const instance = await startCodiffServer({
    assetStore: createFileAssetStore(assetRoot),
    bindAddress: parsed.bindAddress,
    port: parsed.port,
    repositoryPath: parsed.requestedPath,
    source,
    token: parsed.token,
  });
  process.stdout.write(`Codiff is serving this repository (read-only):\n\n`);
  for (const url of instance.urls) {
    process.stdout.write(`  ${url}\n`);
  }
  process.stdout.write('\nPress Ctrl+C to stop.\n');

  const stop = async () => {
    await instance.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

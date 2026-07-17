#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { createFileAssetStore } from './assets.mjs';
import { parseServerArguments, runServerCommand } from './command.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const run = async (args = process.argv.slice(2)) => {
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const assetRoot = resolve(root, 'dist');
  const parsed = parseServerArguments(args);
  if (!parsed.help && !parsed.version && !existsSync(resolve(assetRoot, 'index.html'))) {
    throw new Error('Codiff has not been built yet. Run `pnpm build` first.');
  }
  return runServerCommand({
    args,
    assetStore: createFileAssetStore(assetRoot),
    version: packageJson.version,
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

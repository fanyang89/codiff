import process from 'node:process';
import { createSeaAssetStore, getSeaVersion } from './assets.mjs';
import { runServerCommand } from './command.mjs';

const args = process.argv.slice(2);

// This entry is bundled to CommonJS because Node SEA executes one CommonJS script.
// eslint-disable-next-line unicorn/prefer-top-level-await
void runServerCommand({ args, assetStore: createSeaAssetStore(), version: getSeaVersion() }).catch(
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);

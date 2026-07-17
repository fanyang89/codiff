import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'rolldown';

const outputDirectory = resolve('out/sea-bundle');

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  external: [/^node:/],
  input: resolve('server/sea-entry.mjs'),
  output: {
    file: resolve(outputDirectory, 'sea-entry.cjs'),
    format: 'cjs',
  },
  platform: 'node',
});

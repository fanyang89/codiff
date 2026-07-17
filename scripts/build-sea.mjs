import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getNodeSeaBinary } from './node-sea-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, 'out/sea');
const bundlePath = resolve(root, 'out/sea-bundle/sea-entry.cjs');
const blobPath = join(outputDirectory, 'sea-prep.blob');
const binaryPath = join(outputDirectory, 'codiff-linux-x64');
const versionPath = join(outputDirectory, 'version.txt');
const configPath = join(outputDirectory, 'sea-config.json');
const postjectPath = resolve(root, 'node_modules/.bin/postject');

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('The Codiff SEA build currently supports Linux x64 only.');
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const nodeBinary = await getNodeSeaBinary();
const assetRoot = resolve(root, 'dist');
const assets = {};
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
    } else if (entry.isFile()) {
      assets[`web/${relative(assetRoot, path).replaceAll('\\', '/')}`] = path;
    }
  }
};

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await visit(assetRoot);
await writeFile(versionPath, packageJson.version);
assets['meta/version'] = versionPath;
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      assets,
      disableExperimentalSEAWarning: true,
      main: bundlePath,
      output: blobPath,
      useCodeCache: false,
      useSnapshot: false,
    },
    null,
    2,
  )}\n`,
);

execFileSync(nodeBinary, ['--experimental-sea-config', configPath], { stdio: 'inherit' });
await copyFile(nodeBinary, binaryPath);
await chmod(binaryPath, 0o755);
execFileSync(
  postjectPath,
  [
    binaryPath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ],
  { stdio: 'inherit' },
);

const checksum = createHash('sha256')
  .update(await readFile(binaryPath))
  .digest('hex');
await writeFile(
  join(outputDirectory, 'codiff-linux-x64.sha256'),
  `${checksum}  codiff-linux-x64\n`,
);
process.stdout.write(`Built ${binaryPath}\n`);

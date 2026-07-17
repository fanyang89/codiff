import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeVersion = '24.15.0';
const archiveName = `node-v${nodeVersion}-linux-x64.tar.xz`;
const cacheDirectory = resolve(root, `.cache/node-v${nodeVersion}-linux-x64`);
const cachedBinary = resolve(cacheDirectory, `node-v${nodeVersion}-linux-x64/bin/node`);
const sentinel = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const supportsSeaInjection = async (path) => {
  try {
    return (await readFile(path)).includes(Buffer.from(sentinel));
  } catch {
    return false;
  }
};

const download = async (url) => {
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

export const getNodeSeaBinary = async () => {
  const override = process.env.CODIFF_NODE_BINARY;
  if (override) {
    if (!(await supportsSeaInjection(override))) {
      throw new Error('CODIFF_NODE_BINARY does not support Node SEA injection.');
    }
    return resolve(override);
  }
  if (process.version === `v${nodeVersion}` && (await supportsSeaInjection(process.execPath))) {
    return process.execPath;
  }
  if (await supportsSeaInjection(cachedBinary)) {
    return cachedBinary;
  }

  const baseUrl = `https://nodejs.org/dist/v${nodeVersion}`;
  const [archive, checksums] = await Promise.all([
    download(`${baseUrl}/${archiveName}`),
    download(`${baseUrl}/SHASUMS256.txt`),
  ]);
  const checksumLine = checksums
    .toString('utf8')
    .split('\n')
    .find((line) => line.trim().endsWith(`  ${archiveName}`));
  const expectedChecksum = checksumLine?.trim().split(/\s+/)[0];
  const actualChecksum = createHash('sha256').update(archive).digest('hex');
  if (!expectedChecksum || actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum verification failed for ${archiveName}.`);
  }

  await mkdir(cacheDirectory, { recursive: true });
  const archivePath = resolve(cacheDirectory, basename(archiveName));
  await writeFile(archivePath, archive);
  execFileSync('tar', ['-xJf', archivePath, '-C', cacheDirectory], { stdio: 'inherit' });
  await chmod(cachedBinary, 0o755);
  if (!(await supportsSeaInjection(cachedBinary))) {
    throw new Error('The downloaded Node binary does not support SEA injection.');
  }
  return cachedBinary;
};

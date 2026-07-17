import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.woff2', 'font/woff2'],
]);

/** @param {string} path */
const getContentType = (path) =>
  mimeTypes.get(extname(path).toLowerCase()) || 'application/octet-stream';

/** @param {string} root */
export const createFileAssetStore = (root) => {
  const assetRoot = resolve(root);
  return {
    /** @param {string} requestPath */
    get: async (requestPath) => {
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(requestPath);
      } catch {
        return null;
      }
      const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
      const absolutePath = resolve(assetRoot, relativePath);
      if (absolutePath !== assetRoot && !absolutePath.startsWith(`${assetRoot}${sep}`)) {
        return null;
      }
      try {
        const info = await stat(absolutePath);
        if (!info.isFile()) {
          return null;
        }
        return {
          body: await readFile(absolutePath),
          contentType: getContentType(relativePath),
        };
      } catch {
        return null;
      }
    },
  };
};

export { getContentType };

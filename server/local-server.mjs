import { Buffer } from 'node:buffer';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { basename } from 'node:path';
import { URL } from 'node:url';
import configModule from '../electron/config.cjs';
import repositoryApi from '../electron/git-state.cjs';

const { readConfig } = configModule;

const MAX_BODY_SIZE = 1024 * 1024;
const MAX_HISTORY_LIMIT = 1000;
const commitRefPattern = /^[0-9a-f]{40,64}$/i;

/** @param {string} left @param {string} right */
const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

/** @param {import('node:http').IncomingMessage} request */
const getCookies = (request) =>
  new Map(
    (request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter((entry) => entry.length === 2)
      .flatMap(([key, value]) => {
        try {
          return [[key, decodeURIComponent(value)]];
        } catch {
          return [];
        }
      }),
  );

/** @param {import('node:http').IncomingMessage} request @param {string} token */
const isAuthorized = (request, token) => {
  const cookie = getCookies(request).get('codiff_session');
  const authorization = request.headers.authorization;
  return (
    (cookie != null && safeEqual(cookie, token)) ||
    (authorization?.startsWith('Bearer ') === true && safeEqual(authorization.slice(7), token))
  );
};

/** @param {import('node:http').IncomingMessage} request */
const hasValidHost = (request) => {
  const host = request.headers.host;
  if (!host) {
    return false;
  }
  try {
    const hostname = new URL(`http://${host}`).hostname.replaceAll(/^\[|\]$/g, '');
    return hostname === 'localhost' || isIP(hostname) !== 0;
  } catch {
    return false;
  }
};

/** @param {import('node:http').IncomingMessage} request */
const hasValidOrigin = (request) => {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
};

/** @param {import('node:http').ServerResponse} response */
const setSecurityHeaders = (response) => {
  response.setHeader('cache-control', 'no-store');
  response.setHeader(
    'content-security-policy',
    "default-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data: https://www.gravatar.com; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
};

/** @param {import('node:http').ServerResponse} response @param {number} status @param {unknown} value */
const sendJson = (response, status, value) => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
};

/** @param {import('node:http').ServerResponse} response @param {number} status @param {string} message */
const sendText = (response, status, message) => {
  response.statusCode = status;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.end(message);
};

/** @param {import('node:http').IncomingMessage} request */
const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      throw new Error('Request body is too large.');
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

/** @param {unknown} source */
const getSourceKey = (source) => JSON.stringify(source || null);

/** @param {unknown} source @param {Set<string>} allowedSources */
const isAllowedSource = (source, allowedSources) => {
  if (source == null || allowedSources.has(getSourceKey(source))) {
    return true;
  }
  if (typeof source !== 'object' || source === null) {
    return false;
  }
  const candidate = /** @type {{ref?: unknown; type?: unknown}} */ (source);
  return (
    candidate.type === 'commit' &&
    typeof candidate.ref === 'string' &&
    commitRefPattern.test(candidate.ref)
  );
};

/** @param {import('../core/types.ts').RepositoryState} state @param {string} displayRoot */
const sanitizeState = (state, displayRoot) => ({
  ...state,
  launchPath: displayRoot,
  root: displayRoot,
});

/** @param {string} bindAddress @param {number} port @param {string} token */
const getServerUrls = (bindAddress, port, token) => {
  const addresses = new Set();
  if (bindAddress !== '0.0.0.0' && bindAddress !== '::') {
    addresses.add(bindAddress);
  } else {
    for (const interfaces of Object.values(networkInterfaces())) {
      for (const entry of interfaces || []) {
        if (!entry.internal && entry.family === 'IPv4') {
          addresses.add(entry.address);
        }
      }
    }
  }
  if (addresses.size === 0) {
    addresses.add('127.0.0.1');
  }
  return [...addresses].map((address) => {
    const host = isIP(address) === 6 ? `[${address}]` : address;
    return `http://${host}:${port}/?token=${encodeURIComponent(token)}`;
  });
};

/**
 * @param {{
 *   assetStore: {get(path: string): Promise<{body: Buffer; contentType: string} | null>};
 *   bindAddress?: string;
 *   config?: import('../core/config/types.ts').CodiffConfig;
 *   port?: number;
 *   repository?: {
 *     listRepositoryHistory(path: string, limit?: number, source?: import('../core/types.ts').ReviewSource): Promise<import('../core/types.ts').RepositoryHistory>;
 *     readDiffImageContent(path: string, request: import('../core/types.ts').DiffImageContentRequest): Promise<import('../core/types.ts').DiffImageContentResult>;
 *     readDiffSectionContent(path: string, request: import('../core/types.ts').DiffSectionContentRequest): Promise<import('../core/types.ts').DiffSection>;
 *     readRepositoryState(path: string, source?: import('../core/types.ts').ReviewSource, options?: {showWhitespace?: boolean}): Promise<import('../core/types.ts').RepositoryState>;
 *   };
 *   repositoryPath: string;
 *   source?: import('../core/types.ts').ReviewSource;
 *   token?: string;
 * }} options
 */
export const startCodiffServer = async ({
  assetStore,
  bindAddress = '0.0.0.0',
  config = readConfig(),
  port = 0,
  repository = repositoryApi,
  repositoryPath,
  source,
  token = randomBytes(32).toString('base64url'),
}) => {
  if (bindAddress !== 'localhost' && isIP(bindAddress) === 0) {
    throw new Error('Bind address must be an IP address or localhost.');
  }
  const initialState = await repository.readRepositoryState(repositoryPath, source, {
    showWhitespace: config.settings.showWhitespace,
  });
  const repositoryRoot = initialState.root;
  const displayRoot = basename(repositoryRoot) || 'repository';
  const repositoryId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 16);
  const allowedSources = new Set([
    getSourceKey(initialState.source),
    getSourceKey({ type: 'working-tree' }),
  ]);
  /** @type {Map<string, Set<string>>} */
  const allowedPathsBySource = new Map();
  let initialStateAvailable = true;
  /** @param {import('../core/types.ts').RepositoryState} state */
  const rememberState = (state) => {
    const key = getSourceKey(state.source);
    allowedSources.add(key);
    allowedPathsBySource.set(key, new Set(state.files.map((file) => file.path)));
    return sanitizeState(state, displayRoot);
  };
  const sanitizedInitialState = rememberState(initialState);

  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    if (!hasValidHost(request) || !hasValidOrigin(request)) {
      sendText(response, 403, 'Forbidden.');
      return;
    }

    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const bootstrapToken = url.searchParams.get('token');
    if (bootstrapToken != null) {
      if (!safeEqual(bootstrapToken, token)) {
        sendText(response, 401, 'Invalid Codiff token.');
        return;
      }
      response.statusCode = 303;
      response.setHeader(
        'set-cookie',
        `codiff_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`,
      );
      response.setHeader('location', url.pathname || '/');
      response.end();
      return;
    }

    if (!isAuthorized(request, token)) {
      sendText(response, 401, 'Open Codiff using one of the URLs printed by the server.');
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/session') {
        sendJson(response, 200, {
          config,
          launchOptions: {
            capabilities: {
              commit: false,
              fileSystem: false,
              reviewWrite: false,
              walkthrough: false,
            },
            initialSidebarMode: 'history',
            repositoryPathProvided: true,
            source: sanitizedInitialState.source,
            walkthrough: false,
          },
          repository: { id: repositoryId, name: displayRoot },
        });
        return;
      }

      if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
        const body = await readJson(request);
        if (url.pathname === '/api/repository/state') {
          if (!isAllowedSource(body.source, allowedSources)) {
            sendText(response, 400, 'Invalid review source.');
            return;
          }
          const useInitialState =
            initialStateAvailable &&
            (body.source == null ||
              getSourceKey(body.source) === getSourceKey(initialState.source));
          initialStateAvailable = false;
          const state = useInitialState
            ? initialState
            : await repository.readRepositoryState(repositoryRoot, body.source, {
                showWhitespace: config.settings.showWhitespace,
              });
          sendJson(response, 200, rememberState(state));
          return;
        }
        if (url.pathname === '/api/repository/history') {
          if (!isAllowedSource(body.source, allowedSources)) {
            sendText(response, 400, 'Invalid review source.');
            return;
          }
          const limit = Math.min(
            MAX_HISTORY_LIMIT,
            Math.max(1, Number.isInteger(body.limit) ? body.limit : 200),
          );
          const history = await repository.listRepositoryHistory(
            repositoryRoot,
            limit,
            body.source,
          );
          for (const entry of history.entries) {
            allowedSources.add(getSourceKey({ ref: entry.ref, type: 'commit' }));
          }
          sendJson(response, 200, { ...history, root: displayRoot });
          return;
        }
        if (url.pathname === '/api/diff/section' || url.pathname === '/api/diff/image') {
          if (!isAllowedSource(body.source, allowedSources)) {
            sendText(response, 400, 'Invalid review source.');
            return;
          }
          const sourceKey = getSourceKey(body.source || initialState.source);
          const allowedPaths = allowedPathsBySource.get(sourceKey);
          if (typeof body.path !== 'string' || !allowedPaths?.has(body.path)) {
            sendText(response, 400, 'Invalid repository path.');
            return;
          }
          const result =
            url.pathname === '/api/diff/section'
              ? await repository.readDiffSectionContent(repositoryRoot, body)
              : await repository.readDiffImageContent(repositoryRoot, body);
          sendJson(response, 200, result);
          return;
        }
        sendText(response, 404, 'Not found.');
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendText(response, 405, 'Method not allowed.');
        return;
      }
      const asset = await assetStore.get(url.pathname);
      if (!asset) {
        sendText(response, 404, 'Not found.');
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-type', asset.contentType);
      response.end(request.method === 'HEAD' ? undefined : asset.body);
    } catch (error) {
      sendText(response, 500, error instanceof Error ? error.message : 'Codiff request failed.');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bindAddress, () => {
      server.off('error', reject);
      resolve(undefined);
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Codiff could not determine the listening port.');
  }
  return {
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(undefined))),
      ),
    port: address.port,
    server,
    token,
    urls: getServerUrls(bindAddress, address.port, token),
  };
};

export { getServerUrls };

import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

// The built web client is served from the API origin so cookies, CSRF and SSE stay same-origin (ARCHITECTURE.md).
// Only files enumerated at start-up are ever read: a request path is a dictionary key, never a filesystem path.
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8'
};
export const HTML_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
type Asset = { path: string; contentType: string; cacheControl: string; bytes?: Buffer; etag?: string };

export function cacheControlFor(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (urlPath === '/index.html' || urlPath === '/sw.js' || urlPath === '/manifest.webmanifest') return 'no-cache';
  return 'public, max-age=3600';
}
export function enumerateAssets(distDir: string): Map<string, Asset> {
  const root = resolve(distDir); const assets = new Map<string, Asset>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.isFile()) continue;
      const contentType = contentTypes[extname(entry.name).toLowerCase()];
      if (!contentType || entry.name.startsWith('.')) continue;
      const urlPath = `/${relative(root, path).split(sep).join('/')}`;
      assets.set(urlPath, { path, contentType, cacheControl: cacheControlFor(urlPath) });
    }
  };
  if (!statSync(root).isDirectory()) throw new Error('WEB_DIST_DIR must be a directory');
  walk(root);
  if (!assets.has('/index.html')) throw new Error('WEB_DIST_DIR does not contain index.html; build the web client first');
  return assets;
}
export function installStaticWeb(app: FastifyInstance, distDir: string) {
  const assets = enumerateAssets(distDir);
  async function load(asset: Asset) {
    if (!asset.bytes) { asset.bytes = await readFile(asset.path); asset.etag = `"${createHash('sha256').update(asset.bytes).digest('base64url').slice(0, 27)}"`; }
    return asset as Required<Asset>;
  }
  app.get('/*', { config: { public: true } }, async (request, reply) => {
    const urlPath = request.url.split('?')[0];
    if (urlPath.startsWith('/api/')) return reply.code(404).send({ code: 'NOT_FOUND', messageKey: 'errors.notFound', requestId: request.id, retryable: false });
    let asset = assets.get(urlPath === '/' ? '/index.html' : urlPath);
    // Application routes are client-side: any unknown navigation receives the shell (never an API-shaped path).
    if (!asset) {
      const accept = request.headers.accept ?? '*/*'; const fileLike = extname(urlPath) !== '' || urlPath.split('/').pop()!.startsWith('.');
      if (fileLike || !(accept.includes('text/html') || accept.includes('*/*'))) return reply.code(404).send({ code: 'NOT_FOUND', messageKey: 'errors.notFound', requestId: request.id, retryable: false });
      asset = assets.get('/index.html')!;
    }
    const loaded = await load(asset);
    reply.header('Cache-Control', loaded.cacheControl).header('ETag', loaded.etag).header('Content-Type', loaded.contentType).removeHeader('Pragma');
    if (loaded.contentType.startsWith('text/html')) reply.header('Content-Security-Policy', HTML_CSP);
    else reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox");
    if (request.headers['if-none-match'] === loaded.etag) return reply.code(304).send();
    return reply.send(loaded.bytes);
  });
}

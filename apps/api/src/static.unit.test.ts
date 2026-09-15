import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import { HTML_CSP, cacheControlFor } from './static.js';

const dist = await mkdtemp(join(tmpdir(), 'nursery-dist-'));
await mkdir(join(dist, 'assets'), { recursive: true }); await mkdir(join(dist, 'icons'), { recursive: true });
await writeFile(join(dist, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body></html>');
await writeFile(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)'); await writeFile(join(dist, 'sw.js'), 'self.addEventListener("install",()=>{})');
await writeFile(join(dist, 'manifest.webmanifest'), '{"name":"Nursery"}'); await writeFile(join(dist, 'icons', 'icon-192.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
await writeFile(join(dist, '.env'), 'SECRET=1'); await writeFile(join(dist, 'notes.md'), 'not served');
const config: AppConfig = { databaseUrl: 'postgresql://unreachable/unreachable', appOrigin: 'https://nursery.example', sessionSecret: '01234567890123456789012345678901', installationId: '00000000-0000-4000-8000-000000000001', businessTimezone: 'Africa/Cairo', privateFilesDir: './private-files', supportContact: 'Support team', backupTarget: 'none', production: true, webDistDir: dist };
const database = { checkConnection: async () => undefined, close: async () => undefined };
const app = buildApp(config, database);

describe('same-origin web client serving', () => {
  afterAll(async () => { await app.close(); await rm(dist, { recursive: true, force: true }); });
  it('serves the shell, PWA files and hashed assets with the documented cache and security headers', async () => {
    const index = await app.inject('/'); expect(index.statusCode).toBe(200); expect(index.headers['content-type']).toBe('text/html; charset=utf-8'); expect(index.headers['cache-control']).toBe('no-cache');
    expect(index.headers['content-security-policy']).toBe(HTML_CSP); expect(index.headers['strict-transport-security']).toContain('max-age'); expect(index.headers['x-frame-options']).toBe('DENY'); expect(index.body).toContain('id="root"');
    const sw = await app.inject('/sw.js'); expect(sw.statusCode).toBe(200); expect(sw.headers['content-type']).toBe('text/javascript; charset=utf-8'); expect(sw.headers['cache-control']).toBe('no-cache');
    const asset = await app.inject('/assets/index-abc123.js'); expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable'); expect(asset.headers['content-security-policy']).toContain("default-src 'none'");
    const manifest = await app.inject('/manifest.webmanifest'); expect(manifest.headers['content-type']).toBe('application/manifest+json; charset=utf-8'); expect(manifest.headers['cache-control']).toBe('no-cache');
    expect((await app.inject('/icons/icon-192.png')).headers['content-type']).toBe('image/png');
    const cached = await app.inject({ url: '/sw.js', headers: { 'if-none-match': String(sw.headers.etag) } }); expect(cached.statusCode).toBe(304);
    expect((await app.inject({ method: 'HEAD', url: '/' })).statusCode).toBe(200);
    expect(cacheControlFor('/index.html')).toBe('no-cache'); expect(cacheControlFor('/favicon.svg')).toBe('public, max-age=3600');
  });
  it('falls back to the shell for client routes but never for API paths, dotfiles, or unlisted files', async () => {
    const route = await app.inject({ url: '/administration/children/123', headers: { accept: 'text/html,*/*' } }); expect(route.statusCode).toBe(200); expect(route.headers['content-type']).toContain('text/html');
    for (const url of ['/api/v1/missing', '/api/v1/', '/.env', '/notes.md', '/assets/other.js', '/%2e%2e/package.json', '/assets/../index.html.bak']) { const response = await app.inject({ url, headers: { accept: 'text/html' } }); expect(response.statusCode, url).toBe(404); expect(response.body).not.toContain('SECRET'); }
    const json = await app.inject({ url: '/administration/children', headers: { accept: 'application/json' } }); expect(json.statusCode).toBe(404); expect(json.json().code).toBe('NOT_FOUND');
    expect((await app.inject({ method: 'POST', url: '/sw.js', headers: { origin: 'https://nursery.example', 'content-type': 'application/json', 'x-csrf-token': 'x' }, payload: {} })).statusCode).toBe(403);
    expect((await app.inject('/api/v1/health')).statusCode).toBe(200);
  });
  it('refuses a build directory without index.html', () => {
    expect(() => buildApp({ ...config, webDistDir: join(dist, 'assets') }, database)).toThrow('index.html');
  });
});

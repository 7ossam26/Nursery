import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { get } from 'node:http';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let origin = '';

const getText = (url: string): Promise<Readonly<{ status: number; body: string }>> => new Promise((resolve, reject) => {
  get(url, { agent: false }, (response) => {
    response.setEncoding('utf8');
    let body = '';
    response.on('data', (chunk: string) => { body += chunk; });
    response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
  }).on('error', reject);
});

describe('web startup shell', () => {
  beforeAll(async () => {
    server = await createServer({ configFile: 'apps/web/vite.config.ts', root: 'apps/web', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
  });
  afterAll(async () => { const closing = server.close(); server.httpServer?.closeAllConnections(); await closing; });
  it('serves the application document and development preview through the SPA fallback', async () => {
    const response = await getText(`${origin}/__preview/parent/home`);
    expect(response.status).toBe(200);
    expect(response.body).toContain('<div id="root"></div>');
    expect(response.body).toContain('/src/main.tsx');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let origin = '';

describe('web startup shell', () => {
  beforeAll(async () => {
    server = await createServer({ configFile: 'apps/web/vite.config.ts', root: 'apps/web', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
  });
  afterAll(async () => { await server.close(); });
  it('serves the Vite application document', async () => {
    const response = await fetch(origin);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('/src/main.tsx');
  });
});

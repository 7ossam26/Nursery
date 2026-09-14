import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Runs the shipped worker script against a scripted ServiceWorker environment: no browser automation.
function boot(precache: string[]) {
  const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
  const stores = new Map<string, Map<string, { body: string }>>();
  const puts: string[] = []; const fetched: string[] = []; let networkDown = false;
  const handlers: Record<string, ((event: unknown) => void)[]> = {};
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls: string[]) => { for (const url of urls) { puts.push(url); store.set(url, { body: `cached:${url}` }); } },
      put: async (url: string) => { puts.push(String(url)); },
      match: async (url: string) => store.get(new URL(url, 'https://nursery.example').pathname) ?? undefined
    };
  };
  const self = {
    location: { origin: 'https://nursery.example' },
    clients: { claim: async () => undefined },
    skipWaiting: () => { self.skipped = true; }, skipped: false,
    addEventListener: (name: string, handler: (event: unknown) => void) => { (handlers[name] ??= []).push(handler); }
  };
  const context = {
    self, caches: { open: async (name: string) => cache(name), keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
    fetch: async (request: { url: string }) => { fetched.push(request.url); if (networkDown) throw new TypeError('offline'); return { body: `network:${request.url}` }; },
    Response: { error: () => ({ body: 'error' }) }, URL
  };
  runInNewContext(template.replaceAll('__PRECACHE__', JSON.stringify(precache)).replaceAll('__VERSION__', 'v1'), context);
  const dispatch = async (name: string, event: Record<string, unknown>) => { for (const handler of handlers[name] ?? []) handler(event); };
  const fetchEvent = async (request: { url: string; method?: string; mode?: string }): Promise<{ body: string } | null> => {
    const responses: Promise<{ body: string }>[] = [];
    await dispatch('fetch', { request: { method: 'GET', mode: 'no-cors', ...request }, respondWith: (promise: Promise<{ body: string }>) => { responses.push(promise); } });
    return responses.length ? await responses[0] : null;
  };
  return { stores, puts, fetched, handlers, self, dispatch, fetchEvent, offline: () => { networkDown = true; } };
}

describe('application-shell service worker', () => {
  const precache = ['/index.html', '/assets/index-abc123.js', '/assets/index-abc123.css', '/manifest.webmanifest', '/icons/icon-192.png'];

  it('precaches only the versioned shell at install and drops older shell caches at activate', async () => {
    const worker = boot(precache);
    worker.stores.set('nursery-shell-old', new Map());
    let installed: Promise<unknown> | null = null;
    await worker.dispatch('install', { waitUntil: (promise: Promise<unknown>) => { installed = promise; } });
    await installed;
    expect([...worker.stores.get('nursery-shell-v1')!.keys()]).toEqual(precache);
    let activated: Promise<unknown> | null = null;
    await worker.dispatch('activate', { waitUntil: (promise: Promise<unknown>) => { activated = promise; } });
    await activated;
    expect([...worker.stores.keys()]).toEqual(['nursery-shell-v1']);
    expect(worker.self.skipped).toBe(false);
    await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(worker.self.skipped).toBe(true);
  });

  it('never intercepts or stores API, private download, SSE, cross-origin or non-GET requests', async () => {
    const worker = boot(precache);
    let installed: Promise<unknown> | null = null;
    await worker.dispatch('install', { waitUntil: (promise: Promise<unknown>) => { installed = promise; } }); await installed;
    const untouched = [
      { url: 'https://nursery.example/api/v1/parent/children' },
      { url: 'https://nursery.example/api/v1/parent/live' },
      { url: 'https://nursery.example/api/v1/finance/receipts/abc/download' },
      { url: 'https://nursery.example/api/v1/auth/me' },
      { url: 'https://nursery.example/api' },
      { url: 'https://nursery.example/api/v1/payments', method: 'POST' },
      { url: 'https://cdn.example/font.woff2' },
      { url: 'https://nursery.example/assets/not-in-build.js' }
    ];
    for (const request of untouched) expect(await worker.fetchEvent(request)).toBeNull();
    expect(worker.puts).toEqual(precache);
    expect(worker.fetched).toEqual([]);
  });

  it('serves hashed shell assets from the precache and a safe offline document for navigations', async () => {
    const worker = boot(precache);
    let installed: Promise<unknown> | null = null;
    await worker.dispatch('install', { waitUntil: (promise: Promise<unknown>) => { installed = promise; } }); await installed;
    expect((await worker.fetchEvent({ url: 'https://nursery.example/assets/index-abc123.js' }))?.body).toBe('cached:/assets/index-abc123.js');
    expect((await worker.fetchEvent({ url: 'https://nursery.example/parent/today', mode: 'navigate' }))?.body).toBe('network:https://nursery.example/parent/today');
    worker.offline();
    expect((await worker.fetchEvent({ url: 'https://nursery.example/parent/today', mode: 'navigate' }))?.body).toBe('cached:/index.html');
    expect(await worker.fetchEvent({ url: 'https://nursery.example/api/v1/parent/children' })).toBeNull();
    expect(worker.puts).toEqual(precache);
  });
});

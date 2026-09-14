import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Public shell files copied verbatim by Vite; they join the hashed bundle in the precache list.
export const publicShellFiles = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png'] as const;

// Emits /sw.js from src/pwa/service-worker.js with the exact build output as its precache list and a
// content-derived version, so every deployment installs a fresh shell cache and drops the previous one.
export function serviceWorkerPlugin(): Plugin {
  const template = readFileSync(new URL('./src/pwa/service-worker.js', import.meta.url), 'utf8');
  return {
    name: 'nursery-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256').update(template);
      const built = Object.values(bundle).filter((file) => file.fileName !== 'sw.js' && !file.fileName.endsWith('.map')).sort((a, b) => a.fileName.localeCompare(b.fileName));
      for (const file of built) hash.update(file.fileName).update(file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : Buffer.from(file.source));
      for (const name of publicShellFiles) hash.update(readFileSync(new URL(`./public${name}`, import.meta.url)));
      const precache = [...built.map((file) => `/${file.fileName}`), ...publicShellFiles];
      const source = template.replaceAll('__PRECACHE__', JSON.stringify(precache)).replaceAll('__VERSION__', hash.digest('hex').slice(0, 16));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig({ plugins: [react(), serviceWorkerPlugin()], server: { proxy: { '/api': 'http://127.0.0.1:3000' } } });

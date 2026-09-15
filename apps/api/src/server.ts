import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { assertSchemaCurrent } from '@nursery/db';
import { PrivateDocumentStore } from './modules/children/private-store.js';

const config = loadConfig();
const app = buildApp(config);
// Start sequence (OPERATIONS.md): storage is writable, the schema matches this release, then listen.
await new PrivateDocumentStore(config.privateFilesDir, 'child-documents').root();
const schemaVersion = await assertSchemaCurrent(app.database.pool, config.installationId);
app.log.info({ release: config.releaseVersion, schemaVersion }, 'schema compatible');
let stopping = false;
const shutdown = (signal: string) => {
  if (stopping) return; stopping = true;
  app.log.info({ signal }, 'shutting down');
  // Idle keep-alive sockets close at once; SSE streams end through the preClose hook; stubborn sockets are cut at the deadline.
  const deadline = setTimeout(() => { app.log.warn('shutdown deadline reached; closing remaining connections'); app.server.closeAllConnections(); setTimeout(() => process.exit(1), 1000).unref(); }, config.shutdownTimeoutMs ?? 15_000);
  deadline.unref();
  void app.close().then(() => { clearTimeout(deadline); process.exit(0); }, () => process.exit(1));
};
process.once('SIGINT', () => shutdown('SIGINT')); process.once('SIGTERM', () => shutdown('SIGTERM'));
await app.listen({ host: config.host ?? '127.0.0.1', port: Number(process.env.PORT ?? config.port ?? 3000) });

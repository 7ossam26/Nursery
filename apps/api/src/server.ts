import { buildApp } from './app.js';
import { loadConfig } from './config.js';
const app = buildApp(loadConfig());
const shutdown = async () => { await app.close(); process.exit(0); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3000) });

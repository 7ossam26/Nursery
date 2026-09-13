import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { createDatabase, type Database } from '@nursery/db';
import type { ErrorCode } from '@nursery/contracts';

export class SafeError extends Error { constructor(readonly code: ErrorCode, readonly messageKey: string, readonly retryable = false, readonly statusCode = 500) { super(messageKey); } }
type DatabaseLifecycle = Pick<Database, 'checkConnection' | 'close'>;
export function buildApp(config: AppConfig, database: DatabaseLifecycle = createDatabase(config.databaseUrl)): FastifyInstance {
  const app = Fastify({ logger: { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'sessionSecret', 'password', 'token'] }, genReqId: () => crypto.randomUUID() });
  app.decorate('database', database as Database);
  app.get('/api/v1/health', async (request) => ({ status: 'ok', requestId: request.id }));
  app.get('/api/v1/readiness', async (request, reply) => {
    try { await database.checkConnection(); return { status: 'ready', requestId: request.id }; }
    catch { return reply.code(503).send({ status: 'not_ready', requestId: request.id }); }
  });
  app.setErrorHandler((error, request, reply) => {
    const safe = error instanceof SafeError ? error : new SafeError('INTERNAL_ERROR', 'errors.internal', false, 500);
    request.log.error({ err: error, code: safe.code }, 'request failed');
    return reply.code(safe.statusCode).send({ code: safe.code, messageKey: safe.messageKey, requestId: request.id, retryable: safe.retryable });
  });
  app.addHook('onClose', async () => { await database.close(); });
  return app;
}
declare module 'fastify' { interface FastifyInstance { database: Database } }

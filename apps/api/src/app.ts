import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { createDatabase, type Database } from '@nursery/db';
import { ZodError } from 'zod';
import { SafeError } from './errors.js';
import { installAuthentication } from './modules/auth/routes.js';
import { installOrganization } from './modules/organization/routes.js';
import { installLicensing } from './modules/licensing/routes.js';
import { installChildren } from './modules/children/routes.js';
import { installSafety } from './modules/safety/routes.js';
import { installLearning } from './modules/learning/routes.js';
import { installAttendance } from './modules/attendance/routes.js';
import { installExams } from './modules/exams/routes.js';
import { installHomework } from './modules/homework/routes.js';

export { SafeError } from './errors.js';
type DatabaseLifecycle = Pick<Database, 'checkConnection' | 'close'>;
export function buildApp(config: AppConfig, database: DatabaseLifecycle = createDatabase(config.databaseUrl)): FastifyInstance {
  const origin = new URL(config.appOrigin);
  const localHttp = origin.protocol === 'http:' && !config.production && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.origin !== config.appOrigin || (origin.protocol !== 'https:' && !localHttp)) throw new Error('APP_ORIGIN must be an exact HTTPS origin (HTTP is allowed only for local development).');
  const app = Fastify({ bodyLimit: 8192, trustProxy: false, logController: new LogController({ disableRequestLogging: true }), logger: { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-csrf-token', 'res.headers.set-cookie', 'sessionSecret', 'password', 'token'] }, genReqId: () => crypto.randomUUID() });
  app.decorate('database', database as Database);
  installAuthentication(app, config);
  installOrganization(app);
  installLicensing(app);
  installChildren(app,config);
  installSafety(app);
  installLearning(app);
  installAttendance(app);
  installExams(app);
  installHomework(app);
  app.get('/api/v1/health', { config: { public: true } }, async (request) => ({ status: 'ok', requestId: request.id }));
  app.get('/api/v1/readiness', { config: { public: true } }, async (request, reply) => {
    try { await database.checkConnection(); return { status: 'ready', requestId: request.id }; }
    catch { return reply.code(503).send({ status: 'not_ready', requestId: request.id }); }
  });
  app.setErrorHandler((error, request, reply) => {
    const frameworkStatus = (error as { statusCode?: number }).statusCode;
    const safe = error instanceof SafeError ? error : error instanceof ZodError || [400, 413, 415].includes(frameworkStatus ?? 0) ? new SafeError('VALIDATION_ERROR', 'auth.validation', false, frameworkStatus ?? 400) : new SafeError('INTERNAL_ERROR', 'errors.internal', false, 500);
    // Raw parser/database errors can contain secrets; log only classification and request ID.
    if (safe.statusCode >= 500) request.log.error({ code: safe.code, requestId: request.id }, 'request failed');
    if (safe.code === 'RATE_LIMITED') reply.header('Retry-After', '900');
    return reply.code(safe.statusCode).send({ code: safe.code, messageKey: safe.messageKey, requestId: request.id, retryable: safe.retryable, ...(safe.publicMessage ? { publicMessage: safe.publicMessage } : {}) });
  });
  app.addHook('onClose', async () => { await database.close(); });
  return app;
}
declare module 'fastify' { interface FastifyInstance { database: Database } }

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../../config.js';
import { SupportService } from './service.js';

declare module 'fastify' { interface FastifyInstance { support: SupportService } }
export function installSupport(app: FastifyInstance, config: AppConfig) {
  const service = new SupportService(app.licensing, config); app.decorate('support', service);
  const prefix = '/api/v1/support';
  app.get(`${prefix}/status`, async (r) => ({ data: await service.status(r.sessionToken) }));
  app.get(`${prefix}/audit`, async (r) => ({ data: await service.audit_(r.sessionToken, r.query) }));
  app.get(`${prefix}/accounts`, async (r) => ({ data: await service.accounts(r.sessionToken, r.query) }));
  app.get(`${prefix}/backups`, async (r) => ({ data: await service.backups(r.sessionToken) }));
  app.post(`${prefix}/backups`, { bodyLimit: 2048 }, async (r, reply) => reply.code(201).send({ data: await service.requestBackup(r.sessionToken, r.body) }));
  app.get(`${prefix}/restore-validations`, async (r) => ({ data: await service.restoreValidations(r.sessionToken) }));
  app.post(`${prefix}/restore-validations`, { bodyLimit: 2048 }, async (r, reply) => reply.code(201).send({ data: await service.requestRestoreValidation(r.sessionToken, r.body) }));
  app.get(`${prefix}/children/:id/dependents`, async (r) => ({ data: await service.childDependents(r.sessionToken, z.object({ id: z.uuid() }).strict().parse(r.params).id) }));
}

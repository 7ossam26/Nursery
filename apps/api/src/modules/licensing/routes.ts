import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { moduleKeySchema } from '@nursery/contracts';
import { LicensingService } from './service.js';

declare module 'fastify' { interface FastifyInstance { licensing: LicensingService } }
export function installLicensing(app: FastifyInstance) {
  const service = new LicensingService(app.auth); app.decorate('licensing', service);
  const id = (params: unknown) => z.object({ id: z.uuid() }).strict().parse(params).id;
  const moduleKey = (params: unknown) => z.object({ key: moduleKeySchema }).strict().parse(params).key;
  const prefix = '/api/v1/licensing';

  app.get(`${prefix}/branding`, { config: { public: true } }, async () => ({ data: await service.branding() }));

  app.get(`${prefix}/context`, async (r) => ({ data: await service.context(r.sessionToken) }));
  app.put(`${prefix}/limits`, { bodyLimit: 16384 }, async (r) => ({ data: await service.saveLimits(r.sessionToken, r.body) }));
  app.post(`${prefix}/renewal-payments`, { bodyLimit: 16384 }, async (r, reply) => reply.code(201).send({ data: await service.recordRenewalPayment(r.sessionToken, r.body) }));

  app.get(`${prefix}/modules`, async (r) => ({ data: await service.modules(r.sessionToken) }));
  app.post(`${prefix}/modules/:key/preview`, { bodyLimit: 4096 }, async (r) => ({ data: await service.previewModuleChange(r.sessionToken, moduleKey(r.params), r.body) }));
  app.put(`${prefix}/modules/:key`, { bodyLimit: 4096 }, async (r) => ({ data: await service.saveModuleSetting(r.sessionToken, moduleKey(r.params), r.body) }));

  app.get(`${prefix}/settings`, async (r) => ({ data: await service.nurserySettings(r.sessionToken) }));
  app.put(`${prefix}/settings`, { bodyLimit: 16384 }, async (r) => ({ data: await service.saveNurserySettings(r.sessionToken, r.body) }));

  app.post(`${prefix}/staff`, { bodyLimit: 4096 }, async (r, reply) => reply.code(201).send({ data: await service.provisionStaff(r.sessionToken, r.body) }));
  app.post(`${prefix}/parents`, { bodyLimit: 4096 }, async (r, reply) => reply.code(201).send({ data: await service.provisionParent(r.sessionToken, r.body) }));

  app.post(`${prefix}/accounts/:id/release`, { bodyLimit: 4096 }, async (r, reply) => { await service.releaseSeat(r.sessionToken, id(r.params), r.body); return reply.code(204).send(); });
  app.post(`${prefix}/accounts/:id/restore`, { bodyLimit: 4096 }, async (r) => ({ data: await service.restoreAccount(r.sessionToken, id(r.params), r.body) }));
  app.post(`${prefix}/accounts/:id/deactivate`, { bodyLimit: 4096 }, async (r, reply) => { await service.deactivateAccount(r.sessionToken, id(r.params), r.body); return reply.code(204).send(); });
  app.post(`${prefix}/accounts/:id/reactivate`, { bodyLimit: 4096 }, async (r, reply) => { await service.reactivateAccount(r.sessionToken, id(r.params), r.body); return reply.code(204).send(); });
  app.post(`${prefix}/accounts/:id/block`, { bodyLimit: 4096 }, async (r, reply) => { await service.blockAccount(r.sessionToken, id(r.params), r.body); return reply.code(204).send(); });
  app.post(`${prefix}/accounts/:id/unblock`, { bodyLimit: 4096 }, async (r, reply) => { await service.unblockAccount(r.sessionToken, id(r.params), r.body); return reply.code(204).send(); });

  app.post(`${prefix}/support-context`, { bodyLimit: 1024 }, async (r) => ({ data: await service.supportContext(r.sessionToken, (z.object({ reason: z.string() }).strict().parse(r.body)).reason) }));
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SafetyService } from './service.js';
declare module 'fastify' { interface FastifyInstance { safety: SafetyService } }
export function installSafety(app: FastifyInstance) {
  const service = new SafetyService(app.children); app.decorate('safety',service);
  const id = (params: unknown) => z.object({ id: z.uuid() }).strict().parse(params).id;
  // Long bilingual incident narratives exceed the default 8 KiB body limit; every other payload stays within it.
  const incidentBody = { bodyLimit: 32768 };
  app.get('/api/v1/children/:id/safety',async (r) => ({ data: await service.staffView(r.sessionToken,id(r.params)) }));
  app.get('/api/v1/parent/children/:id/safety',async (r) => ({ data: await service.guardianView(r.sessionToken,id(r.params)) }));
  app.post('/api/v1/children/:id/health-entries',async (r,reply) => reply.code(201).send({ data: await service.createHealthEntry(r.sessionToken,id(r.params),r.body) }));
  app.put('/api/v1/health-entries/:id',async (r) => ({ data: await service.updateHealthEntry(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/health-entries/:id/retire',async (r) => ({ data: await service.retireHealthEntry(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/children/:id/pickup-authorizations',async (r,reply) => reply.code(201).send({ data: await service.createAuthorization(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/pickup-authorizations/:id/deactivate',async (r) => ({ data: await service.deactivateAuthorization(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/pickup-authorizations/:id/review',async (r) => ({ data: await service.reviewAuthorization(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/children/:id/pickup-restrictions',async (r,reply) => reply.code(201).send({ data: await service.createRestriction(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/pickup-restrictions/:id/deactivate',async (r) => ({ data: await service.deactivateRestriction(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/children/:id/pickup-records',async (r,reply) => reply.code(201).send({ data: await service.recordPickup(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/children/:id/incidents',incidentBody,async (r,reply) => reply.code(201).send({ data: await service.reportIncident(r.sessionToken,id(r.params),r.body) }));
  app.put('/api/v1/incidents/:id',incidentBody,async (r) => ({ data: await service.updateIncident(r.sessionToken,id(r.params),r.body) }));
}

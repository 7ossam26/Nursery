import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrganizationService } from './service.js';

declare module 'fastify' { interface FastifyInstance { organization: OrganizationService } }
export function installOrganization(app: FastifyInstance) {
  const service = new OrganizationService(app.auth); app.decorate('organization',service);
  const id = (params: unknown) => z.object({ id: z.uuid() }).strict().parse(params).id;
  app.get('/api/v1/organization/context', async (r) => ({ data: await service.context(r.sessionToken) }));
  for (const catalog of ['branches','classrooms','age-groups','roles'] as const) {
    const path = `/api/v1/organization/${catalog}`;
    app.get(path, async (r) => ({ data: await service.list(r.sessionToken,catalog,r.query) }));
    app.post(path, { bodyLimit: 16384 }, async (r,reply) => reply.code(201).send({ data: await service.save(r.sessionToken,catalog,r.body) }));
    app.put(`${path}/:id`, { bodyLimit: 16384 }, async (r) => ({ data: await service.save(r.sessionToken,catalog,r.body,id(r.params)) }));
    if (catalog === 'branches' || catalog === 'classrooms') app.get(`${path}/:id`, async (r) => ({ data: await service.detail(r.sessionToken,catalog,id(r.params)) }));
  }
  app.get('/api/v1/organization/staff', async (r) => ({ data: await service.staffList(r.sessionToken,r.query) }));
  app.put('/api/v1/organization/staff/:id/assignments', { bodyLimit: 16384 }, async (r) => ({ data: await service.assign(r.sessionToken,id(r.params),r.body) }));
  for (const kind of ['delegation','grant'] as const) app.put(`/api/v1/organization/staff/:id/${kind}`, { bodyLimit: 16384 }, async (r) => ({ data: await service.delegateOrGrant(r.sessionToken,id(r.params),kind,r.body) }));
}

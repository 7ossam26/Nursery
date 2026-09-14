import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommunicationService } from './service.js';
import { installParentLive } from './live.js';
declare module 'fastify' { interface FastifyInstance { communication: CommunicationService } }
export function installCommunication(app: FastifyInstance) {
  const s=new CommunicationService(app.children,app.learning); app.decorate('communication',s);
  installParentLive(app);
  const id=(raw: unknown) => z.object({ id: z.uuid() }).strict().parse(raw).id;
  app.post('/api/v1/announcements',async (r) => ({ data: await s.publish(r.sessionToken,r.body) }));
  app.get('/api/v1/announcements/options',async (r) => ({ data: await s.options(r.sessionToken,r.query) }));
  app.get('/api/v1/parent/announcements',async (r) => ({ data: await s.announcements(r.sessionToken,r.query) }));
  app.get('/api/v1/parent/announcements/:id',async (r) => ({ data: await s.announcement(r.sessionToken,id(r.params)) }));
  app.post('/api/v1/parent/announcements/:id/acknowledgment',async (r,reply) => { z.object({}).strict().parse(r.body); await s.acknowledge(r.sessionToken,id(r.params)); return reply.code(204).send(); });
  app.get('/api/v1/parent/notifications',async (r) => ({ data: await s.notifications(r.sessionToken,r.query) }));
  app.get('/api/v1/parent/contact',async (r) => ({ data: await s.contact(r.sessionToken) }));
  app.put('/api/v1/parent/notifications/:id/read',async (r,reply) => { const { read }=z.object({ read: z.boolean() }).strict().parse(r.body); await s.setRead(r.sessionToken,id(r.params),read); return reply.code(204).send(); });
}

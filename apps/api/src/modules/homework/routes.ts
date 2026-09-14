import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HomeworkService } from './service.js';
declare module 'fastify' { interface FastifyInstance { homework: HomeworkService } }
export function installHomework(app: FastifyInstance) {
  const s=new HomeworkService(app.children,app.learning); app.decorate('homework',s);
  const id=(raw: unknown) => z.object({ id: z.uuid() }).strict().parse(raw).id;
  app.post('/api/v1/homework',{ bodyLimit: 65536 },async (r) => ({ data: await s.publish(r.sessionToken,r.body) }));
  app.get('/api/v1/homework',async (r) => { const q=z.object({ classroomId: z.uuid(),date: z.iso.date(),overdue: z.enum(['true','false']).default('false') }).strict().parse(r.query); return { data: await s.list(r.sessionToken,q.classroomId,q.date,q.overdue==='true') }; });
  app.post('/api/v1/homework/:id/corrections',async (r) => ({ data: await s.correctContent(r.sessionToken,id(r.params),r.body) }));
  app.get('/api/v1/homework/:id/versions',async (r) => ({ data: await s.versions(r.sessionToken,id(r.params)) }));
  app.get('/api/v1/homework/:id/roster',async (r) => { const q=z.object({ date: z.iso.date() }).strict().parse(r.query); return { data: await s.roster(r.sessionToken,id(r.params),q.date) }; });
  app.post('/api/v1/homework/outcomes',{ bodyLimit: 1048576 },async (r) => ({ data: await s.publishOutcomes(r.sessionToken,r.body) }));
  app.post('/api/v1/homework/outcomes/corrections',async (r) => ({ data: await s.correctOutcome(r.sessionToken,r.body) }));
  app.post('/api/v1/homework/no-homework-day',{ bodyLimit: 1048576 },async (r) => ({ data: await s.noHomeworkDay(r.sessionToken,r.body) }));
  app.get('/api/v1/homework/children/:id/history',async (r) => ({ data: await s.history(r.sessionToken,id(r.params),r.query) }));
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { learningDateSchema } from '@nursery/contracts';
import { LearningService } from './service.js';
declare module 'fastify' { interface FastifyInstance { learning: LearningService } }
export function installLearning(app: FastifyInstance) {
  const service = new LearningService(app.children); app.decorate('learning',service);
  const id = (raw: unknown) => z.object({ id: z.uuid() }).strict().parse(raw).id;
  app.get('/api/v1/learning/configuration',async (r) => ({ data: await service.configuration(r.sessionToken) }));
  app.get('/api/v1/learning/context',async (r) => ({ data: await service.context(r.sessionToken) }));
  app.put('/api/v1/learning/configuration',{ bodyLimit: 1048576 },async (r) => ({ data: await service.saveConfiguration(r.sessionToken,r.body) }));
  app.get('/api/v1/learning/roster',async (r) => ({ data: await service.roster(r.sessionToken,z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().parse(r.query).offset) }));
  app.get('/api/v1/learning/children/:id/daily',async (r) => ({ data: await service.daily(r.sessionToken,id(r.params),learningDateSchema.parse(r.query).date) }));
  app.get('/api/v1/learning/children/:id/history',async (r) => { const q = learningDateSchema.extend({ definitionId: z.uuid() }).parse(r.query); return { data: await service.history(r.sessionToken,id(r.params),q.date,q.definitionId) }; });
  app.post('/api/v1/learning/publications',async (r) => ({ data: await service.publish(r.sessionToken,r.body) }));
  app.post('/api/v1/learning/transitions',async (r) => ({ data: await service.publish(r.sessionToken,r.body,'TRANSITION') }));
  app.post('/api/v1/learning/corrections',async (r) => ({ data: await service.publish(r.sessionToken,r.body,'CORRECTION') }));
  app.post('/api/v1/learning/classroom-publications',{ bodyLimit: 1048576 },async (r) => ({ data: await service.batch(r.sessionToken,r.body) }));
}

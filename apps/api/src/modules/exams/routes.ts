import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ExamService } from './service.js';
declare module 'fastify' { interface FastifyInstance { exams: ExamService } }
const classroomDate = z.object({ classroomId: z.uuid(), date: z.iso.date() }).strict();
export function installExams(app: FastifyInstance) {
  const service = new ExamService(app.children,app.learning); app.decorate('exams',service);
  const id = (raw: unknown) => z.object({ id: z.uuid() }).strict().parse(raw).id;
  app.get('/api/v1/exams/catalog',async (r) => ({ data: await service.catalogs(r.sessionToken) }));
  app.post('/api/v1/exams/catalog/subjects',async (r) => ({ data: await service.saveCatalog(r.sessionToken,'subjects',r.body) }));
  app.put('/api/v1/exams/catalog/subjects/:id',async (r) => ({ data: await service.saveCatalog(r.sessionToken,'subjects',r.body,id(r.params)) }));
  app.post('/api/v1/exams/catalog/types',async (r) => ({ data: await service.saveCatalog(r.sessionToken,'exam_types',r.body) }));
  app.put('/api/v1/exams/catalog/types/:id',async (r) => ({ data: await service.saveCatalog(r.sessionToken,'exam_types',r.body,id(r.params)) }));
  app.post('/api/v1/exams',async (r) => ({ data: await service.create(r.sessionToken,r.body) }));
  app.get('/api/v1/exams',async (r) => { const q = classroomDate.parse(r.query); return { data: await service.listForClassroom(r.sessionToken,q.classroomId,q.date) }; });
  app.post('/api/v1/exams/results',{ bodyLimit: 1048576 },async (r) => ({ data: await service.publishResults(r.sessionToken,r.body) }));
  app.post('/api/v1/exams/results/corrections',async (r) => ({ data: await service.correctResult(r.sessionToken,r.body) }));
  app.post('/api/v1/exams/no-exam-day',async (r) => ({ data: await service.noExamDay(r.sessionToken,r.body) }));
  app.get('/api/v1/exams/children/:id/history',async (r) => ({ data: await service.history(r.sessionToken,id(r.params),r.query) }));
  app.get('/api/v1/exams/:id',async (r) => ({ data: await service.detail(r.sessionToken,id(r.params)) }));
  app.get('/api/v1/exams/:id/roster',async (r) => { const q=z.object({offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(r.query); return { data: await service.roster(r.sessionToken,id(r.params),q.offset) }; });
}

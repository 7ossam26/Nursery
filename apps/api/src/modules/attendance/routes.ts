import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { learningDateSchema } from '@nursery/contracts';
import { AttendanceService } from './service.js';
declare module 'fastify' { interface FastifyInstance { attendance: AttendanceService } }
export function installAttendance(app: FastifyInstance) {
  const service=new AttendanceService(app.children,app.learning); app.decorate('attendance',service);
  const id=(raw: unknown) => z.object({ id: z.uuid() }).strict().parse(raw).id;
  app.get('/api/v1/attendance/classrooms/:id/draft',async (r) => { const q=learningDateSchema.extend({offset:z.coerce.number().int().min(0).max(100000).default(0)}).parse(r.query); return { data: await service.classroom(r.sessionToken,id(r.params),q.date,q.offset) }; });
  app.post('/api/v1/attendance/classroom-publications',{ bodyLimit: 1048576 },async (r) => ({ data: await service.publishClassroom(r.sessionToken,r.body) }));
  app.post('/api/v1/attendance/corrections',async (r) => ({ data: await service.correct(r.sessionToken,r.body) }));
  app.post('/api/v1/attendance/no-class',async (r) => ({ data: await service.noClass(r.sessionToken,r.body) }));
  app.get('/api/v1/attendance/children/:id/daily',async (r) => ({ data: await service.daily(r.sessionToken,id(r.params),learningDateSchema.parse(r.query).date) }));
  app.get('/api/v1/attendance/children/:id/history',async (r) => ({ data: await service.history(r.sessionToken,id(r.params),learningDateSchema.parse(r.query).date) }));
  app.put('/api/v1/attendance/planned-absence',async (r) => ({ data: await service.plannedAbsence(r.sessionToken,r.body) }));
}

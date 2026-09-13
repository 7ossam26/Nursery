import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config.js';
import { z } from 'zod';
import { ChildService } from './service.js';
import { ChildDocumentService } from './documents.js';
declare module 'fastify' { interface FastifyInstance { children: ChildService; childDocuments: ChildDocumentService } }
export function installChildren(app: FastifyInstance,config: AppConfig) {
  const service = new ChildService(app.licensing); const documents = new ChildDocumentService(service,config.privateFilesDir);
  app.decorate('children',service); app.decorate('childDocuments',documents);
  const id = (params: unknown) => z.object({ id: z.uuid() }).strict().parse(params).id;
  app.get('/api/v1/children/options',async (r) => ({ data: await service.options(r.sessionToken) }));
  app.get('/api/v1/children',async (r) => ({ data: await service.list(r.sessionToken,r.query) }));
  app.get('/api/v1/children/:id',async (r) => ({ data: await service.detail(r.sessionToken,id(r.params)) }));
  app.post('/api/v1/children/onboarding',{ bodyLimit: 65536 },async (r,reply) => {
    const result = await service.onboard(r.sessionToken,r.body); return reply.code(result.replayed ? 200 : 201).send({ data: result });
  });
  app.put('/api/v1/children/:id',{ bodyLimit: 16384 },async (r) => ({ data: await service.update(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/children/:id/lifecycle',async (r) => ({ data: await service.lifecycle(r.sessionToken,id(r.params),r.body) }));
  app.post('/api/v1/children/:id/classroom-moves',async (r) => ({ data: await service.moveClassroom(r.sessionToken,id(r.params),r.body) }));
  app.put('/api/v1/children/:id/guardian-links',async (r) => ({ data: await service.linkGuardian(r.sessionToken,id(r.params),r.body) }));
  app.get('/api/v1/guardians',async (r) => ({ data: await service.guardianOptions(r.sessionToken,r.query) }));
  app.put('/api/v1/guardians/:id',async (r) => ({ data: await service.updateGuardian(r.sessionToken,id(r.params),r.body) }));
  app.get('/api/v1/parent/children',async (r) => ({ data: await service.guardianChildren(r.sessionToken) }));
  app.get('/api/v1/parent/children/:id',async (r) => ({ data: await service.guardianDetail(r.sessionToken,id(r.params)) }));
  app.post('/api/v1/children/:id/documents',{ bodyLimit: 7*1024*1024+4096 },async (r,reply) => reply.code(201).send({ data: await documents.upload(r.sessionToken,id(r.params),r.body) }));
  app.get('/api/v1/child-documents/:id/download',async (r,reply) => {
    const file = await documents.download(r.sessionToken,id(r.params));
    return reply.type(file.mimeType).header('Content-Disposition',`attachment; filename="${file.filename}"`).send(file.bytes);
  });
  app.post('/api/v1/child-documents/:id/retire',async (r,reply) => { z.object({}).strict().parse(r.body); await documents.retire(r.sessionToken,id(r.params)); return reply.code(204).send(); });
  app.post('/api/v1/child-documents/cleanup',async (r) => { z.object({}).strict().parse(r.body); return { data: await documents.cleanup(r.sessionToken) }; });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IMPORT_LIMITS } from '@nursery/contracts';
import { ImportService } from './service.js';

declare module 'fastify' { interface FastifyInstance { imports:ImportService } }
export function installImports(app:FastifyInstance) {
 const imports=new ImportService(app.financialCore,app.ledger,app.payroll,app.organization,app.licensing);app.decorate('imports',imports);
 const id=(raw:unknown)=>z.object({id:z.uuid()}).strict().parse(raw).id;
 app.get('/api/v1/imports/options',async r=>({data:await imports.options(r.sessionToken)}));
 app.get('/api/v1/imports/templates/:kind',async(r,reply)=>{const file=await imports.template(r.sessionToken,z.object({kind:z.string()}).strict().parse(r.params).kind);return reply.type(file.mimeType).header('Cache-Control','private, no-store').header('Content-Disposition',`attachment; filename="${file.filename}"`).send(file.bytes);});
 // Bounded JSON/base64 upload (same transport as private documents); the workbook is inspected and parsed under hard caps.
 app.post('/api/v1/imports',{bodyLimit:4*Math.ceil(IMPORT_LIMITS.maxFileBytes/3)+4096},async(r,reply)=>reply.code(201).send({data:await imports.upload(r.sessionToken,r.body)}));
 app.get('/api/v1/imports/:id',async r=>({data:await imports.batch(r.sessionToken,id(r.params))}));
 app.post('/api/v1/imports/:id/commit',async r=>({data:await imports.commit(r.sessionToken,id(r.params),r.body)}));
}

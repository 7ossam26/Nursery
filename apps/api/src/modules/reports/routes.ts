import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportService } from './service.js';

declare module 'fastify' { interface FastifyInstance { reports:ReportService } }
export function installReports(app:FastifyInstance,privateFilesDir:string) {
 const reports=new ReportService(app.children,privateFilesDir);app.decorate('reports',reports);
 const id=(raw:unknown)=>z.object({id:z.uuid()}).strict().parse(raw).id;
 app.get('/api/v1/reports',async r=>({data:await reports.report(r.sessionToken,r.query)}));
 app.get('/api/v1/reports/options',async r=>({data:await reports.options(r.sessionToken)}));
 app.post('/api/v1/reports/exports',async r=>({data:await reports.createExport(r.sessionToken,r.body)}));
 app.get('/api/v1/reports/exports/:id/download',async(r,reply)=>{const file=await reports.download(r.sessionToken,id(r.params));if(file.pending) return reply.code(202).send({data:file});return reply.type(file.mimeType).header('Cache-Control','private, no-store').header('Content-Disposition',`attachment; filename="${file.filename}"`).send(file.bytes);});
 app.get('/api/v1/reports/exports/:id',async r=>({data:await reports.status(r.sessionToken,id(r.params))}));
 app.post('/api/v1/reports/exports/cleanup',async r=>({data:await reports.cleanup(r.sessionToken)}));
}

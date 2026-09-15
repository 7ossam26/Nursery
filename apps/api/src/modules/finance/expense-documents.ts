import { randomUUID } from 'node:crypto';
import { lstat,readdir,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { expenseDocumentInputSchema,expenseActionInputSchema,type ExpenseDocument } from '@nursery/contracts';
import { PrivateDocumentStore,FILE_LOCK,documentHash } from '../children/private-store.js';
import { validateDocument } from '../children/documents.js';
import { requireRecord,requireCapability,denied } from '../organization/policy.js';
import type { SpendingService } from './spending.js';

export class ExpenseDocumentService {
 readonly store:PrivateDocumentStore;
 constructor(readonly spending:SpendingService,configuredRoot:string) {this.store=new PrivateDocumentStore(configuredRoot,'expense-documents');}
 async upload(token:string,expenseId:string,raw:unknown) {
  const input=expenseDocumentInputSchema.parse(raw),key=randomUUID();let wrote=false;
  try {
   const fingerprint={expenseId,operationId:input.operationId,name:input.name,expiresOn:input.expiresOn,mimeType:input.mimeType,contentHash:documentHash(Buffer.from(input.contentBase64,'base64'))};
   return await this.spending.core.children.withPolicy(token,(tx,p)=>this.spending.core.operation(tx,p,input.operationId,'EXPENSE_DOCUMENT_UPLOAD',fingerprint,'expenses.manage',async()=>{
    const e=await this.spending.lockExpense(tx,p,expenseId,'expenses.manage'),r={branchId:e.branch_id,classroomId:e.classroom_id??undefined};requireRecord(p,'documents.manage',r);return [r];
   },async()=>{
    await tx.query('select pg_advisory_xact_lock_shared($1)',[FILE_LOCK]);const bytes=await validateDocument(Buffer.from(input.contentBase64,'base64'),input.mimeType);await this.store.write(key,bytes);wrote=true;
    const id=randomUUID();await tx.query('insert into expense_documents(id,expense_id,name,expires_on,storage_key,mime_type,byte_size,sha256,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,expenseId,input.name,input.expiresOn,key,input.mimeType,bytes.length,documentHash(bytes),p.account.id,input.operationId]);return {id,name:input.name,expiresOn:input.expiresOn,mimeType:input.mimeType,byteSize:bytes.length};
   },async()=>{const e=await this.spending.lockExpense(tx,p,expenseId,'expenses.manage');requireRecord(p,'documents.manage',{branchId:e.branch_id,classroomId:e.classroom_id??undefined});}));
  } catch(error) {
   if(wrote) try {const referenced=await this.spending.core.children.licensing.auth.database.pool.query('select 1 from expense_documents where storage_key=$1',[key]);if(!referenced.rowCount) await this.store.remove(key);} catch {/* Preserve an uncertain committed candidate for conservative cleanup. */}
   throw error;
  }
 }
 async list(token:string,expenseId:string):Promise<ExpenseDocument[]> {
  return this.spending.core.children.withPolicy(token,async(tx,p)=>{
   await this.spending.core.enabled(tx);const e=await this.spending.lockExpense(tx,p,expenseId,'finance.read');requireRecord(p,'documents.manage',{branchId:e.branch_id,classroomId:e.classroom_id??undefined});
   return (await tx.query<ExpenseDocument>('select d.id,d.name,d.expires_on::text as "expiresOn",d.mime_type as "mimeType",d.byte_size as "byteSize" from expense_documents d where expense_id=$1 and not exists(select 1 from expense_document_retirements r where r.document_id=d.id) order by d.name,d.id limit 50',[expenseId])).rows;
  });
 }
 async download(token:string,id:string) {
  return this.spending.core.children.withPolicy(token,async(tx,p)=>{
   await this.spending.core.enabled(tx);const owner=(await tx.query<{expense_id:string}>('select expense_id from expense_documents where id=$1',[id])).rows[0];if(!owner) throw denied();
   const e=await this.spending.lockExpense(tx,p,owner.expense_id,'finance.read');requireRecord(p,'documents.manage',{branchId:e.branch_id,classroomId:e.classroom_id??undefined});
   const doc=(await tx.query<{storage_key:string;sha256:string;mime_type:string}>('select d.storage_key,d.sha256,d.mime_type from expense_documents d where id=$1 and not exists(select 1 from expense_document_retirements r where r.document_id=d.id)',[id])).rows[0];if(!doc) throw denied();
   await tx.query('select pg_advisory_xact_lock_shared($1)',[FILE_LOCK]);const bytes=await this.store.read(doc.storage_key,doc.sha256);
   // This private operational audit never appears in the public document DTO.
   await this.spending.core.children.audit(tx,p,null,'expense_document.downloaded',null,{id,expenseId:owner.expense_id});
   return {bytes,mimeType:doc.mime_type,filename:`${id}.${doc.mime_type==='application/pdf'?'pdf':doc.mime_type==='image/png'?'png':'jpg'}`};
  });
 }
 async retire(token:string,id:string,raw:unknown) {
  const input=expenseActionInputSchema.parse(raw);
  return this.spending.core.children.withPolicy(token,(tx,p)=>this.spending.core.operation(tx,p,input.operationId,'EXPENSE_DOCUMENT_RETIRE',{id,...input},'expenses.manage',async()=>{
   const owner=(await tx.query<{expense_id:string}>('select expense_id from expense_documents where id=$1',[id])).rows[0];if(!owner) throw denied();const e=await this.spending.lockExpense(tx,p,owner.expense_id,'expenses.manage');const r={branchId:e.branch_id,classroomId:e.classroom_id??undefined};requireRecord(p,'documents.manage',r);return [r];
  },async()=>{await tx.query('insert into expense_document_retirements(document_id,reason,actor_id,operation_id) values($1,$2,$3,$4)',[id,input.reason,p.account.id,input.operationId]);return {id};},async()=>{
   const owner=(await tx.query<{branch_id:string;classroom_id:string|null}>('select e.branch_id,e.classroom_id from expense_documents d join expenses e on e.id=d.expense_id where d.id=$1',[id])).rows[0];if(!owner) throw denied();requireRecord(p,'documents.manage',{branchId:owner.branch_id,classroomId:owner.classroom_id??undefined});
  }));
 }
 async cleanup(token:string) {
  return this.spending.core.children.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'support.access');await tx.query('select pg_advisory_xact_lock($1)',[FILE_LOCK]);
   const root=await this.store.root(),referenced=new Set((await tx.query<{storage_key:string}>('select storage_key from expense_documents')).rows.map(r=>r.storage_key));let removed=0;
   for(const entry of await readdir(root,{withFileTypes:true})) {
    if(!entry.isFile()||!/^[0-9a-f-]{36}\.blob$/.test(entry.name)) continue;const key=entry.name.slice(0,-5);if(!z.uuid().safeParse(key).success||referenced.has(key)) continue;
    const path=resolve(root,entry.name),stat=await lstat(path);if(!stat.isSymbolicLink()&&stat.isFile()&&stat.mtimeMs<Date.now()-24*60*60_000) {await unlink(path);removed++;}
   }
   await this.spending.core.children.audit(tx,p,null,'expense_documents.abandoned_cleanup',null,{removed});return {removed};
  });
 }
}

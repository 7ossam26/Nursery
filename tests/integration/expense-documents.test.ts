import { afterEach,describe,it,expect } from 'vitest';
import { PDFDocument,PDFName,PDFString } from 'pdf-lib';
import { readdir,writeFile,utimes,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { financeFixture } from '../helpers/finance.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';

describe('Phase 16 shared private expense document service',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{await f?.close();});
 async function setup() {
  f=await financeFixture();const category=await f.app.spending.category(f.root.token,{operationId:crypto.randomUUID(),code:'RENT',name:'Rent'});
  const expense=await f.app.spending.create(f.root.token,{operationId:crypto.randomUUID(),branchId:f.a.id,classroomId:f.classes[0].id,categoryId:category.id,amount:'100000',dueOn:'2026-10-01',note:'Private invoice'});
  const pdf=await PDFDocument.create();pdf.addPage();
  const doc={operationId:crypto.randomUUID(),name:'Original expense invoice',expiresOn:null,mimeType:'application/pdf',contentBase64:Buffer.from(await pdf.save()).toString('base64')};
  const request=(token:string,url:string,method:'GET'|'POST'='GET',payload?:unknown)=>f.app.inject({method,url,headers:{cookie:`__Host-nursery_session=${token}`,origin:f.config.appOrigin,'content-type':'application/json','x-csrf-token':keyedHash(f.config.sessionSecret,`session-csrf:${token}`)},...(payload===undefined?{}:{payload})});
  return {expense,doc,request};
 }
 it('A37/A18: same-key upload stores one sanitized file; downloads require current scope, finance/module and document capability; retirement retains history',async()=>{
  const {expense,doc,request}=await setup();const uploaded=await request(f.root.token,`/api/v1/expenses/${expense.id}/documents`,'POST',doc);expect(uploaded.statusCode).toBe(200);const metadata=uploaded.json().data;
  expect((await request(f.root.token,`/api/v1/expenses/${expense.id}/documents`,'POST',doc)).json().data).toEqual(metadata);
  const root=join(f.config.privateFilesDir,'expense-documents');expect(await readdir(root)).toHaveLength(1);
  const downloaded=await request(f.root.token,`/api/v1/expense-documents/${metadata.id}/download`);expect(downloaded.statusCode).toBe(200);expect(downloaded.headers['content-disposition']).toContain('attachment;');expect(downloaded.headers['cache-control']).toBe('private, no-store');expect((await PDFDocument.load(downloaded.rawPayload)).getPageCount()).toBe(1);
  expect(JSON.stringify(metadata)).not.toMatch(/storage|sha256|created_at/);expect((await f.database.pool.query("select details from financial_audit_events where action='EXPENSE_DOCUMENT_UPLOAD'")).rows[0].details.input).not.toHaveProperty('contentBase64');
  const foreign=await f.financeStaff([f.b.id],[],'BRANCH',['finance.read','documents.manage']);const wrongClass=await f.financeStaff([f.a.id],[f.classes[1].id],'CLASSROOM',['finance.read','documents.manage']);const noDocuments=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read']);
  for(const token of [foreign.token,wrongClass.token,noDocuments.token]) expect((await request(token,`/api/v1/expense-documents/${metadata.id}/download`)).statusCode).toBe(403);
  const reader=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM',['finance.read','documents.manage']);expect((await request(reader.token,`/api/v1/expense-documents/${metadata.id}/download`)).statusCode).toBe(200);
  await f.app.organization.assign(f.root.token,reader.account.id,{expectedVersion:2,roleIds:[],branchIds:[f.b.id],classroomIds:[],scopeMode:'BRANCH'});expect((await request(reader.token,`/api/v1/expense-documents/${metadata.id}/download`)).statusCode).toBe(403);
  expect((await request(f.root.token,'/api/v1/expense-documents/%2e%2e%2fsecret/download')).statusCode).toBe(400);
  expect((await request(f.root.token,`/api/v1/expenses/${expense.id}/documents`,'POST',{...doc,operationId:crypto.randomUUID(),storageKey:'../../public'})).statusCode).toBe(400);
  await f.database.pool.query("update module_settings set enabled=false where module_key='FINANCE'");expect((await request(f.root.token,`/api/v1/expense-documents/${metadata.id}/download`)).statusCode).toBe(403);await f.database.pool.query("update module_settings set enabled=true where module_key='FINANCE'");
  const retirement={operationId:crypto.randomUUID(),reason:'Retain superseded invoice privately'};await f.app.expenseDocuments.retire(f.root.token,metadata.id,retirement);await f.app.expenseDocuments.retire(f.root.token,metadata.id,retirement);
  expect(await f.app.expenseDocuments.list(f.root.token,expense.id)).toEqual([]);expect((await request(f.root.token,`/api/v1/expense-documents/${metadata.id}/download`)).statusCode).toBe(403);expect(await readdir(root)).toHaveLength(1);expect((await f.database.pool.query('select count(*)::int n from expense_document_retirements')).rows[0].n).toBe(1);
 });
 it('A37: active PDFs/incorrect content are rejected; failed audit removes unreferenced bytes; conservative cleanup preserves referenced/recent/unknown files',async()=>{
  const {expense,doc}=await setup(),service=f.app.expenseDocuments;const active=await PDFDocument.create();active.addPage();active.catalog.set(PDFName.of('OpenAction'),active.context.obj({S:'JavaScript',JS:PDFString.of('attack')}));
  await expect(service.upload(f.root.token,expense.id,{...doc,contentBase64:Buffer.from(await active.save()).toString('base64')})).rejects.toMatchObject({messageKey:'children.invalidDocument'});
  await expect(service.upload(f.root.token,expense.id,{...doc,mimeType:'image/png',contentBase64:Buffer.from('<html>attack</html>').toString('base64')})).rejects.toMatchObject({messageKey:'children.invalidDocument'});
  const good=await service.upload(f.root.token,expense.id,doc);const root=join(f.config.privateFilesDir,'expense-documents'),before=await readdir(root);
  await f.database.pool.query("alter table financial_audit_events add constraint fail_document_audit check(action<>'EXPENSE_DOCUMENT_UPLOAD') not valid");
  await expect(service.upload(f.root.token,expense.id,{...doc,operationId:crypto.randomUUID()})).rejects.toBeDefined();await f.database.pool.query('alter table financial_audit_events drop constraint fail_document_audit');expect(await readdir(root)).toEqual(before);
  const old=join(root,`${crypto.randomUUID()}.blob`),recent=join(root,`${crypto.randomUUID()}.blob`),unknown=join(root,'unrelated.txt');await writeFile(old,'abandoned');await writeFile(recent,'recent');await writeFile(unknown,'unrelated');await utimes(old,new Date(0),new Date(0));
  expect(await service.cleanup(f.root.token)).toEqual({removed:1});expect(await readFile(recent,'utf8')).toBe('recent');expect(await readFile(unknown,'utf8')).toBe('unrelated');expect((await service.download(f.root.token,good.id)).bytes.length).toBeGreaterThan(0);expect(await readdir(root)).toHaveLength(3);
 });
});

import { mkdir,writeFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';

describe('Phase 15 private A4 receipts on PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 beforeEach(async()=>{f=await financeFixture();});
 afterEach(async()=>{try {expect(await reconcileFinance(f.database)).toEqual([]);}finally {await f.close();}});
 const download=(token:string,id:string)=>f.app.inject({method:'GET',url:`/api/v1/finance/receipts/${id}/download`,headers:{cookie:`__Host-nursery_session=${token}`}});
 it('A35/A37: real Arabic multi-page A4 receipt, no retained file, and current family/module/block authorization',async()=>{
  const raw=f.family('ARABICRECEIPT');raw.children[0].child.fullName='عبد الرحمن محمد أحمد إبراهيم حسن عبد الله';raw.children[0].links[0].permissions.finance=true;
  const c=await f.children.onboard(f.root.token,raw),childId=c.childIds[0];const due=await f.charge(childId,'30000',f.tuition.id,Array(30).fill('1000'));
  const input=f.collect(due.installmentIds[0],'30000');input.payerName='محمد عبد الرحمن أحمد إبراهيم';input.externalReference='BANK-2026-001';input.groups[0].allocations=due.installmentIds.map(installmentId=>({installmentId,amount:'1000'}));
  const receipt=await f.payments.collect(f.root.token,input);const id=receipt.receiptIds[0];const parent=await f.parent(c.guardianIds[0],c.credentials[0].username,c.credentials[0].temporaryPassword);
  const response=await download(parent.token,id);expect(response.statusCode).toBe(200);expect(response.headers['content-type']).toContain('application/pdf');expect(response.headers['cache-control']).toContain('no-store');expect(response.headers['content-disposition']).toMatch(/attachment; filename="FIN-\d+\.pdf"/);
  const pdf=await PDFDocument.load(response.rawPayload,{updateMetadata:false});expect(pdf.getCreationDate()).toBeUndefined();expect(pdf.getModificationDate()).toBeUndefined();expect(pdf.getPageCount()).toBeGreaterThan(1);for(const page of pdf.getPages()) {expect(page.getWidth()).toBeCloseTo(595.276,2);expect(page.getHeight()).toBeCloseTo(841.89,2);}
  expect(await readdir(f.config.privateFilesDir)).toEqual([]);
  if(process.env.PHASE15_RECEIPT_QA_DIR) {const dir=resolve(process.env.PHASE15_RECEIPT_QA_DIR);await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'arabic-receipt.pdf'),response.rawPayload);}
  const foreign=await f.child('OTHERRECEIPTFAMILY');const otherParent=await f.parent(foreign.guardianIds[0],foreign.credentials[0].username,foreign.credentials[0].temporaryPassword);
  expect((await download(otherParent.token,id)).statusCode).toBe(403);expect((await download(parent.token,'..%2F..%2Fsecret')).statusCode).toBe(400);
  await f.database.pool.query('update guardian_child_links set can_finance=false where guardian_id=$1',[c.guardianIds[0]]);expect((await download(parent.token,id)).statusCode).toBe(403);
  await f.database.pool.query('update guardian_child_links set can_finance=true where guardian_id=$1',[c.guardianIds[0]]);
  await f.licensing.blockAccount(f.root.token,c.guardianIds[0],{reason:'Explicit administration action',publicMessage:'كلم إدارة الحضانة'});expect((await download(parent.token,id)).json().code).toBe('ACCOUNT_BLOCKED');
  expect((await f.ledger.outstanding(f.root.token,{childId})).totalRemaining).toBe('0');
 });
});

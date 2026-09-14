import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { cairoIsoDate } from '@nursery/domain';
import { defaultLinkPermissions } from '@nursery/contracts';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';

describe('Phase 15 outstanding collections on PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 beforeEach(async()=>{f=await financeFixture();});
 afterEach(async()=>{try {expect(await reconcileFinance(f.database)).toEqual([]);}finally {await f.close();}});
 it('derives paid/partial/unpaid and overdue on Cairo dates; filtered total includes every page, without double-counting debt',async()=>{
  const c=await f.child('COLLECT');
  const input={operationId:crypto.randomUUID(),childId:c.childId,categoryId:f.tuition.id,amount:'600',description:'Three installments',sourceReference:crypto.randomUUID(),issuedOn:'2026-01-01',serviceFrom:null,serviceUntil:null,installments:[{dueOn:'2026-01-02',amount:'100'},{dueOn:cairoIsoDate(),amount:'200'},{dueOn:'2027-01-01',amount:'300'}]};
  const due=await f.ledger.createObligation(f.root.token,input);
  await f.payments.collect(f.root.token,f.collect(due.installmentIds[0],'40',f.a.id,f.bankA.id));
  let page=await f.ledger.outstanding(f.root.token,{childId:c.childId,limit:1});expect(page.totalRemaining).toBe('560');expect(page.totalCount).toBe(3);expect(page.items[0]).toMatchObject({remaining:'60',allocated:'40',status:'PARTIAL',overdue:true});
  page=await f.ledger.outstanding(f.root.token,{timing:'UPCOMING'});expect(page.totalRemaining).toBe('500');expect(page.items).toHaveLength(2);
  expect((await f.ledger.outstanding(f.root.token,{status:'PARTIAL',timing:'OVERDUE',categoryId:f.tuition.id})).totalRemaining).toBe('60');
  await f.payments.collect(f.root.token,f.collect(due.installmentIds[0],'60'));
  expect((await f.ledger.outstanding(f.root.token,{status:'PAID'})).items[0]).toMatchObject({remaining:'0',status:'PAID',overdue:false});
  expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.bankA.id])).rows[0].balance).toBe('40');
  expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.cashA.id])).rows[0].balance).toBe('60');
 });
 it('A01/A03: all filters and totals obey branch/classroom and guardian links; destination options expose no branch cash balances',async()=>{
  const a=await f.child('VISIBLE'),b=await f.child('FOREIGN',f.b.id),other=await f.child('OTHERCLASS',f.a.id,f.classes[1].id);
  await f.charge(a.childId,'10');await f.charge(b.childId,'20');await f.charge(other.childId,'30');
  const staff=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM');
  expect((await f.ledger.outstanding(staff.token,{})).totalRemaining).toBe('10');
  expect((await f.ledger.outstanding(staff.token,{classroomId:f.classes[1].id})).totalRemaining).toBe('0');
  await expect(f.ledger.outstanding(staff.token,{branchId:f.b.id})).rejects.toMatchObject({code:'FORBIDDEN'});
  const options=await f.ledger.collectionOptions(staff.token);expect(options.accounts.map(a=>a.id).sort()).toEqual([f.cashA.id,f.bankA.id].sort());expect(options.accounts.every(a=>!('balance' in a))).toBe(true);expect(options.classrooms.map(c=>c.id)).toEqual([f.classes[0].id]);
  const parent=await f.parent(a.guardianIds[0],a.credentials[0].username,a.credentials[0].temporaryPassword);
  expect((await f.ledger.outstanding(parent.token,{childId:a.childId})).totalRemaining).toBe('10');
  await expect(f.ledger.outstanding(parent.token,{childId:b.childId})).rejects.toMatchObject({code:'FORBIDDEN'});
  await f.database.pool.query('update guardian_child_links set can_finance=false where guardian_id=$1',[a.guardianIds[0]]);
  await expect(f.ledger.outstanding(parent.token,{childId:a.childId})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('D19: parent options and receipt lists omit forbidden siblings and never expose a grouped receipt with one forbidden line',async()=>{
  const a=await f.child('PARENTFINA'),b=await f.child('PARENTFINB');const da=await f.charge(a.childId,'100'),db=await f.charge(b.childId,'100');
  const parent=await f.parent(a.guardianIds[0],a.credentials[0].username,a.credentials[0].temporaryPassword);
  await f.children.linkGuardian(f.root.token,b.childId,{expectedChildVersion:1,accountId:a.guardianIds[0],relationship:'Parent',active:true,permissions:{...defaultLinkPermissions,finance:false}});
  const input=f.collect(da.installmentIds[0],'200');input.groups[0].allocations=[{installmentId:da.installmentIds[0],amount:'100'},{installmentId:db.installmentIds[0],amount:'100'}];const receipt=await f.payments.collect(f.root.token,input);
  expect((await f.ledger.parentOptions(parent.token)).children.map(c=>c.id)).toEqual([a.childId]);
  expect(await f.payments.receipts(parent.token,{},a.childId)).toEqual([]);await expect(f.payments.getReceipt(parent.token,receipt.receiptIds[0])).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.app.communication.notifications(parent.token,{})).items.filter(n=>n.kind==='RECEIPT')).toEqual([]);
  await f.children.linkGuardian(f.root.token,b.childId,{expectedChildVersion:2,accountId:a.guardianIds[0],relationship:'Parent',active:true,permissions:{...defaultLinkPermissions,finance:true}});
  expect(await f.payments.receipts(parent.token,{},a.childId)).toHaveLength(1);expect((await f.app.communication.notifications(parent.token,{})).items.filter(n=>n.kind==='RECEIPT')).toHaveLength(1);
 });
});

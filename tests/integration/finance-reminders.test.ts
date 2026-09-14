import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { runReminderBatch,runBillingBatch } from '@nursery/db';
import { cairoIsoDate,monthStart,nextMonth } from '@nursery/domain';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { ReminderService } from '../../apps/api/src/modules/finance/reminders.js';

describe('Phase 15 reminders and explicit blocks on PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 beforeEach(async()=>{f=await financeFixture();});
 afterEach(async()=>{try {expect(await reconcileFinance(f.database)).toEqual([]);}finally {await f.close();}});
 async function overdue(code:string) {
  const c=await f.child(code);const due=await f.ledger.createObligation(f.root.token,{operationId:crypto.randomUUID(),childId:c.childId,categoryId:f.tuition.id,amount:'100',description:'Overdue tuition',sourceReference:crypto.randomUUID(),issuedOn:'2026-01-01',serviceFrom:null,serviceUntil:null,installments:[{dueOn:'2026-01-02',amount:'100'}]});
  const parent=await f.parent(c.guardianIds[0],c.credentials[0].username,c.credentials[0].temporaryPassword);return {...c,due,parent};
 }
 it('D13/A34: concurrent/repeated jobs deduplicate initial notices; explicit resend is idempotent; finance permission and settled balances hide targets',async()=>{
  const c=await overdue('REMIND');const staff=await f.financeStaff([f.a.id]);const foreign=await f.financeStaff([f.b.id]);
  await Promise.all([runReminderBatch(f.database),runReminderBatch(f.database)]);expect(await runReminderBatch(f.database)).toEqual({notices:0});
  const count=async()=>Number((await f.database.pool.query('select count(*) n from finance_reminders')).rows[0].n);expect(await count()).toBe(3);
  const reminders=new ReminderService(f.ledger);expect(await reminders.inbox(foreign.token,{})).toEqual([]);expect(await reminders.inbox(staff.token,{})).toHaveLength(1);
  expect((await f.app.communication.notifications(c.parent.token,{})).items.filter(n=>n.kind==='OVERDUE')).toHaveLength(1);
  const input={operationId:crypto.randomUUID()};const one=await reminders.resend(staff.token,c.due.installmentIds[0],input);expect(one.notices).toBe(3);expect(await reminders.resend(staff.token,c.due.installmentIds[0],input)).toEqual(one);expect(await count()).toBe(6);
  await expect(reminders.resend(foreign.token,c.due.installmentIds[0],{operationId:crypto.randomUUID()})).rejects.toMatchObject({code:'FORBIDDEN'});
  await f.database.pool.query('update guardian_child_links set can_finance=false where guardian_id=$1',[c.guardianIds[0]]);expect((await f.app.communication.notifications(c.parent.token,{})).items).toEqual([]);
  await f.database.pool.query('update guardian_child_links set can_finance=true where guardian_id=$1',[c.guardianIds[0]]);await f.payments.collect(f.root.token,f.collect(c.due.installmentIds[0],'100'));
  expect(await reminders.inbox(staff.token,{})).toEqual([]);const notices=await f.app.communication.notifications(c.parent.token,{});expect(notices.items.filter(n=>n.kind==='OVERDUE')).toEqual([]);expect(notices.items.filter(n=>n.kind==='RECEIPT')).toHaveLength(1);
  expect((await f.database.pool.query('select status from accounts where id=$1',[c.guardianIds[0]])).rows[0].status).toBe('ACTIVE');
 });
 it('finance disable stops reminder generation and current parent notices; no debt, cash, status or seats are changed',async()=>{
  const c=await overdue('DISABLEREMIND');const debt=(await f.ledger.outstanding(f.root.token,{})).totalRemaining;
  const seats=(await f.database.pool.query('select count(*)::int n from seat_reservations where released_at is null')).rows[0].n;
  await f.database.pool.query("update module_settings set enabled=false where module_key='FINANCE'");expect(await runReminderBatch(f.database)).toEqual({notices:0});expect((await f.app.communication.notifications(c.parent.token,{})).items).toEqual([]);
  expect((await f.ledger.outstanding(f.root.token,{})).totalRemaining).toBe(debt);expect((await f.database.pool.query('select count(*)::int n from seat_reservations where released_at is null')).rows[0].n).toBe(seats);
 });
 it('D13: automatic dispatch is bounded to 200; one explicit resend reaches all eligible recipients across batches',async()=>{
  const c=await overdue('BOUNDEDREMINDER');const staff=await f.financeStaff([f.a.id]);
  const role=(await f.database.pool.query<{role_id:string}>('select role_id from account_roles where account_id=$1',[staff.id])).rows[0].role_id;
  const accounts=(await f.database.pool.query<{account_id:string}>(`with created as (insert into accounts(id,kind,username_normalized,password_hash,must_change_password,scope_mode)
   select gen_random_uuid(),'STAFF','notice-fixture-'||n::text,password_hash,false,'BRANCH' from accounts cross join generate_series(1,201) n where id=$1 returning id)
   insert into account_branches(account_id,branch_id) select id,$2 from created returning account_id`,[staff.id,f.a.id])).rows.map(r=>r.account_id);
  await f.database.pool.query('insert into account_roles(account_id,role_id) select unnest($1::uuid[]),$2',[accounts,role]);
  expect(await runReminderBatch(f.database)).toEqual({notices:200});expect(await runReminderBatch(f.database)).toEqual({notices:4});expect(await runReminderBatch(f.database)).toEqual({notices:0});
  expect(await new ReminderService(f.ledger).resend(staff.token,c.due.installmentIds[0],{operationId:crypto.randomUUID()})).toEqual({notices:204});
 });
 it('A06: explicit block closes an existing real SSE stream and rejects receipt/API; monthly billing and debt/seats survive',async()=>{
  const c=await overdue('BLOCKFINANCE');const receipt=await f.payments.collect(f.root.token,f.collect(c.due.installmentIds[0],'40'));
  const agreement=await f.app.billing.draft(f.root.token,{operationId:crypto.randomUUID(),terms:{mode:'MONTHLY',categoryId:f.tuition.id,description:'Continuing tuition',childIds:[c.childId],normalAmount:'100',agreedAmount:'100',startsOn:monthStart(cairoIsoDate()),endsOn:null,firstPeriod:monthStart(cairoIsoDate()),dueDay:1,serviceFrom:null,serviceUntil:null,installments:[]}});
  await f.app.billing.approve(f.root.token,agreement.id,{operationId:crypto.randomUUID(),expectedVersion:1});const before=(await f.ledger.outstanding(f.root.token,{childId:c.childId})).totalRemaining;
  const seats=(await f.database.pool.query('select count(*)::int n from seat_reservations where released_at is null')).rows[0].n;
  const url=await f.app.listen({host:'127.0.0.1',port:0}),abort=new AbortController();const response=await fetch(`${url}/api/v1/parent/live`,{headers:{cookie:`__Host-nursery_session=${c.parent.token}`},signal:abort.signal});expect(response.status).toBe(200);
  const reader=response.body!.getReader(),decoder=new TextDecoder();let wire='';
  const event=async(name:string)=>{const timeout=setTimeout(()=>abort.abort(),6000);try {while(!wire.includes(`event: ${name}`)) {const chunk=await reader.read();if(chunk.done) throw new Error('Unexpected stream closure');wire+=decoder.decode(chunk.value);}}finally {clearTimeout(timeout);}};
  try {
   await event('snapshot');await f.licensing.blockAccount(f.root.token,c.guardianIds[0],{reason:'Manual administration',publicMessage:'Contact the nursery',untilDate:'2026-12-31'});await event('revoked');expect((await reader.read()).done).toBe(true);
   await expect(f.ledger.outstanding(c.parent.token,{childId:c.childId})).rejects.toMatchObject({code:'ACCOUNT_BLOCKED'});
   const download=await f.app.inject({method:'GET',url:`/api/v1/finance/receipts/${receipt.receiptIds[0]}/download`,headers:{cookie:`__Host-nursery_session=${c.parent.token}`}});expect(download.json().code).toBe('ACCOUNT_BLOCKED');
   await runBillingBatch(f.database,nextMonth(monthStart(cairoIsoDate())));expect(BigInt((await f.ledger.outstanding(f.root.token,{childId:c.childId})).totalRemaining)).toBe(BigInt(before)+100n);
   expect((await f.database.pool.query('select count(*)::int n from seat_reservations where released_at is null')).rows[0].n).toBe(seats);
  }finally {abort.abort();await reader.cancel().catch(()=>{});}
 });
});

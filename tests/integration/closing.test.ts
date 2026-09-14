import { afterEach,describe,it,expect } from 'vitest';
import { cairoIsoDate } from '@nursery/domain';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';

describe('Phase 16 immutable counted closing and shared cash protection',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{if(f){expect(await reconcileFinance(f.database)).toEqual([]);await f.close();}});
 async function setup() {f=await financeFixture();const account=await f.treasuryAccount('COUNTED',f.a.id,'CASH','100000');const input={operationId:crypto.randomUUID(),accountId:account.id,on:cairoIsoDate(),countedAmount:'99000',expectedRevision:0,reason:'Actual physical cash count'};return {account,input,c:f.app.closing};}
 async function grant(id:string) {await f.database.pool.query('insert into sensitive_grants(account_id,sensitive_financial_edit) values($1,true) on conflict(account_id) do update set sensitive_financial_edit=true',[id]);}
 it('records expected/counted/difference without cash; only explicit entitled adjustment posts once and leaves count unchanged',async()=>{
  const {account,input,c}=await setup();const count=await c.count(f.root.token,input);expect(count).toMatchObject({expected:'100000',counted:'99000',difference:'-1000',revision:1});expect(await c.count(f.root.token,input)).toEqual(count);
  const before=(await f.database.pool.query('select * from daily_closings')).rows;expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[account.id])).rows[0].balance).toBe('100000');
  const adjust={operationId:crypto.randomUUID(),expectedRevision:1,effectiveOn:cairoIsoDate(),reason:'Explicitly recognize verified shortage'};
  await expect(c.adjust(f.root.token,count.id,adjust)).rejects.toMatchObject({code:'FORBIDDEN'});await grant(f.root.account.id);
  const [a,b]=await Promise.all([c.adjust(f.root.token,count.id,adjust),c.adjust(f.root.token,count.id,adjust)]);expect(a).toEqual(b);expect(a.amount).toBe('-1000');expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[account.id])).rows[0].balance).toBe('99000');expect((await f.database.pool.query('select * from daily_closings')).rows).toEqual(before);
  await expect(c.adjust(f.root.token,count.id,{...adjust,operationId:crypto.randomUUID()})).rejects.toBeDefined();expect((await f.database.pool.query('select count(*)::int n from closing_adjustments')).rows[0].n).toBe(1);
  await f.database.pool.query('update sensitive_grants set sensitive_financial_edit=false where account_id=$1',[f.root.account.id]);await expect(c.adjust(f.root.token,count.id,adjust)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('closing blocks existing payment, credit receipt, expense and transfer backdating with complete rollback, including direct SQL',async()=>{
  const {account,input,c}=await setup();await c.count(f.root.token,{...input,countedAmount:'100000'});const child=await f.child('CLOSED'),charge=await f.charge(child.childId);const receipt=f.collect(charge.installmentIds[0],'10000',f.a.id,account.id);
  await expect(f.payments.collect(f.root.token,receipt)).rejects.toMatchObject({messageKey:'closing.closedDate'});expect((await f.core.operationStatus(f.root.token,receipt.operationId)).status).toBe('NOT_FOUND');
  await expect(f.payments.receiveCredit(f.root.token,{operationId:crypto.randomUUID(),childId:child.childId,accountId:account.id,method:'CASH',amount:'10000',collectedOn:cairoIsoDate(),payerName:'Actual payer',externalReference:'',reason:'Separately confirmed credit',confirmedCredit:true})).rejects.toMatchObject({messageKey:'closing.closedDate'});
  const cat=await f.app.spending.category(f.root.token,{operationId:crypto.randomUUID(),code:'RENT',name:'Rent'}),expense=await f.app.spending.create(f.root.token,{operationId:crypto.randomUUID(),branchId:f.a.id,classroomId:null,categoryId:cat.id,amount:'1000',dueOn:cairoIsoDate(),note:'Unpaid rent'});
  await expect(f.app.spending.pay(f.root.token,expense.id,{operationId:crypto.randomUUID(),accountId:account.id,method:'CASH',paidOn:cairoIsoDate(),externalReference:'',reason:'Recorded rent'})).rejects.toMatchObject({messageKey:'closing.closedDate'});
  await expect(f.app.spending.transfer(f.root.token,{operationId:crypto.randomUUID(),sourceAccountId:account.id,destinationAccountId:f.cashB.id,amount:'1000',effectiveOn:cairoIsoDate(),externalReference:'',reason:'Actual transfer'})).rejects.toMatchObject({messageKey:'closing.closedDate'});
  const newAccount=await f.treasuryAccount('DIRECT-SQL');await c.count(f.root.token,{...input,operationId:crypto.randomUUID(),accountId:newAccount.id,countedAmount:'0'});
  await expect(f.database.pool.query("insert into treasury_movements(id,account_id,kind,amount,effective_on,reason,actor_id) values($1,$2,'OPENING_BALANCE',1,$3,'Invalid backdate',$4)",[crypto.randomUUID(),newAccount.id,'2026-01-01',f.root.account.id])).rejects.toMatchObject({code:'23514'});
  expect((await f.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(0);expect((await f.database.pool.query('select remaining::text from installment_balances where id=$1',[charge.installmentIds[0]])).rows[0].remaining).toBe('10000');
 });
 it('reopen requires capability AND entitlement AND scope; preserves original count, permits reasoned new revision and original operation replay',async()=>{
  const {account,input,c}=await setup(),count=await c.count(f.root.token,input),reopen={operationId:crypto.randomUUID(),expectedRevision:1,reason:'Review authorized recount'};
  const noGrant=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','treasury.close','finance.correct']);await expect(c.reopen(noGrant.token,count.id,reopen)).rejects.toMatchObject({code:'FORBIDDEN'});
  const noCap=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','treasury.close']);await grant(noCap.id);await expect(c.reopen(noCap.token,count.id,reopen)).rejects.toMatchObject({code:'FORBIDDEN'});
  const foreign=await f.financeStaff([f.b.id],[],'BRANCH',['finance.read','treasury.close','finance.correct']);await grant(foreign.id);await expect(c.reopen(foreign.token,count.id,reopen)).rejects.toMatchObject({code:'FORBIDDEN'});
  await grant(noGrant.id);const opened=await c.reopen(noGrant.token,count.id,reopen);expect(opened.revision).toBe(2);expect(await c.reopen(noGrant.token,count.id,reopen)).toEqual(opened);
  const child=await f.child('AFTEROPEN'),charge=await f.charge(child.childId);await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'10000',f.a.id,account.id));
  const recounted=await c.count(f.root.token,{...input,operationId:crypto.randomUUID(),expectedRevision:2,countedAmount:'110000',reason:'Explicit new physical count after reopened posting'});expect(recounted).toMatchObject({revision:3,expected:'110000',difference:'0'});
  const history=await c.list(f.root.token,{accountId:account.id});expect(history.map(h=>h.action)).toEqual(['COUNTED','REOPENED','COUNTED']);expect(history[2]).toMatchObject({expected:'100000',counted:'99000',difference:'-1000'});
  await expect(c.count(f.root.token,{...input,operationId:crypto.randomUUID(),expectedRevision:2})).rejects.toMatchObject({code:'STALE_VERSION'});await expect(f.database.pool.query('update daily_closings set counted=1 where id=$1',[count.id])).rejects.toBeDefined();
 });
 it('an older counted date permits current-date explicit adjustment; later active counts prevent hidden changes and alternative-account count is rejected',async()=>{
  const {account,input,c}=await setup();const yesterday=new Date(cairoIsoDate()+'T00:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);const on=yesterday.toISOString().slice(0,10);const old=await c.count(f.root.token,{...input,on,countedAmount:'100100'});await grant(f.root.account.id);
  const adjust={operationId:crypto.randomUUID(),expectedRevision:1,effectiveOn:cairoIsoDate(),reason:'Current-date identified surplus from original count'};const a=await c.adjust(f.root.token,old.id,adjust);expect(a.amount).toBe('100');
  await expect(c.adjust(f.root.token,old.id,{...adjust,operationId:crypto.randomUUID(),effectiveOn:on})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await c.count(f.root.token,{...input,operationId:crypto.randomUUID(),countedAmount:'100100'});await expect(c.count(f.root.token,{...input,operationId:crypto.randomUUID(),on:'2026-01-01'})).rejects.toMatchObject({messageKey:'closing.closedDate'});
  await expect(c.count(f.root.token,{...input,operationId:crypto.randomUUID(),accountId:f.bankA.id})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  const classroom=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM',['finance.read','treasury.close']);await expect(c.count(classroom.token,input)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(c.list(classroom.token,{})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('PG account locking orders concurrent count and receipt consistently; audit failure rolls back count/adjustment',async()=>{
  const {account,input,c}=await setup();const child=await f.child('CLOSINGRACE'),charge=await f.charge(child.childId);const blocker=await f.database.pool.connect();await blocker.query('begin');await blocker.query('select id from treasury_accounts where id=$1 for update',[account.id]);
  const racing=Promise.allSettled([c.count(f.root.token,input),f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'10000',f.a.id,account.id))]);
  try {await expect.poll(async()=>Number((await f.database.pool.query("select count(*) n from pg_stat_activity where wait_event_type='Lock' and query like 'select id,branch_id,code,type,opened_on%' and pid<>pg_backend_pid()" )).rows[0].n)).toBeGreaterThanOrEqual(1);}finally{await blocker.query('rollback');blocker.release();}
  const [counted,received]=await racing;expect(counted.status).toBe('fulfilled');const expected=received.status==='fulfilled'?'110000':'100000';expect((await c.list(f.root.token,{accountId:account.id}))[0].expected).toBe(expected);expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[account.id])).rows[0].balance).toBe(expected);
  const nextAccount=await f.treasuryAccount('FAIL-CLOSE',f.a.id,'CASH','100000');await f.database.pool.query("alter table financial_audit_events add constraint fail_closing_audit check(action not in ('CASH_COUNT','CASH_DIFFERENCE_ADJUSTMENT')) not valid");await expect(c.count(f.root.token,{...input,operationId:crypto.randomUUID(),accountId:nextAccount.id})).rejects.toBeDefined();expect(await c.list(f.root.token,{accountId:nextAccount.id})).toEqual([]);
  await f.database.pool.query('alter table financial_audit_events drop constraint fail_closing_audit');const next=await c.count(f.root.token,{...input,operationId:crypto.randomUUID(),accountId:nextAccount.id});await grant(f.root.account.id);
  await f.database.pool.query("alter table financial_audit_events add constraint fail_adjustment_audit check(action<>'CASH_DIFFERENCE_ADJUSTMENT') not valid");const correction={operationId:crypto.randomUUID(),expectedRevision:1,effectiveOn:cairoIsoDate(),reason:'Explicit adjustment fails atomically with audit'};
  await expect(c.adjust(f.root.token,next.id,correction)).rejects.toBeDefined();expect((await f.core.operationStatus(f.root.token,correction.operationId)).status).toBe('NOT_FOUND');expect((await f.database.pool.query('select count(*)::int n from closing_adjustments where account_id=$1',[nextAccount.id])).rows[0].n).toBe(0);expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[nextAccount.id])).rows[0].balance).toBe('100000');
 });
});

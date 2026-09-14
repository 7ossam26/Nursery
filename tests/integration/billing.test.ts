import { beforeAll,afterAll,afterEach,describe,it,expect } from 'vitest';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { runBillingBatch } from '@nursery/db';
import type { AgreementTerms } from '@nursery/contracts';
import { cairoIsoDate,monthStart,nextMonth } from '@nursery/domain';
describe('Phase 14 PostgreSQL billing',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 beforeAll(async()=>{f=await financeFixture();});afterAll(async()=>{await f?.close();});
 afterEach(async()=>{expect(await reconcileFinance(f.database)).toEqual([]);});
 const op=()=>crypto.randomUUID();
 function terms(childIds:string[],extra:Partial<AgreementTerms>={}):AgreementTerms {return {mode:'MONTHLY',childIds,categoryId:f.tuition.id,description:'Family tuition',normalAmount:'1000000',agreedAmount:'800000',startsOn:monthStart(cairoIsoDate()),endsOn:null,firstPeriod:monthStart(cairoIsoDate()),dueDay:31,serviceFrom:null,serviceUntil:null,installments:[],...extra};}
 async function approve(t:AgreementTerms) {const a=await f.app.billing.draft(f.root.token,{operationId:op(),terms:t});await f.app.billing.approve(f.root.token,a.id,{operationId:op(),expectedVersion:1});return a;}
 const debt=async(id:string)=>(await f.database.pool.query('select o.amount::text,i.due_on::text,o.service_from::text from recurrence_occurrences r join obligations o on o.id=r.obligation_id join installments i on i.obligation_id=o.id where r.agreement_id=$1 order by r.service_period_start,r.child_id,i.position',[id])).rows;
 it('A13/A14: reviewed drafts create no debt; approval stores stable equal shares with no cash; replay and scope checks',async()=>{
  const a=await f.child('BA'),b=await f.child('BB'),c=await f.child('BC',f.b.id);
  const draft=await f.app.billing.draft(f.root.token,{operationId:op(),terms:terms([b.childId,a.childId])});expect(await debt(draft.id)).toEqual([]);
  const input={operationId:op(),expectedVersion:1};await f.app.billing.approve(f.root.token,draft.id,input);await f.app.billing.approve(f.root.token,draft.id,input);
  expect((await debt(draft.id)).map(r=>r.amount)).toEqual(['400000','400000']);
  const odd=await approve(terms([c.childId,b.childId,a.childId],{agreedAmount:'10001'}));expect((await debt(odd.id)).map(r=>r.amount)).toEqual(['3334','3334','3333']);
  const staff=await f.financeStaff([f.a.id]);await expect(f.app.billing.preview(staff.token,odd.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.app.billing.list(staff.token,{})).some(r=>r.id===odd.id)).toBe(false);
  await expect(f.app.billing.draft(staff.token,{operationId:op(),terms:terms([c.childId])})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.database.pool.query("select count(*)::int n from treasury_movements where kind<>'OPENING_BALANCE'")).rows[0].n).toBe(0);
 });
 it('A16/A17: fixed installment debt is counted once, additional service period never repeats',async()=>{
  const c=await f.child('FIXED');const fixed=await approve(terms([c.childId],{mode:'FIXED',normalAmount:'1200000',agreedAmount:'1200000',firstPeriod:null,dueDay:null,serviceFrom:'2026-01-01',serviceUntil:'2026-12-31',installments:['2026-01-01','2026-05-01','2026-09-01'].map(dueOn=>({dueOn,amount:'400000'}))}));
  expect(await f.ledger.balances(f.root.token,{},c.childId)).toMatchObject({totalRemaining:'1200000'});
  const cat=await f.ledger.category(f.root.token,{operationId:op(),code:'EXTRA',name:'Books',kind:'ADDITIONAL'});
  const extra=await approve(terms([c.childId],{mode:'ADDITIONAL',categoryId:cat.id,normalAmount:'5000',agreedAmount:'5000',firstPeriod:null,dueDay:null,serviceFrom:'2026-01-01',serviceUntil:'2026-12-31',installments:[{dueOn:'2026-01-01',amount:'5000'}]}));
  await runBillingBatch(f.database,'2027-01-01');expect(await debt(fixed.id)).toHaveLength(3);expect(await debt(extra.id)).toHaveLength(1);
  await expect(f.app.billing.draft(f.root.token,{operationId:op(),terms:terms([c.childId],{categoryId:f.bus.id})})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it('A15: duplicate workers contend on real row locks; short months, leap years and bounded restart catch-up',async()=>{
  const c=await f.child('RECUR');const a=await approve(terms([c.childId],{startsOn:'2024-01-20',firstPeriod:'2024-01-01',endsOn:'2026-12-31'}));
  expect(await debt(a.id)).toHaveLength(24);
  const blocker=await f.database.pool.connect();await blocker.query('begin');await blocker.query('select id from children where id=$1 for update',[c.childId]);
  const jobs=Promise.all([runBillingBatch(f.database),runBillingBatch(f.database)]);
  try {await expect.poll(async()=>Number((await f.database.pool.query("select count(*) n from pg_stat_activity where wait_event_type='Lock' and query like 'select c.id from children c join billing_children%'" )).rows[0].n),{timeout:5000}).toBeGreaterThan(0);} finally {await blocker.query('rollback');blocker.release();}
  await jobs;const rows=await debt(a.id);expect(rows.filter(r=>r.service_from==='2024-02-01')[0].due_on).toBe('2024-02-29');expect(rows.filter(r=>r.service_from==='2025-02-01')[0].due_on).toBe('2025-02-28');
  expect(rows).toHaveLength(33);await runBillingBatch(f.database);expect(await debt(a.id)).toHaveLength(33);
 });
 it('future versions, explicit pause intervals, end boundary; published allocations never change',async()=>{
  const c=await f.child('VERSION');const a=await approve(terms([c.childId]));const future=nextMonth(monthStart(cairoIsoDate())),later=nextMonth(future);
  await f.app.billing.price(f.root.token,a.id,{operationId:op(),expectedVersion:2,effectiveFrom:future,price:{normalAmount:'900000',agreedAmount:'700000'},reason:'Confirmed future fee'});
  await f.app.billing.pause(f.root.token,a.id,{operationId:op(),expectedVersion:3,from:later,until:later,reason:'Service paused'});
  await f.app.billing.end(f.root.token,a.id,{operationId:op(),expectedVersion:4,endsOn:nextMonth(nextMonth(later)),reason:'Agreement ends'});
  await runBillingBatch(f.database,nextMonth(nextMonth(later)));
  expect((await debt(a.id)).map(r=>r.amount)).toEqual(['800000','700000','700000']);
  await expect(f.app.billing.price(f.root.token,a.id,{operationId:op(),expectedVersion:5,effectiveFrom:monthStart(cairoIsoDate()),price:{normalAmount:'1',agreedAmount:'1'},reason:'Invalid past change'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it('A06/A31: blocked parent and paused child keep billing; archive ends future generation',async()=>{
  const c=await f.child('BLOCK');const a=await approve(terms([c.childId]));
  await f.licensing.blockAccount(f.root.token,c.guardianIds[0],{reason:'Manual access block',publicMessage:'Contact nursery'});
  await f.children.lifecycle(f.root.token,c.childId,{expectedVersion:1,status:'PAUSED',reason:'Child paused',publicMessage:'Paused'});
  const future=nextMonth(monthStart(cairoIsoDate()));await runBillingBatch(f.database,future);expect(await debt(a.id)).toHaveLength(2);
  await f.children.lifecycle(f.root.token,c.childId,{expectedVersion:2,status:'ARCHIVED',reason:'Child archived',publicMessage:'Archived'});
  await runBillingBatch(f.database,nextMonth(future));expect(await debt(a.id)).toHaveLength(2);
 });
 it('intentional disable retains missing periods pending exact scoped preview approval, stale previews and replay',async()=>{
  const c=await f.child('DISABLED');const a=await approve(terms([c.childId],{startsOn:'2024-01-01',firstPeriod:'2024-01-01'}));
  const module=(await f.licensing.modules(f.root.token)).find(m=>m.moduleKey==='FINANCE')!;
  await f.licensing.saveModuleSetting(f.root.token,'FINANCE',{expectedVersion:module.version,enabled:false,reason:'Intentionally disabled'});
  const before=await debt(a.id);await runBillingBatch(f.database);expect(await debt(a.id)).toEqual(before);
  await expect(f.app.billing.approve(f.root.token,a.id,{operationId:op(),expectedVersion:2})).rejects.toMatchObject({code:'MODULE_DISABLED'});
  // Date fixture: immutable historical settings reflect an intentional January–March outage.
  await f.database.pool.query("insert into module_settings_history(id,module_key,actor_id,previous_enabled,new_enabled,reason,catchup_previewed,created_at) values($1,'FINANCE',$2,true,false,'Historical disable',false,'2026-01-01T00:00:00+02'),($3,'FINANCE',$2,false,true,'Historical reenable',true,'2026-04-01T00:00:00+02')",[op(),f.root.account.id,op()]);
  await f.licensing.saveModuleSetting(f.root.token,'FINANCE',{expectedVersion:module.version+1,enabled:true,reason:'Resume future billing',catchupAcknowledged:true});
  await runBillingBatch(f.database);const preview=await f.app.billing.preview(f.root.token,a.id);expect(preview.periods.map(p=>p.period)).toEqual(['2026-01-01','2026-02-01','2026-03-01','2026-04-01']);
  const input={operationId:op(),expectedVersion:2,previewHash:preview.previewHash};
  await expect(f.app.billing.catchup(f.root.token,a.id,{...input,previewHash:'0'.repeat(64)})).rejects.toMatchObject({code:'STALE_VERSION'});
  await f.app.billing.catchup(f.root.token,a.id,input);await f.app.billing.catchup(f.root.token,a.id,input);
  expect((await f.app.billing.preview(f.root.token,a.id)).periods).toEqual([]);expect(await debt(a.id)).toHaveLength(33);
 });
 it('partial posting failure rolls back approval, obligations, occurrences and operation; retry succeeds',async()=>{
  const c=await f.child('ROLLBACK');const a=await f.app.billing.draft(f.root.token,{operationId:op(),terms:terms([c.childId])});
  await f.database.pool.query("create function billing_test_failure() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger billing_test_failure before insert on recurrence_occurrences for each row execute function billing_test_failure()");
  const input={operationId:op(),expectedVersion:1};await expect(f.app.billing.approve(f.root.token,a.id,input)).rejects.toThrow();expect(await debt(a.id)).toEqual([]);
  expect((await f.database.pool.query('select status,version from billing_agreements where id=$1',[a.id])).rows[0]).toEqual({status:'DRAFT',version:1});
  await f.database.pool.query('drop trigger billing_test_failure on recurrence_occurrences; drop function billing_test_failure()');await f.app.billing.approve(f.root.token,a.id,input);expect(await debt(a.id)).toHaveLength(1);
 });
 it('explicit first-period zero price creates no receipt, later periods retain agreed price; immutable snapshots',async()=>{
  const c=await f.child('FIRST');const a=await approve(terms([c.childId],{firstAgreedAmount:'0'}));
  expect((await debt(a.id)).map(r=>r.amount)).toEqual(['0']);
  await runBillingBatch(f.database,nextMonth(monthStart(cairoIsoDate())));expect((await debt(a.id)).map(r=>r.amount)).toEqual(['0','800000']);
  await expect(f.database.pool.query("update billing_agreements set allocations='[]' where id=$1",[a.id])).rejects.toThrow('immutable');
  await expect(f.database.pool.query('delete from recurrence_occurrences where agreement_id=$1',[a.id])).rejects.toThrow();
 });
 it('concurrent price/pause changes reject stale revisions and repeat authorization after capability loss',async()=>{
  const c=await f.child('AUTH');const a=await approve(terms([c.childId]));const staff=await f.financeStaff([f.a.id]);
  const input={operationId:op(),expectedVersion:2,from:nextMonth(monthStart(cairoIsoDate())),until:nextMonth(monthStart(cairoIsoDate())),reason:'Reviewed pause'};
  const results=await Promise.allSettled([f.app.billing.pause(staff.token,a.id,input),f.app.billing.pause(f.root.token,a.id,{...input,operationId:op()})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'STALE_VERSION'}});
  const current=(await f.database.pool.query('select assignment_version from accounts where id=$1',[staff.id])).rows[0].assignment_version;
  await f.app.organization.assign(f.root.token,staff.id,{expectedVersion:current,roleIds:[],branchIds:[],classroomIds:[],scopeMode:'BRANCH'});
  await expect(f.app.billing.pause(staff.token,a.id,input)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(await f.app.billing.list(f.root.token,{})).toBeDefined();
 });
});



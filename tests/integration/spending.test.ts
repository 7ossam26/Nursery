import { afterEach,describe,expect,it } from 'vitest';
import { cairoIsoDate } from '@nursery/domain';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';

describe('Phase 16 actual expense and transfer sources',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{if(f){expect(await reconcileFinance(f.database)).toEqual([]);await f.close();}});
 const cash=async(id:string)=>(await f.database.pool.query('select balance::text from treasury_balances where id=$1',[id])).rows[0].balance;
 async function setup() {
  f=await financeFixture();const s=f.app.spending;const account=await f.treasuryAccount('FUNDED',f.a.id,'CASH','200000');
  const category=await s.category(f.root.token,{operationId:crypto.randomUUID(),code:'RENT',name:'Operating rent'});
  const draft={operationId:crypto.randomUUID(),branchId:f.a.id,classroomId:null,categoryId:category.id,amount:'100000',dueOn:cairoIsoDate(),note:'Actual pending rent'};
  const expense=await s.create(f.root.token,draft);
  const payment={operationId:crypto.randomUUID(),accountId:account.id,method:'CASH',paidOn:cairoIsoDate(),externalReference:'External spending',reason:'Confirmed actual disbursement'};
  return {s,account,category,draft,expense,payment};
 }
 it('A23/A18: pending debt leaves cash unchanged; same-operation replay and competing settlement post one outflow',async()=>{
  const {s,account,draft,expense,payment}=await setup();expect(await cash(account.id)).toBe('200000');
  expect(await s.create(f.root.token,draft)).toEqual(expense);
  expect(await s.list(f.root.token,{})).toMatchObject({totalPending:'100000',totalPaid:'0',items:[{state:'PENDING'}]});
  const [a,b]=await Promise.all([s.pay(f.root.token,expense.id,payment),s.pay(f.root.token,expense.id,payment)]);expect(a).toEqual(b);
  expect(await f.core.operationStatus(f.root.token,payment.operationId)).toMatchObject({status:'COMMITTED',result:a});expect(await cash(account.id)).toBe('100000');
  await expect(s.pay(f.root.token,expense.id,{...payment,operationId:crypto.randomUUID()})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(s.pay(f.root.token,expense.id,{...payment,reason:'Changed payload'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect((await s.history(f.root.token,expense.id)).settlements).toHaveLength(1);
  expect(await s.list(f.root.token,{})).toMatchObject({totalPending:'0',totalPaid:'100000',items:[{state:'PAID',method:'CASH'}]});
  const draft2={...draft,operationId:crypto.randomUUID()};const next=await s.create(f.root.token,draft2);
  const one=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','expenses.pay']);const two=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','expenses.pay']);
  const blocked=await f.database.pool.connect();await blocked.query('begin');await blocked.query('select id from expenses where id=$1 for update',[next.id]);
  const settling=Promise.allSettled([s.pay(one.token,next.id,{...payment,operationId:crypto.randomUUID()}),s.pay(two.token,next.id,{...payment,operationId:crypto.randomUUID()})]);
  try {await expect.poll(async()=>Number((await f.database.pool.query("select count(*) n from pg_stat_activity where wait_event_type='Lock' and query like 'select id from expenses where id=%' and pid<>pg_backend_pid()" )).rows[0].n)).toBeGreaterThanOrEqual(1);} finally {await blocked.query('rollback');blocked.release();}
  expect((await settling).filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(await cash(account.id)).toBe('0');
 });
 it('threshold 0 is explicitly disabled; over-threshold spending requires scoped configured approval; boundary and stale settings work',async()=>{
  const {s,account,expense,payment,draft}=await setup();const payer=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','expenses.pay']);
  expect((await s.options(payer.token)).settings.approvalThreshold).toBe('0');
  const settings={operationId:crypto.randomUUID(),expectedVersion:1,approvalThreshold:'50000',approvingCapability:'expenses.approve',reason:'Nursery explicitly enabled approval'};
  await s.configure(f.root.token,settings);await expect(s.configure(f.root.token,{...settings,operationId:crypto.randomUUID()})).rejects.toMatchObject({code:'STALE_VERSION'});
  await expect(s.pay(payer.token,expense.id,payment)).rejects.toMatchObject({code:'VALIDATION_ERROR'});expect(await cash(account.id)).toBe('200000');
  await expect(s.act(payer.token,expense.id,'APPROVED',{operationId:crypto.randomUUID(),reason:'No grant'})).rejects.toMatchObject({code:'FORBIDDEN'});
  const outsider=await f.financeStaff([f.b.id],[],'BRANCH',['finance.read','expenses.approve']);await expect(s.act(outsider.token,expense.id,'APPROVED',{operationId:crypto.randomUUID(),reason:'Foreign branch'})).rejects.toMatchObject({code:'FORBIDDEN'});
  const approver=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','expenses.approve']);const approval={operationId:crypto.randomUUID(),reason:'Reviewed actual operating expense'};
  const approved=await s.act(approver.token,expense.id,'APPROVED',approval);expect(await s.act(approver.token,expense.id,'APPROVED',approval)).toEqual(approved);await s.pay(payer.token,expense.id,payment);
  const boundary=await s.create(f.root.token,{...draft,operationId:crypto.randomUUID(),amount:'50000'});await s.pay(payer.token,boundary.id,{...payment,operationId:crypto.randomUUID()});expect(await cash(account.id)).toBe('50000');
  await s.configure(f.root.token,{...settings,operationId:crypto.randomUUID(),expectedVersion:2,approvingCapability:'billing.manage'});
  const extra=await s.create(f.root.token,{...draft,operationId:crypto.randomUUID()});await expect(s.act(approver.token,extra.id,'APPROVED',{operationId:crypto.randomUUID(),reason:'Configured capability was withdrawn'})).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(s.pay(payer.token,extra.id,{...payment,operationId:crypto.randomUUID()})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it('A01/A02: list totals, original classroom, mutation authority, account methods and cancellations cannot bypass scope',async()=>{
  const {s,expense,category,payment,draft}=await setup();const other=await s.create(f.root.token,{...draft,operationId:crypto.randomUUID(),branchId:f.b.id,amount:'300000'});
  const classified=await s.create(f.root.token,{...draft,operationId:crypto.randomUUID(),classroomId:f.classes[0].id,amount:'25000'});
  const teacher=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM',['finance.read','expenses.manage','expenses.pay']);
  expect(await s.list(teacher.token,{branchId:f.a.id,limit:1})).toMatchObject({totalPending:'25000',totalCount:1,items:[{id:classified.id}]});
  await expect(s.pay(teacher.token,expense.id,payment)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(s.history(teacher.token,other.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(s.create(f.root.token,{...draft,operationId:crypto.randomUUID(),classroomId:f.classes[2].id})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(s.pay(f.root.token,expense.id,{...payment,method:'BANK'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(s.pay(f.root.token,expense.id,{...payment,accountId:f.cashB.id})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  const cancelled=await s.act(f.root.token,expense.id,'CANCELLED',{operationId:crypto.randomUUID(),reason:'Unpaid rent request withdrawn'});expect(cancelled.id).toBeTruthy();
  await expect(s.pay(f.root.token,expense.id,payment)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  expect((await s.list(f.root.token,{state:'CANCELLED'})).totalPending).toBe('0');
  await expect(s.category(f.root.token,{operationId:crypto.randomUUID(),code:'SALARY',name:'Manual salary'})).rejects.toBeDefined();expect(category.id).toBeTruthy();
 });
 it('A24: paired atomic transfer conserves total cash, has both-side authority, excludes operating outflows and enforces funding',async()=>{
  const {s,account}=await setup();const input={operationId:crypto.randomUUID(),sourceAccountId:account.id,destinationAccountId:f.cashB.id,amount:'50000',effectiveOn:cairoIsoDate(),reason:'Actual recorded transfer',externalReference:'External transfer'};
  const limited=await f.financeStaff([f.a.id]);await expect(s.transfer(limited.token,input)).rejects.toMatchObject({code:'FORBIDDEN'});
  const before=await f.database.pool.query('select sum(balance)::text n from treasury_balances');
  const [a,b]=await Promise.all([s.transfer(f.root.token,input),s.transfer(f.root.token,input)]);expect(a).toEqual(b);expect(await cash(account.id)).toBe('150000');expect(await cash(f.cashB.id)).toBe('50000');
  expect((await f.database.pool.query('select sum(balance)::text n from treasury_balances')).rows).toEqual(before.rows);
  expect((await f.database.pool.query("select count(*)::int n,sum(amount)::text net from treasury_movements where kind='TRANSFER'")).rows[0]).toEqual({n:2,net:'0'});
  expect((await s.list(f.root.token,{})).totalPaid).toBe('0');expect(await s.transfers(limited.token,{})).toEqual([]);
  await expect(s.transfer(f.root.token,{...input,operationId:crypto.randomUUID(),amount:'150001'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(s.transfer(f.root.token,{...input,operationId:crypto.randomUUID(),destinationAccountId:account.id})).rejects.toBeDefined();
 });
 it('A18/A24: transfer or expense audit failure rolls back every source and movement; ledger rejects incomplete/mismatched legs',async()=>{
  const {s,account,expense,payment}=await setup();
  await f.database.pool.query("create function reject_spending_audit() returns trigger language plpgsql as $$ begin if new.action in ('ACCOUNT_TRANSFER','EXPENSE_PAY') then raise exception 'Injected audit failure'; end if; return new; end $$; create trigger fail_spending_audit before insert on financial_audit_events for each row execute function reject_spending_audit()");
  await expect(s.pay(f.root.token,expense.id,payment)).rejects.toBeDefined();
  const input={operationId:crypto.randomUUID(),sourceAccountId:account.id,destinationAccountId:f.cashB.id,amount:'50000',effectiveOn:cairoIsoDate(),reason:'Recorded movement',externalReference:''};await expect(s.transfer(f.root.token,input)).rejects.toBeDefined();
  expect(await cash(account.id)).toBe('200000');expect(await cash(f.cashB.id)).toBe('0');expect((await f.core.operationStatus(f.root.token,payment.operationId)).status).toBe('NOT_FOUND');
  expect((await f.database.pool.query('select count(*)::int n from expense_settlements')).rows[0].n).toBe(0);expect((await f.database.pool.query('select count(*)::int n from account_transfers')).rows[0].n).toBe(0);
  await f.database.pool.query('drop trigger fail_spending_audit on financial_audit_events');const real=await s.transfer(f.root.token,input);
  await expect(f.database.pool.query("insert into treasury_movements(id,account_id,kind,transfer_id,transfer_leg,amount,effective_on,reason,actor_id) values($1,$2,'TRANSFER',$3,null,1,$4,'Invalid missing leg',$5)",[crypto.randomUUID(),account.id,real.id,cairoIsoDate(),f.root.account.id])).rejects.toMatchObject({code:'23514'});
  await expect(f.database.pool.query('update account_transfers set amount=1 where id=$1',[real.id])).rejects.toBeDefined();
 });
});

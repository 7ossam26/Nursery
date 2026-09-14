import { beforeAll,afterAll,afterEach,describe,it,expect } from 'vitest';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { cairoIsoDate } from '@nursery/domain';
import { defaultLinkPermissions } from '@nursery/contracts';
import { requireSensitiveCorrection } from '../../apps/api/src/modules/organization/policy.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';

describe('Phase 13 real PostgreSQL financial transactions',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 beforeAll(async()=>{f=await financeFixture();});afterAll(async()=>{await f?.close();});
 afterEach(async()=>{expect(await reconcileFinance(f.database)).toEqual([]);});
 const count=async(table:string)=>(await f.database.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n as number;
 const balance=async(id:string)=>(await f.database.pool.query('select remaining::text from obligation_balances where id=$1',[id])).rows[0].remaining as string;
 it('A14/A16/A29: exact large integer strings, subordinate installments, charge creates no cash',async()=>{
  const c=await f.child('MONEY');const cash=await count('treasury_movements');
  const charge=await f.charge(c.childId,'9007199254741001',f.tuition.id,['3002399751580334','3002399751580334','3002399751580333']);
  expect(await balance(charge.id)).toBe('9007199254741001');expect(await count('treasury_movements')).toBe(cash);
  const page=await f.ledger.balances(f.root.token,{},c.childId);expect(page.totalRemaining).toBe('9007199254741001');expect(JSON.stringify(page)).toContain('"amount":"9007199254741001"');
  await expect(f.charge(c.childId,'5',f.tuition.id,['2','2'])).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  const paid=await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'3002399751580334'));
  expect((await f.payments.getReceipt(f.root.token,paid.receiptIds[0])).amount).toBe('3002399751580334');
  expect(await balance(charge.id)).toBe('6004799503160667');
 });
 it('A18: loss after commit, same-key concurrent retry, durable result across app instance and payload conflict',async()=>{
  const c=await f.child('RETRY');const charge=await f.charge(c.childId);const input=f.collect(charge.installmentIds[0]);
  input.operationId=input.operationId.toUpperCase();input.groups[0].branchId=input.groups[0].branchId.toUpperCase();input.groups[0].accountId=input.groups[0].accountId.toUpperCase();input.groups[0].allocations[0].installmentId=input.groups[0].allocations[0].installmentId.toUpperCase();
  const before=await count('receipts');const [a,b]=await Promise.all([f.payments.collect(f.root.token,input),f.payments.collect(f.root.token,input)]);expect(a).toEqual(b);
  expect(await f.core.operationStatus(f.root.token,input.operationId)).toMatchObject({status:'COMMITTED',result:a});
  const {PaymentService}=await import('../../apps/api/src/modules/finance/payments.js');const restarted=new PaymentService(f.core,f.ledger,f.treasury);
  expect(await restarted.collect(f.root.token,input)).toEqual(a);expect(await count('receipts')).toBe(before+1);
  expect(await balance(charge.id)).toBe('0');expect((await f.payments.getReceipt(f.root.token,a.receiptIds[0])).reference).toMatch(/^FIN-\d{12,}$/);
  await expect(f.payments.collect(f.root.token,{...input,externalReference:'changed'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 });
 it('A19: distinct collectors and overlapping reversed-order batches cannot overallocate or deadlock',async()=>{
  const a=await f.child('RACEA'),b=await f.child('RACEB');const ca=await f.charge(a.childId),cb=await f.charge(b.childId);
  const one=await f.financeStaff([f.a.id]),two=await f.financeStaff([f.a.id]);
  const input=f.collect(ca.installmentIds[0]);input.groups[0].amount='20000';input.groups[0].allocations.push({installmentId:cb.installmentIds[0],amount:'10000'});
  const reverse={...input,operationId:crypto.randomUUID(),groups:[{...input.groups[0],allocations:[...input.groups[0].allocations].reverse()}]};
  const blocker=await f.database.pool.connect();await blocker.query('begin');await blocker.query('select id from children where id=any($1::uuid[]) order by id for update',[[a.childId,b.childId].sort()]);
  const collecting=Promise.allSettled([f.payments.collect(one.token,input),f.payments.collect(two.token,reverse)]);
  try {
   await expect.poll(async()=>Number((await f.database.pool.query("select count(*) n from pg_stat_activity where wait_event_type='Lock' and query like 'select id from children where id=any%' and pid<>pg_backend_pid()" )).rows[0].n),{timeout:5000}).toBeGreaterThanOrEqual(1);
  } finally {await blocker.query('rollback');blocker.release();}
  const results=await collecting;
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'VALIDATION_ERROR'}});
  expect(await balance(ca.id)).toBe('0');expect(await balance(cb.id)).toBe('0');
 });
 it('cross-branch grouped receipt commits declared bank/cash legs once and requires every scope',async()=>{
  const a=await f.child('GROUPA'),b=await f.child('GROUPB',f.b.id);const ca=await f.charge(a.childId,'50'),cb=await f.charge(b.childId,'75');
  const input=f.collect(ca.installmentIds[0],'50',f.a.id,f.bankA.id);input.groups.push(f.collect(cb.installmentIds[0],'75',f.b.id,f.cashB.id).groups[0]);
  const staff=await f.financeStaff([f.a.id]);const before=await count('receipts');await expect(f.payments.collect(staff.token,input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(await count('receipts')).toBe(before);
  const cashBefore=(await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.cashA.id])).rows[0].balance;
  const result=await f.payments.collect(f.root.token,input);expect(result.receiptIds).toHaveLength(2);
  const receipts=await Promise.all(result.receiptIds.map(id=>f.payments.getReceipt(f.root.token,id)));expect(receipts.map(r=>r.amount).sort()).toEqual(['50','75']);
  expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.cashA.id])).rows[0].balance).toBe(cashBefore);
  const foreign=receipts.find(r=>r.branchId===f.b.id)!;await expect(f.payments.getReceipt(staff.token,foreign.id)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('A20: bus accepts exact full settlement, duplicate IDs and mismatched method/amount rejected',async()=>{
  const c=await f.child('BUS');const charge=await f.charge(c.childId,'50000',f.bus.id);
  await expect(f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'25000'))).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'50001'))).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  const bad=f.collect(charge.installmentIds[0],'50000');bad.groups[0].method='BANK';await expect(f.payments.collect(f.root.token,bad)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  const duplicate=f.collect(charge.installmentIds[0],'50000');duplicate.groups[0].allocations.push({...duplicate.groups[0].allocations[0]});await expect(f.payments.collect(f.root.token,duplicate)).rejects.toThrow();
  await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'50000'));await expect(f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'50000'))).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 });
 it('failure posting the second grouped branch rolls back the already-inserted first receipt and movement',async()=>{
  const a=await f.child('ROLLA'),b=await f.child('ROLLB',f.b.id);const da=await f.charge(a.childId,'10'),db=await f.charge(b.childId,'20');
  const input=f.collect(da.installmentIds[0],'10');input.groups.push(f.collect(db.installmentIds[0],'20',f.b.id,f.cashB.id).groups[0]);
  const second=[...input.groups].sort((x,y)=>x.branchId.localeCompare(y.branchId))[1].accountId;
  const tables=['receipts','receipt_allocations','treasury_movements','financial_events','financial_audit_events','financial_operations'];const before=await Promise.all(tables.map(count));
  // UUID is generated by the fixture; no request text enters this disposable trigger definition.
  await f.database.pool.query(`create function fail_group_test() returns trigger language plpgsql as $$ begin if new.account_id='${second}'::uuid and new.kind='RECEIPT' then raise exception 'second branch failure'; end if; return new; end $$; create trigger test_group_fail before insert on treasury_movements for each row execute function fail_group_test()`);
  try {await expect(f.payments.collect(f.root.token,input)).rejects.toThrow('second branch failure');} finally {await f.database.pool.query('drop trigger test_group_fail on treasury_movements; drop function fail_group_test()');}
  expect(await Promise.all(tables.map(count))).toEqual(before);expect(await balance(da.id)).toBe('10');expect(await balance(db.id)).toBe('20');
  expect(await f.core.operationStatus(f.root.token,input.operationId)).toEqual({status:'NOT_FOUND'});
 });
 it('replayed collection and operation status recheck revoked historical branch scope',async()=>{
  const c=await f.child('REVOKE');const due=await f.charge(c.childId);const staff=await f.financeStaff([f.a.id]);const input=f.collect(due.installmentIds[0]);await f.payments.collect(staff.token,input);
  const role=await f.app.organization.save(f.root.token,'roles',{name:'Other branch finance',capabilities:['finance.read','payments.record']});
  await f.app.organization.assign(f.root.token,staff.id,{expectedVersion:2,roleIds:[role.id],branchIds:[f.b.id],classroomIds:[],scopeMode:'BRANCH'});
  await expect(f.payments.collect(staff.token,input)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(f.core.operationStatus(staff.token,input.operationId)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it.each(['treasury_movements','financial_audit_events','financial_operations'])('rollback on intermediate %s failure leaves no partial financial rows',async table=>{
  const c=await f.child(`FAIL${table.length}`);const charge=await f.charge(c.childId);const input=f.collect(charge.installmentIds[0]);
  const tables=['receipts','receipt_allocations','treasury_movements','financial_events','financial_audit_events','financial_operations'];const before=await Promise.all(tables.map(count));
  await f.database.pool.query(`create function fail_finance_test() returns trigger language plpgsql as $$ begin raise exception 'simulated storage failure'; end $$; create trigger test_fail before insert on ${table} for each row execute function fail_finance_test()`);
  try {await expect(f.payments.collect(f.root.token,input)).rejects.toThrow('simulated storage failure');} finally {await f.database.pool.query(`drop trigger test_fail on ${table}; drop function fail_finance_test()`);}
  expect(await Promise.all(tables.map(count))).toEqual(before);expect(await balance(charge.id)).toBe('10000');expect(await f.core.operationStatus(f.root.token,input.operationId)).toEqual({status:'NOT_FOUND'});
  await f.payments.collect(f.root.token,input);
 });
 it('explicit credits receive cash once; concurrent applications cannot spend it twice and never post cash',async()=>{
  const c=await f.child('CREDIT');const a=await f.charge(c.childId),b=await f.charge(c.childId);
  const credit=await f.payments.receiveCredit(f.root.token,{operationId:crypto.randomUUID(),childId:c.childId,accountId:f.cashA.id,method:'CASH',amount:'10000',collectedOn:cairoIsoDate(),payerName:'Payer',externalReference:'',reason:'Confirmed credit',confirmedCredit:true});
  const one=await f.financeStaff([f.a.id]),two=await f.financeStaff([f.a.id]);const before=await count('treasury_movements');
  const results=await Promise.allSettled([a,b].map((charge,i)=>f.payments.applyCredit(i?two.token:one.token,{operationId:crypto.randomUUID(),creditId:credit.creditId,appliedOn:cairoIsoDate(),allocations:[{installmentId:charge.installmentIds[0],amount:'10000'}]})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await count('treasury_movements')).toBe(before);
  expect(BigInt(await balance(a.id))+BigInt(await balance(b.id))).toBe(10000n);
 });
 it('A01: branch/classroom/guardian balances, lists, receipts and operation status enforce all scopes',async()=>{
  const c=await f.child('SCOPE',f.a.id,f.classes[1].id),b=await f.child('SCOPB',f.b.id);const aDue=await f.charge(c.childId,'91'),bDue=await f.charge(b.childId,'92');
  const input=f.collect(aDue.installmentIds[0],'1');const receipt=await f.payments.collect(f.root.token,input);
  const staff=await f.financeStaff([f.a.id]);const teacher=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM');
  expect((await f.ledger.balances(staff.token,{},b.childId)).items).toEqual([]);await expect(f.treasury.movements(staff.token,f.cashB.id,{})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.payments.receipts(staff.token,{})).every(r=>r.branchId===f.a.id)).toBe(true);expect((await f.treasury.accounts(staff.token,{})).every(a=>a.branchId===f.a.id)).toBe(true);
  expect((await f.ledger.balances(teacher.token,{},c.childId)).items).toEqual([]);await expect(f.payments.getReceipt(teacher.token,receipt.receiptIds[0])).rejects.toMatchObject({code:'FORBIDDEN'});await expect(f.treasury.accounts(teacher.token,{})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(await f.core.operationStatus(staff.token,input.operationId)).toEqual({status:'NOT_FOUND'});
  const parent=await f.parent(c.guardianIds[0],'parent-scope',c.credentials[0].temporaryPassword);
  expect((await f.ledger.balances(parent.token,{},c.childId)).totalRemaining).toBe('90');await expect(f.ledger.balances(parent.token,{},b.childId)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await f.payments.getReceipt(parent.token,receipt.receiptIds[0])).amount).toBe('1');await expect(f.payments.collect(parent.token,f.collect(bDue.installmentIds[0],'92',f.b.id,f.cashB.id))).rejects.toMatchObject({code:'FORBIDDEN'});
  await f.database.pool.query('update guardian_child_links set can_finance=false where guardian_id=$1',[c.guardianIds[0]]);
  await expect(f.payments.getReceipt(parent.token,receipt.receiptIds[0])).rejects.toMatchObject({code:'FORBIDDEN'});
  const role=await f.app.organization.save(f.root.token,'roles',{name:'Read only finance',capabilities:['finance.read']});await f.app.organization.assign(f.root.token,staff.id,{expectedVersion:2,roleIds:[role.id],branchIds:[f.a.id],classroomIds:[],scopeMode:'BRANCH'});
  await expect(f.payments.collect(staff.token,f.collect(bDue.installmentIds[0],'92',f.b.id,f.cashB.id))).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('sensitive correction requires the explicit grant even for SYSTEM; ledger history is immutable',async()=>{
  await expect(f.children.withPolicy(f.root.token,async(_tx,p)=>requireSensitiveCorrection(p,{branchId:f.a.id}))).rejects.toMatchObject({code:'FORBIDDEN'});
  const staff=await f.financeStaff([f.a.id]);await expect(f.children.withPolicy(staff.token,async(_tx,p)=>requireSensitiveCorrection(p,{branchId:f.a.id}))).rejects.toMatchObject({code:'FORBIDDEN'});
  await f.database.pool.query('insert into sensitive_grants(account_id,sensitive_financial_edit) values($1,true) on conflict(account_id) do update set sensitive_financial_edit=true',[staff.id]);
  await expect(f.children.withPolicy(staff.token,async(_tx,p)=>requireSensitiveCorrection(p,{branchId:f.a.id}))).resolves.toBeUndefined();await expect(f.children.withPolicy(staff.token,async(_tx,p)=>requireSensitiveCorrection(p,{branchId:f.b.id}))).rejects.toMatchObject({code:'FORBIDDEN'});
  for(const table of ['treasury_accounts','treasury_movements','receipts','receipt_allocations','obligations','installments','credits','credit_allocations','financial_audit_events','financial_operations']) await expect(f.database.pool.query(`delete from ${table}`)).rejects.toThrow();
 });
 it('opening/default configuration is explicit, immutable, scoped, idempotent and version checked',async()=>{
  const c=await f.treasuryAccount('SECOND',f.a.id,'CASH','-123');const input={operationId:crypto.randomUUID(),accountId:c.id,expectedVersion:1};
  expect(await f.treasury.setDefault(f.root.token,f.a.id,input)).toEqual({version:2});expect(await f.treasury.setDefault(f.root.token,f.a.id,input)).toEqual({version:2});
  await expect(f.treasury.setDefault(f.root.token,f.a.id,{...input,operationId:crypto.randomUUID()})).rejects.toMatchObject({code:'STALE_VERSION'});
  await expect(f.treasury.setDefault(f.root.token,f.a.id,{...input,operationId:crypto.randomUUID(),accountId:f.bankA.id,expectedVersion:2})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  expect((await f.treasury.accounts(f.root.token,{})).find(a=>a.id===c.id)).toMatchObject({balance:'-123',isDefault:true});
 });
 it('module disable blocks all mutation/replay/guardian finance while staff retains history; HTTP validates auth and exact money',async()=>{
  const c=await f.child('DISABLE');const charge=await f.charge(c.childId);const input=f.collect(charge.installmentIds[0]);const result=await f.payments.collect(f.root.token,input);
  const parent=await f.parent(c.guardianIds[0],'parent-disable',c.credentials[0].temporaryPassword);
  await f.database.pool.query("update module_settings set enabled=false where module_key='FINANCE'");
  try {await expect(f.payments.collect(f.root.token,input)).rejects.toMatchObject({code:'MODULE_DISABLED'});await expect(f.payments.getReceipt(parent.token,result.receiptIds[0])).rejects.toMatchObject({code:'MODULE_DISABLED'});expect((await f.payments.getReceipt(f.root.token,result.receiptIds[0])).amount).toBe('10000');}
  finally {await f.database.pool.query("update module_settings set enabled=true where module_key='FINANCE'");}
  expect((await f.app.inject({method:'POST',url:'/api/v1/payments',payload:input})).statusCode).toBe(403);
  expect((await f.app.inject({url:'/api/v1/finance/receipts'})).statusCode).toBe(401);
  const headers={cookie:`__Host-nursery_session=${f.root.token}`,origin:f.config.appOrigin,'x-csrf-token':keyedHash(f.config.sessionSecret,`session-csrf:${f.root.token}`)};
  const authRead=await f.app.inject({url:`/api/v1/finance/receipts/${result.receiptIds[0]}`,headers});expect(authRead.statusCode).toBe(200);expect(authRead.json().data.amount).toBe('10000');expect(JSON.stringify(authRead.json())).not.toContain('created_at');
  const bad=await f.app.inject({method:'POST',url:'/api/v1/payments',headers,payload:{...input,groups:[{...input.groups[0],amount:10000}]}});expect(bad.statusCode).toBe(400);
 });
 it('A03: grouped receipt is hidden from a guardian lacking any included child finance link',async()=>{
  const a=await f.child('SIBONE');const raw=f.family('SIBTWO');raw.guardians=[{kind:'EXISTING',accountId:a.guardianIds[0]}];raw.children[0].links[0].permissions={...defaultLinkPermissions,finance:false};
  const b=await f.children.onboard(f.root.token,raw);const da=await f.charge(a.childId,'10'),db=await f.charge(b.childIds[0],'20');const input=f.collect(da.installmentIds[0],'10');input.groups[0].amount='30';input.groups[0].allocations.push({installmentId:db.installmentIds[0],amount:'20'});
  const result=await f.payments.collect(f.root.token,input);const parent=await f.parent(a.guardianIds[0],'parent-sibone',a.credentials[0].temporaryPassword);
  await expect(f.payments.getReceipt(parent.token,result.receiptIds[0])).rejects.toMatchObject({code:'FORBIDDEN'});
 });
});

import { it,expect } from 'vitest';
import { financeFixture } from '../helpers/finance.js';
import { startBillingWorker,BILLING_QUEUE } from '../../apps/worker/src/billing.js';
import { monthStart,cairoIsoDate,nextMonth } from '@nursery/domain';
it('pg-boss persists the Cairo schedule, executes startup work, and restarts without duplicate occurrences',async()=>{
 const f=await financeFixture();const schema=`boss_test_${crypto.randomUUID().replaceAll('-','')}`;const errors:Error[]=[];
 let boss:Awaited<ReturnType<typeof startBillingWorker>>|undefined;
 try {
  const c=await f.child('WORKER');const a=await f.app.billing.draft(f.root.token,{operationId:crypto.randomUUID(),terms:{mode:'MONTHLY',categoryId:f.tuition.id,description:'Worker tuition',childIds:[c.childId],normalAmount:'200',agreedAmount:'101',startsOn:'2024-01-01',endsOn:null,firstPeriod:'2024-01-01',dueDay:31,serviceFrom:null,serviceUntil:null,installments:[]}});
  await f.app.billing.approve(f.root.token,a.id,{operationId:crypto.randomUUID(),expectedVersion:1});
  const count=async()=>Number((await f.database.pool.query('select count(*) n from recurrence_occurrences where agreement_id=$1',[a.id])).rows[0].n);
  expect(await count()).toBe(24);
  boss=await startBillingWorker(f.config.databaseUrl,f.database,e=>errors.push(e),schema);
  await expect.poll(count,{timeout:20000}).toBe(33);
  const schedules=await boss.getSchedules();expect(schedules).toMatchObject([{name:BILLING_QUEUE,cron:'* * * * *',timezone:'Africa/Cairo'}]);
  await boss.stop({graceful:true});boss=undefined;
  boss=await startBillingWorker(f.config.databaseUrl,f.database,e=>errors.push(e),schema);
  const job=await boss.send(BILLING_QUEUE,{});
  await expect.poll(async()=> (await boss!.getJobById(BILLING_QUEUE,job!))?.state,{timeout:20000}).toBe('completed');
  expect(await count()).toBe(33);expect(errors).toEqual([]);
  expect((await f.database.pool.query('select next_period::text from billing_agreements where id=$1',[a.id])).rows[0].next_period).toBe(nextMonth(monthStart(cairoIsoDate())));
 } finally {
  await boss?.stop({graceful:true});
  if(!/^boss_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema');
  await f.database.pool.query(`drop schema if exists ${schema} cascade`);await f.close();
 }
},60000);

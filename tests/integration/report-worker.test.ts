import { it,expect } from 'vitest';
import { PgBoss } from 'pg-boss';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cairoIsoDate } from '@nursery/domain';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { installReportWorker,REPORT_QUEUE } from '../../apps/worker/src/reports.js';
it('real pg-boss retries a rolled-back generation, persists its schedule, and restarts idempotently',async()=>{
 const f=await financeFixture(),schema=`boss_reports_${crypto.randomUUID().replaceAll('-','')}`;let boss:PgBoss|undefined;const errors:Error[]=[];
 try {
  const child=await f.child('QUEUE'),charge=await f.charge(child.childId,'12345');await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'12345'));
  const created=await f.app.reports.createExport(f.root.token,{operationId:crypto.randomUUID(),kind:'COLLECTIONS',from:cairoIsoDate(),to:cairoIsoDate(),format:'XLSX'});
  await f.database.pool.query("create function fail_first_export() returns trigger language plpgsql as $$ begin if new.status='READY' and old.attempts=0 then raise exception 'disposable retry fixture'; end if; return new; end $$; create trigger fail_first_export before update on report_exports for each row execute function fail_first_export()");
  boss=new PgBoss({connectionString:f.config.databaseUrl,schema});boss.on('error',e=>errors.push(e));await boss.start();await installReportWorker(boss,f.database,f.config.privateFilesDir);
  await expect.poll(async()=> (await f.database.pool.query('select attempts from report_exports where id=$1',[created.id])).rows[0].attempts,{timeout:20000}).toBe(1);
  expect((await f.app.reports.status(f.root.token,created.id)).status).toBe('PENDING');expect(await readdir(join(f.config.privateFilesDir,'report-exports'))).toEqual([]);
  await expect.poll(async()=>Number((await f.database.pool.query(`select count(*) n from ${schema}.job where name=$1 and state='retry'`,[REPORT_QUEUE])).rows[0].n),{timeout:10000}).toBeGreaterThan(0);
  await expect.poll(async()=> (await f.app.reports.status(f.root.token,created.id)).status,{timeout:60000}).toBe('READY');
  expect((await f.database.pool.query('select attempts,row_count from report_exports where id=$1',[created.id])).rows[0]).toEqual({attempts:2,row_count:1});
  await expect.poll(async()=>Number((await f.database.pool.query(`select count(*) n from ${schema}.job where name=$1 and state='completed' and retry_count>=1`,[REPORT_QUEUE])).rows[0].n),{timeout:20000}).toBeGreaterThan(0);
  expect(await boss.getSchedules()).toEqual(expect.arrayContaining([expect.objectContaining({name:REPORT_QUEUE,cron:'* * * * *',timezone:'Africa/Cairo'})]));
  await boss.stop({graceful:true});boss=undefined;
  boss=new PgBoss({connectionString:f.config.databaseUrl,schema});boss.on('error',e=>errors.push(e));await boss.start();await installReportWorker(boss,f.database,f.config.privateFilesDir);const id=await boss.send(REPORT_QUEUE,{});
  await expect.poll(async()=> (await boss!.getJobById(REPORT_QUEUE,id!))?.state,{timeout:20000}).toBe('completed');
  expect((await f.database.pool.query('select attempts from report_exports where id=$1',[created.id])).rows[0].attempts).toBe(2);expect(await readdir(join(f.config.privateFilesDir,'report-exports'))).toHaveLength(1);expect(errors).toEqual([]);expect(await reconcileFinance(f.database)).toEqual([]);
 } finally {await boss?.stop({graceful:true});if(!/^boss_reports_[a-f0-9]{32}$/.test(schema))throw new Error('Invalid fixture schema');await f.database.pool.query(`drop schema if exists ${schema} cascade`);await f.close();}
},110000);

import type { PgBoss } from 'pg-boss';
import type { Database } from '@nursery/db';
import { createReportWorker } from '@nursery/api/report-worker';
export const REPORT_QUEUE='management-report-exports-v1';
export async function installReportWorker(boss:PgBoss,database:Database,privateFilesDir:string) {const sweep=createReportWorker(database,privateFilesDir);await boss.createQueue(REPORT_QUEUE,{retryLimit:3,retryDelay:30,retryBackoff:true});await boss.work(REPORT_QUEUE,{batchSize:1},async()=>{await sweep();});await boss.schedule(REPORT_QUEUE,'* * * * *',null,{tz:'Africa/Cairo',singletonKey:'export-sweep'});await boss.send(REPORT_QUEUE,{}, {singletonKey:'startup',singletonSeconds:60});}

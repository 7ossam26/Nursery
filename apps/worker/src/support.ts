import type { PgBoss } from 'pg-boss';
import type { Database } from '@nursery/db';
import { createSupportJobs, type SupportLog } from '@nursery/api/support-worker';
import type { AppConfig } from '@nursery/api/config';
export const SUPPORT_QUEUE='installation-support-v1';
export const BACKUP_QUEUE='installation-backups-v1';
// Minute sweep: heartbeat + requested backups/restore validations. Scheduled backups run on BACKUP_SCHEDULE (Cairo);
// singleton keys keep one queued job per kind and the advisory run lock keeps executions from overlapping.
export async function installSupportWorker(boss:PgBoss,database:Database,config:AppConfig,log:SupportLog) {
 const jobs=createSupportJobs(database,config,log);
 await jobs.recoverInterrupted();
 await boss.createQueue(SUPPORT_QUEUE,{retryLimit:2,retryDelay:30,retryBackoff:true});
 await boss.work(SUPPORT_QUEUE,{batchSize:1},async()=>{await jobs.sweep();});
 await boss.schedule(SUPPORT_QUEUE,'* * * * *',null,{tz:'Africa/Cairo',singletonKey:'support-sweep'});
 await boss.send(SUPPORT_QUEUE,{}, {singletonKey:'startup',singletonSeconds:60});
 await boss.createQueue(BACKUP_QUEUE,{retryLimit:0});
 await boss.work(BACKUP_QUEUE,{batchSize:1},async()=>{const result=await jobs.scheduled();log(result.status==='SUCCEEDED'?'info':'warn','scheduled backup finished',result);});
 await boss.schedule(BACKUP_QUEUE,config.backup?.schedule??'0 2 * * *',null,{tz:'Africa/Cairo',singletonKey:'scheduled-backup'});
 return jobs;
}

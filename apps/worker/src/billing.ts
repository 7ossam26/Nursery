import { PgBoss } from 'pg-boss';
import { runBillingBatch,type Database } from '@nursery/db';
export const BILLING_QUEUE='billing-monthly-v1';
export async function startBillingWorker(connectionString:string,database:Database,onError:(error:Error)=>void,schema='pgboss') {
 const boss=new PgBoss({connectionString,schema});boss.on('error',onError);
 await boss.start();
 await boss.createQueue(BILLING_QUEUE,{retryLimit:5,retryDelay:30,retryBackoff:true});
 await boss.work(BILLING_QUEUE,{batchSize:1},async()=>runBillingBatch(database));
 // Minute reconciliation also drains bounded outage batches; eligibility uses Cairo month dates.
 await boss.schedule(BILLING_QUEUE,'* * * * *',null,{tz:'Africa/Cairo',singletonKey:'calendar-sweep'});
 await boss.send(BILLING_QUEUE,{}, {singletonKey:'startup',singletonSeconds:60});
 return boss;
}

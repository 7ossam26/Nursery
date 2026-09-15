import pino from 'pino';
import { assertSchemaCurrent, createDatabase } from '@nursery/db';
import { loadConfig } from '@nursery/api/config';
import { startBillingWorker } from './billing.js';
import { installReportWorker } from './reports.js';
import { installSupportWorker } from './support.js';
const logger=pino({redact:['databaseUrl','token','password']});
// Same validated configuration as the API; the worker also refuses a database that is behind or ahead of its release.
const config=loadConfig();
const database=createDatabase(config.databaseUrl);
const schemaVersion=await assertSchemaCurrent(database.pool,config.installationId);
const boss=await startBillingWorker(config.databaseUrl,database,()=>logger.error('Billing job failed; inspect queue status'));
await installReportWorker(boss,database,config.privateFilesDir);
const support=await installSupportWorker(boss,database,config,(level,message,data)=>logger[level](data??{},message));
logger.info({release:config.releaseVersion,schemaVersion,backupsConfigured:support.configured},'Billing, report and support worker started');
let stopping=false;
const stop=async()=>{
 if(stopping) return;stopping=true;
 const deadline=setTimeout(()=>{logger.warn('worker shutdown deadline reached');process.exit(1);},config.shutdownTimeoutMs??15_000);deadline.unref();
 await boss.stop({graceful:true});await database.close();logger.info('Background worker stopped');process.exit(0);
};
process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});

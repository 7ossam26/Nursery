import type { Database } from '@nursery/db';
import { ReportService } from './service.js';
export function createReportWorker(database:Database,privateFilesDir:string) {const reports=new ReportService(null,privateFilesDir);return ()=>reports.runBatch(database);}

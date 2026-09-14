import { z } from 'zod';

const uuid=z.uuid().transform(v=>v.toLowerCase());
export const reportKinds=['CASH_RESULT','OTHER_INCOME','UNATTRIBUTED_SPENDING','COLLECTIONS','REFUNDS','SPENDING','PENDING_EXPENSES','OUTSTANDING','OVERDUE','ACCOUNTS','TREASURY','TRANSFERS','RECEIVABLE_TRANSFERS','PAYROLL','UNPAID_PAYROLL','CHILDREN','CAPACITY','ATTENDANCE','EXAMS','HOMEWORK','BUS','TRIPS','INCIDENTS','DOCUMENT_EXPIRY'] as const;
export type ReportKind=typeof reportKinds[number];
const reportFilterSchema=z.object({kind:z.enum(reportKinds),from:z.iso.date(),to:z.iso.date(),branchId:uuid.optional(),classroomId:uuid.optional(),categoryId:uuid.optional()}).strict();
export const reportQuerySchema=reportFilterSchema.extend({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).refine(v=>v.from<=v.to);
export const reportExportInputSchema=reportFilterSchema.extend({format:z.enum(['PDF','XLSX']),operationId:uuid,locale:z.enum(['en','ar-EG']).default('en')}).refine(v=>v.from<=v.to);
export type ReportQuery=z.infer<typeof reportQuerySchema>;
export type ReportExportInput=z.infer<typeof reportExportInputSchema>;
export type ReportRow={id:string;date:string|null;branchId:string;classroomId:string|null;childId:string|null;label:string;category:string|null;amount:string|null;details:Record<string,string|null>};
export type ReportPage={kind:ReportKind;from:string;to:string;rows:ReportRow[];totalCount:number;totals:Record<string,string>;warnings:string[]};
export type ReportExport={id:string;status:'PENDING'|'READY'|'FAILED'|'EXPIRED';format:'PDF'|'XLSX';expiresAt:string;rowCount:number|null;error:string|null};
export type ReportOptions={kinds:ReportKind[];branches:{id:string;name:string}[];classrooms:{id:string;branchId:string;name:string}[];categories:{id:string;name:string;kinds:ReportKind[]}[];maxExportRows:number};

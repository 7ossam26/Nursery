import { z } from 'zod';

const max = 9223372036854775807n;
const uuid = z.uuid().transform(value=>value.toLowerCase());
export const amountSchema = z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v => /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v)<=max);
export const positiveAmountSchema = amountSchema.refine(v => v!=='0');
export const signedAmountSchema = z.string().regex(/^(0|-?[1-9][0-9]{0,18})$/).refine(v => /^(0|-?[1-9][0-9]{0,18})$/.test(v) && BigInt(v)>=-max && BigInt(v)<=max);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/);
const label = z.string().trim().min(1).max(120);
export const accountTypeSchema = z.enum(['CASH','BANK','WALLET']);
export const treasuryAccountInputSchema = z.object({ operationId: uuid,branchId: uuid,code,name: label,type: accountTypeSchema,openingAmount: signedAmountSchema,openedOn: z.iso.date(),reason: z.string().trim().min(1).max(500) }).strict();
export const treasuryDefaultInputSchema = z.object({ operationId: uuid,accountId: uuid,expectedVersion: z.number().int().positive() }).strict();
export const feeCategoryInputSchema = z.object({ operationId: uuid,code,name: label,kind: z.enum(['TUITION','BUS','TRIP','ADDITIONAL']) }).strict();
export const obligationInputSchema = z.object({ operationId: uuid,childId: uuid,categoryId: uuid,amount: amountSchema,description: label,sourceReference: label,issuedOn: z.iso.date(),serviceFrom: z.iso.date().nullable(),serviceUntil: z.iso.date().nullable(),installments: z.array(z.object({ dueOn: z.iso.date(),amount: amountSchema }).strict()).min(1).max(120) }).strict()
  .refine(v => (v.serviceFrom===null && v.serviceUntil===null) || (v.serviceFrom!==null && v.serviceUntil!==null && v.serviceUntil>=v.serviceFrom));
const allocationSchema = z.object({ installmentId: uuid,amount: positiveAmountSchema }).strict();
export const collectionInputSchema = z.object({ operationId: uuid,collectedOn: z.iso.date(),payerName: label,externalReference: z.string().trim().max(120),groups: z.array(z.object({ branchId: uuid,accountId: uuid,method: accountTypeSchema,amount: positiveAmountSchema,allocations: z.array(allocationSchema).min(1).max(100) }).strict()).min(1).max(20) }).strict()
  .refine(v => new Set(v.groups.map(g=>g.branchId)).size===v.groups.length)
  .refine(v => { const ids=v.groups.flatMap(g=>g.allocations.map(a=>a.installmentId)); return new Set(ids).size===ids.length; });
export const creditReceiptInputSchema = z.object({ operationId: uuid,childId: uuid,accountId: uuid,method: accountTypeSchema,amount: positiveAmountSchema,collectedOn: z.iso.date(),payerName: label,externalReference: z.string().trim().max(120),reason: z.string().trim().min(1).max(500),confirmedCredit: z.literal(true) }).strict();
export const applyCreditInputSchema = z.object({ operationId: uuid,creditId: uuid,appliedOn: z.iso.date(),allocations: z.array(allocationSchema).min(1).max(100) }).strict().refine(v=>new Set(v.allocations.map(a=>a.installmentId)).size===v.allocations.length);
export const financeQuerySchema = z.object({ branchId: uuid.optional(),limit: z.coerce.number().int().min(1).max(50).default(50),offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type CreditReceiptInput = z.infer<typeof creditReceiptInputSchema>;
export type TreasuryAccount = { id: string;branchId: string;code: string;name: string;type: z.infer<typeof accountTypeSchema>;openedOn: string;balance: string;isDefault: boolean;defaultVersion: number };
export type FinanceOptions = { branches: { id: string;code: string;name: string }[];canManage: boolean };
export type Receipt = { id: string;reference: string;branchId: string;branchCode: string;accountId: string;accountCode: string;method: z.infer<typeof accountTypeSchema>;collectedOn: string;payerName: string;externalReference: string;amount: string;kind: 'PAYMENT'|'CREDIT';lines: { childId: string;childCode: string;childName: string;classroomId: string|null;installmentId: string|null;categoryName: string;amount: string }[] };
export type PaymentResult = { operationId: string;receiptIds: string[] };
export const outstandingQuerySchema = z.object({
  branchId: uuid.optional(),classroomId: uuid.optional(),categoryId: uuid.optional(),childId: uuid.optional(),
  status: z.enum(['UNPAID','PARTIAL','PAID']).optional(),timing: z.enum(['OVERDUE','UPCOMING']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();
export type OutstandingItem = {
  id:string;obligationId:string;childId:string;childCode:string;childName:string;branchId:string;classroomId:string|null;
  categoryId:string;categoryName:string;categoryKind:'TUITION'|'BUS'|'TRIP'|'ADDITIONAL';description:string;
  dueOn:string;amount:string;allocated:string;credited:string;adjustments:string;remaining:string;
  status:'UNPAID'|'PARTIAL'|'PAID';overdue:boolean;
};
export type OutstandingPage = {items:OutstandingItem[];totalRemaining:string;totalCount:number};
export type CollectionOptions = {
  canCollect:boolean;canRemind:boolean;scopeMode:'BRANCH'|'CLASSROOM';branches:{id:string;code:string;name:string}[];
  classrooms:{id:string;branchId:string;name:string}[];categories:{id:string;name:string}[];
  accounts:{id:string;branchId:string;code:string;name:string;type:'CASH'|'BANK'|'WALLET';isDefault:boolean}[];
};

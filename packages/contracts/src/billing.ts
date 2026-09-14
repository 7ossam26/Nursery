import { z } from 'zod';
import { amountSchema } from './finance.js';
const id=z.uuid().transform(v=>v.toLowerCase());
export const billingMonthSchema=z.iso.date().refine(v=>v.endsWith('-01'));
const price=z.object({normalAmount:amountSchema,agreedAmount:amountSchema}).strict().refine(v=>BigInt(v.agreedAmount)<=BigInt(v.normalAmount));
export const agreementTermsSchema=z.object({
 mode:z.enum(['MONTHLY','FIXED','ADDITIONAL']),categoryId:id,description:z.string().trim().min(1).max(120),
 childIds:z.array(id).min(1).max(20).refine(v=>new Set(v).size===v.length),
 normalAmount:amountSchema,agreedAmount:amountSchema,startsOn:z.iso.date(),endsOn:z.iso.date().nullable(),
 firstAgreedAmount:amountSchema.nullable().optional(),
 firstPeriod:billingMonthSchema.nullable(),dueDay:z.number().int().min(1).max(31).nullable(),
 installments:z.array(z.object({dueOn:z.iso.date(),amount:amountSchema}).strict()).max(120),
 serviceFrom:z.iso.date().nullable(),serviceUntil:z.iso.date().nullable()
}).strict().superRefine((v,ctx)=>{
 const bad=()=>ctx.addIssue({code:'custom',message:'Invalid agreement terms'});
 if(BigInt(v.agreedAmount)>BigInt(v.normalAmount)) bad();
 if(v.firstAgreedAmount!=null&&(v.mode!=='MONTHLY'||BigInt(v.firstAgreedAmount)>BigInt(v.normalAmount))) bad();
 if(v.endsOn && v.endsOn<v.startsOn) bad();
 if((v.serviceFrom===null)!==(v.serviceUntil===null) || (v.serviceFrom&&v.serviceUntil&&v.serviceUntil<v.serviceFrom)) bad();
 if(v.mode==='MONTHLY') {if(!v.firstPeriod||!v.dueDay||v.installments.length||v.firstPeriod.slice(0,7)!==v.startsOn.slice(0,7)||v.serviceFrom||v.serviceUntil) bad();}
 else {
  if(v.firstPeriod||v.dueDay||!v.installments.length||v.installments.reduce((s,i)=>s+BigInt(i.amount),0n)!==BigInt(v.agreedAmount)) bad();
  if(v.mode==='FIXED'&&(!v.serviceFrom||!v.serviceUntil)) bad();
  if(v.mode==='ADDITIONAL'&&(v.childIds.length!==1||v.installments.length!==1||v.normalAmount!==v.agreedAmount)) bad();
 }
});
export const agreementDraftSchema=z.object({operationId:id,terms:agreementTermsSchema}).strict();
export const agreementActionSchema=z.object({operationId:id,expectedVersion:z.number().int().positive()}).strict();
export const agreementPriceSchema=agreementActionSchema.extend({effectiveFrom:billingMonthSchema,price,reason:z.string().trim().min(1).max(500)}).strict();
export const agreementPauseSchema=agreementActionSchema.extend({from:billingMonthSchema,until:billingMonthSchema,reason:z.string().trim().min(1).max(500)}).strict().refine(v=>v.until>=v.from);
export const agreementEndSchema=agreementActionSchema.extend({endsOn:z.iso.date(),reason:z.string().trim().min(1).max(500)}).strict();
export const agreementCatchupSchema=agreementActionSchema.extend({previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type AgreementTerms=z.infer<typeof agreementTermsSchema>;
export type BillingAllocation={childId:string;amount:string;installments:{dueOn:string;amount:string}[]};
export type BillingAgreement={id:string;version:number;status:'DRAFT'|'APPROVED';terms:AgreementTerms;allocations:BillingAllocation[];firstAllocations:BillingAllocation[]|null};
export type CatchupPreview={previewHash:string;periods:{period:string;allocations:BillingAllocation[]}[]};

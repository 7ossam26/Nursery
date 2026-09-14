import { z } from 'zod';
import { amountSchema } from './finance.js';

const uuid=z.uuid().transform(v=>v.toLowerCase());
const text=z.string().trim().min(1).max(500);
const title=z.string().trim().min(1).max(160);
const ids=z.array(uuid).min(1).max(100).refine(v=>new Set(v).size===v.length);
export const busSubscriptionInputSchema=z.object({operationId:uuid,childId:uuid,categoryId:uuid,periodStart:z.iso.date(),periodEnd:z.iso.date(),amount:amountSchema,dueOn:z.iso.date(),administrativePermission:z.boolean()}).strict().refine(v=>v.periodEnd>=v.periodStart&&v.dueOn<=v.periodEnd);
export const busPermissionInputSchema=z.object({operationId:uuid,expectedVersion:z.number().int().positive(),enabled:z.boolean(),reason:text}).strict();
export const activityCreateInputSchema=z.object({operationId:uuid,branchId:uuid,categoryId:uuid,title,details:text,eventDate:z.iso.date(),fee:amountSchema,dueOn:z.iso.date(),childIds:ids}).strict().refine(v=>v.dueOn<=v.eventDate);
export const activityConsentInputSchema=z.object({operationId:uuid,consented:z.boolean(),reason:text}).strict();
export const activityCancelInputSchema=z.object({operationId:uuid,reason:text}).strict();
export const transportQuerySchema=z.object({branchId:uuid.optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict();
export type BusSubscriptionInput=z.infer<typeof busSubscriptionInputSchema>;
export type TransportOptions={modules:{transport:boolean;activities:boolean;finance:boolean};branches:{id:string;code:string;name:string}[];children:{id:string;code:string;fullName:string;branchId:string;classroomId:string|null}[];categories:{id:string;code:string;name:string;kind:'BUS'|'TRIP'}[]};
export type BusSubscription={id:string;childId:string;childCode:string;childName:string;branchId:string;periodStart:string;periodEnd:string;amount:string;administrativePermission:boolean;paid:boolean;noFee:boolean;eligible:boolean;version:number;obligationId:string|null;installmentId:string|null};
export type ActivityRosterItem={childId:string;childCode:string;childName:string;classroomId:string|null;paid:boolean;noFee:boolean;consented:boolean;participating:boolean;obligationId:string|null;installmentId:string|null};
export type Activity={id:string;branchId:string;title:string;details:string;eventDate:string;fee:string;status:'ACTIVE'|'CANCELLED';items:ActivityRosterItem[]};

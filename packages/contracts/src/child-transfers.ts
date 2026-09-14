import { z } from 'zod';
const uuid=z.uuid().transform(v=>v.toLowerCase());
export const childTransferPreviewSchema=z.object({childId:uuid,sourceBranchId:uuid,destinationBranchId:uuid,destinationClassroomId:uuid.nullable(),effectiveOn:z.iso.date(),expectedVersion:z.number().int().positive()}).strict();
export const childTransferInputSchema=childTransferPreviewSchema.extend({operationId:uuid,reason:z.string().trim().min(1).max(500)}).strict();
export type ChildTransferInput=z.infer<typeof childTransferInputSchema>;
export type ChildTransferPreview={childId:string;childCode:string;childName:string;sourceBranchId:string;destinationBranchId:string;sourceClassroomId:string|null;destinationClassroomId:string|null;effectiveOn:string;amount:string;items:{installmentId:string;obligationId:string;categoryName:string;dueOn:string;remaining:string}[];warnings:string[]};
export type ChildTransferRecord=Omit<ChildTransferPreview,'warnings'|'items'>&{id:string;sourceBranchCode:string;destinationBranchCode:string;reason:string;actor:string;items:ChildTransferPreview['items']};
export type ChildTransferPage={items:ChildTransferRecord[];totalIn:string;totalOut:string;totalCount:number};

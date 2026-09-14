import { z } from 'zod';
import { accountTypeSchema,positiveAmountSchema } from './finance.js';

const uuid=z.uuid().transform(v=>v.toLowerCase());
const reason=z.string().trim().min(1).max(500);
const externalReference=z.string().trim().max(120);
const base={operationId:uuid,effectiveOn:z.iso.date(),reason};
const allocation=z.object({installmentId:uuid,amount:positiveAmountSchema}).strict();
export const receiptCorrectionInputSchema=z.object({...base,replacement:z.object({accountId:uuid,method:accountTypeSchema,amount:positiveAmountSchema,payerName:z.string().trim().min(1).max(120),externalReference,allocations:z.array(allocation).min(1).max(100)}).strict().nullable()}).strict();
export const expenseCorrectionInputSchema=z.object({...base,replacement:z.object({accountId:uuid,method:accountTypeSchema,amount:positiveAmountSchema,externalReference}).strict().nullable()}).strict();
export const transferCorrectionInputSchema=z.object({...base,replacement:z.object({sourceAccountId:uuid,destinationAccountId:uuid,amount:positiveAmountSchema,externalReference}).strict().refine(v=>v.sourceAccountId!==v.destinationAccountId).nullable()}).strict();
export const tuitionReductionInputSchema=z.object({...base,reductionAmount:positiveAmountSchema}).strict();
export const refundInputSchema=z.object({operationId:uuid,creditId:uuid,creditOriginId:uuid,accountId:uuid,method:accountTypeSchema,amount:positiveAmountSchema,refundedOn:z.iso.date(),reason,externalReference,alternativeAccountConfirmed:z.boolean()}).strict();

export type CorrectionAccount={id:string;branchId:string;code:string;name:string;type:'CASH'|'BANK'|'WALLET';balance:string};
export type CorrectionReceipt={id:string;reference:string;branchId:string;accountId:string;accountCode:string;amount:string;collectedOn:string;payerName:string;allocations:{id:string;installmentId:string;amount:string;activeAmount:string;childId:string;childCode:string;childName:string;classroomId:string|null;categoryName:string}[]};
export type CorrectionExpense={id:string;settlementId:string;branchId:string;classroomId:string|null;categoryName:string;plannedAmount:string;paidAmount:string;accountId:string;accountCode:string;paidOn:string};
export type CorrectionTransfer={id:string;sourceAccountId:string;destinationAccountId:string;sourceCode:string;destinationCode:string;amount:string;effectiveOn:string};
export type CorrectionTuition={installmentId:string;branchId:string;classroomId:string|null;childId:string;childCode:string;childName:string;categoryName:string;dueOn:string;effectiveAmount:string;remaining:string;paid:string;credited:string};
export type RefundableCredit={id:string;childId:string;childCode:string;childName:string;branchId:string;amount:string;remaining:string;createdOn:string;reason:string;origins:{id:string;receiptId:string;receiptReference:string;accountId:string;accountCode:string;amount:string;remaining:string}[]};
export type RefundRecord={id:string;creditId:string;childCode:string;childName:string;amount:string;refundedOn:string;originalReceiptReference:string;originalAccountCode:string;fundingAccountCode:string;reason:string};
export type FinancialCorrectionRecord={id:string;targetKind:'RECEIPT'|'EXPENSE'|'TRANSFER'|'TUITION'|'TRIP';targetId:string;action:'REVERSAL'|'REPLACEMENT'|'REDUCTION';effectiveOn:string;reason:string;actor:string};
export type CorrectionOptions={canCorrect:boolean;accounts:CorrectionAccount[];receipts:CorrectionReceipt[];expenses:CorrectionExpense[];transfers:CorrectionTransfer[];tuition:CorrectionTuition[];credits:RefundableCredit[]};
